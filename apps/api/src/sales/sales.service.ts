import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePriceListDto,
  CreateQuoteDto,
  CreateSalesOrderDto,
  CreateDeliveryDto,
} from './dto/create-sales.dto';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  // ── Dashboard ────────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, companyId: string) {
    const [totalQuotes, totalOrders, openOrders, pendingDeliveries] = await Promise.all([
      this.prisma.salesQuote.count({ where: { tenantId, companyId } }),
      this.prisma.salesOrder.count({ where: { tenantId, companyId } }),
      this.prisma.salesOrder.count({ where: { tenantId, companyId, status: { in: ['APPROVED', 'PARTIAL'] } } }),
      this.prisma.delivery.count({ where: { tenantId, companyId, status: 'DRAFT' } }),
    ]);

    const revenueByMonth = await this.prisma.salesOrder.groupBy({
      by: ['orderDate'],
      where: { tenantId, companyId, status: { not: 'CANCELLED' } },
      _sum: { total: true },
    });

    return { totalQuotes, totalOrders, openOrders, pendingDeliveries, revenueByMonth };
  }

  // ── Price Lists ───────────────────────────────────────────────────────────────

  async getPriceLists(tenantId: string, companyId: string) {
    return this.prisma.priceList.findMany({
      where: { tenantId, companyId, isActive: true },
      include: { _count: { select: { items: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getPriceList(tenantId: string, companyId: string, id: string) {
    const pl = await this.prisma.priceList.findFirst({
      where: { id, tenantId, companyId },
      include: { items: { include: { item: true } } },
    });
    if (!pl) throw new NotFoundException('Price list not found');
    return pl;
  }

  async createPriceList(tenantId: string, companyId: string, dto: CreatePriceListDto) {
    const { validFrom, validTo, items, ...rest } = dto;
    return this.prisma.priceList.create({
      data: {
        tenantId, companyId,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validTo: validTo ? new Date(validTo) : undefined,
        ...rest,
        items: { create: items.map(({ minQty, ...i }) => ({ ...i, minQty: minQty ?? 0 })) },
      },
      include: { items: { include: { item: true } } },
    });
  }

  // ── Quotes ────────────────────────────────────────────────────────────────────

  async getQuotes(tenantId: string, companyId: string, params: { status?: string; customerId?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId };
    if (params.status) where.status = params.status;
    if (params.customerId) where.customerId = params.customerId;

    const [data, total] = await Promise.all([
      this.prisma.salesQuote.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { customer: true, opportunity: true, _count: { select: { lines: true } } },
      }),
      this.prisma.salesQuote.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getQuote(tenantId: string, companyId: string, id: string) {
    const quote = await this.prisma.salesQuote.findFirst({
      where: { id, tenantId, companyId },
      include: { customer: true, opportunity: true, lines: { include: { item: true }, orderBy: { lineNumber: 'asc' } } },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  async createQuote(tenantId: string, companyId: string, userId: string, dto: CreateQuoteDto) {
    const { quoteDate, validUntil, lines, ...rest } = dto;

    const lineTotal = lines.reduce((sum, l) => {
      const base = l.qty * l.unitPrice;
      const disc = base * ((l.discount ?? 0) / 100);
      return sum + base - disc;
    }, 0);

    return this.prisma.salesQuote.create({
      data: {
        tenantId, companyId, createdBy: userId,
        quoteDate: new Date(quoteDate),
        validUntil: validUntil ? new Date(validUntil) : undefined,
        subtotal: lineTotal,
        total: lineTotal,
        ...rest,
        lines: {
          create: lines.map((l) => {
            const base = l.qty * l.unitPrice;
            const disc = base * ((l.discount ?? 0) / 100);
            return { ...l, discount: l.discount ?? 0, lineTotal: base - disc };
          }),
        },
      },
      include: { customer: true, lines: { include: { item: true }, orderBy: { lineNumber: 'asc' } } },
    });
  }

  async approveQuote(tenantId: string, companyId: string, userId: string, id: string) {
    const quote = await this.getQuote(tenantId, companyId, id);
    if (quote.status !== 'DRAFT') throw new BadRequestException('Quote already approved');
    return this.prisma.salesQuote.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: userId, approvedAt: new Date() },
    });
  }

  async convertQuoteToOrder(tenantId: string, companyId: string, userId: string, id: string, orderNumber: string) {
    const quote = await this.getQuote(tenantId, companyId, id);
    if (quote.status !== 'APPROVED') throw new BadRequestException('Quote must be approved before converting');

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.create({
        data: {
          tenantId, companyId, createdBy: userId,
          customerId: quote.customerId,
          quoteId: quote.id,
          number: orderNumber,
          orderDate: new Date(),
          currency: quote.currency,
          subtotal: quote.subtotal,
          discountAmount: quote.discountAmount,
          taxAmount: quote.taxAmount,
          total: quote.total,
          lines: {
            create: quote.lines.map((l) => ({
              itemId: l.itemId,
              description: l.description,
              qty: l.qty,
              uom: l.uom,
              unitPrice: l.unitPrice,
              discount: l.discount,
              taxCode: l.taxCode,
              taxAmount: l.taxAmount,
              lineTotal: l.lineTotal,
              lineNumber: l.lineNumber,
            })),
          },
        },
        include: { customer: true, lines: { include: { item: true }, orderBy: { lineNumber: 'asc' } } },
      });

      await tx.salesQuote.update({ where: { id }, data: { status: 'CONVERTED' } });
      return order;
    });
  }

  // ── Sales Orders ──────────────────────────────────────────────────────────────

  async getOrders(tenantId: string, companyId: string, params: { status?: string; customerId?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId };
    if (params.status) where.status = params.status;
    if (params.customerId) where.customerId = params.customerId;

    const [data, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { customer: true, _count: { select: { lines: true, deliveries: true } } },
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getOrder(tenantId: string, companyId: string, id: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId, companyId },
      include: {
        customer: true,
        quote: true,
        lines: { include: { item: true }, orderBy: { lineNumber: 'asc' } },
        deliveries: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    return order;
  }

  async createOrder(tenantId: string, companyId: string, userId: string, dto: CreateSalesOrderDto) {
    const { orderDate, requestedDate, lines, ...rest } = dto;

    const lineTotal = lines.reduce((sum, l) => {
      const base = l.qty * l.unitPrice;
      const disc = base * ((l.discount ?? 0) / 100);
      return sum + base - disc;
    }, 0);

    return this.prisma.salesOrder.create({
      data: {
        tenantId, companyId, createdBy: userId,
        orderDate: new Date(orderDate),
        requestedDate: requestedDate ? new Date(requestedDate) : undefined,
        subtotal: lineTotal,
        total: lineTotal,
        ...rest,
        lines: {
          create: lines.map((l) => {
            const base = l.qty * l.unitPrice;
            const disc = base * ((l.discount ?? 0) / 100);
            return { ...l, discount: l.discount ?? 0, lineTotal: base - disc };
          }),
        },
      },
      include: { customer: true, lines: { include: { item: true }, orderBy: { lineNumber: 'asc' } } },
    });
  }

  async approveOrder(tenantId: string, companyId: string, userId: string, id: string) {
    const order = await this.getOrder(tenantId, companyId, id);
    if (order.status !== 'DRAFT') throw new BadRequestException('Order already approved');
    return this.prisma.salesOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: userId, approvedAt: new Date() },
    });
  }

  // ── Deliveries ────────────────────────────────────────────────────────────────

  async getDeliveries(tenantId: string, companyId: string, params: { soId?: string; status?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId };
    if (params.soId) where.soId = params.soId;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.delivery.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { so: { include: { customer: true } }, warehouse: true, _count: { select: { lines: true } } },
      }),
      this.prisma.delivery.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getDelivery(tenantId: string, companyId: string, id: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: { id, tenantId, companyId },
      include: {
        so: { include: { customer: true } },
        warehouse: true,
        lines: { include: { item: true }, orderBy: { lineNumber: 'asc' } },
      },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  async createDelivery(tenantId: string, companyId: string, userId: string, dto: CreateDeliveryDto) {
    const { deliveryDate, lines, ...rest } = dto;
    return this.prisma.delivery.create({
      data: {
        tenantId, companyId, createdBy: userId,
        deliveryDate: new Date(deliveryDate),
        ...rest,
        lines: { create: lines },
      },
      include: {
        so: { include: { customer: true } },
        warehouse: true,
        lines: { include: { item: true }, orderBy: { lineNumber: 'asc' } },
      },
    });
  }

  async postDelivery(tenantId: string, companyId: string, userId: string, id: string) {
    const delivery = await this.getDelivery(tenantId, companyId, id);
    if (delivery.status !== 'DRAFT') throw new BadRequestException('Delivery already posted');

    return this.prisma.$transaction(async (tx) => {
      for (const line of delivery.lines) {
        const itemId = line.itemId;
        const warehouseId = delivery.warehouseId;
        const qty = Number(line.qty);

        const existing = await tx.stockLevel.findUnique({
          where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId, warehouseId } },
        });
        const currentQty = existing ? Number(existing.qty) : 0;
        const newQty = currentQty - qty;

        if (newQty < 0) throw new BadRequestException(`Insufficient stock for item ${itemId}`);

        if (existing) {
          await tx.stockLevel.update({
            where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId, warehouseId } },
            data: { qty: newQty },
          });
        }

        await tx.stockMovement.create({
          data: {
            tenantId, companyId, itemId, warehouseId,
            movementType: 'DISPATCH',
            reference: delivery.number,
            qty, unitCost: 0, totalCost: 0,
            qtyBefore: currentQty, qtyAfter: newQty,
            createdBy: userId,
            notes: `Delivery: ${delivery.number}`,
          },
        });

        if (line.soLineId) {
          await tx.sOLine.update({
            where: { id: line.soLineId },
            data: { qtyDelivered: { increment: qty } },
          });
        }
      }

      // Update SO status
      const so = await tx.salesOrder.findUnique({
        where: { id: delivery.soId },
        include: { lines: true },
      });
      if (so) {
        const allDelivered = so.lines.every((l) => Number(l.qtyDelivered) >= Number(l.qty));
        await tx.salesOrder.update({
          where: { id: so.id },
          data: { status: allDelivered ? 'DELIVERED' : 'PARTIAL' },
        });
      }

      return tx.delivery.update({
        where: { id },
        data: { status: 'POSTED', postedBy: userId, postedAt: new Date() },
      });
    });
  }
}
