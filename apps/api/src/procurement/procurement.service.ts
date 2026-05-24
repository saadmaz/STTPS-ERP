import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePRDto, CreatePODto, CreateGRNDto } from './dto/create-pr.dto';

@Injectable()
export class ProcurementService {
  constructor(private prisma: PrismaService) {}

  // ── Purchase Requisitions ────────────────────────────────────────────────────

  async getPRs(tenantId: string, companyId: string, params: { status?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;
    const where: any = { tenantId, companyId };
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.purchaseRequisition.findMany({
        where,
        include: { lines: { include: { item: true } }, _count: { select: { lines: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseRequisition.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getPR(tenantId: string, companyId: string, id: string) {
    const pr = await this.prisma.purchaseRequisition.findFirst({
      where: { id, tenantId, companyId },
      include: { lines: { include: { item: true } }, purchaseOrders: true },
    });
    if (!pr) throw new NotFoundException('PR not found');
    return pr;
  }

  async createPR(tenantId: string, companyId: string, userId: string, dto: CreatePRDto) {
    const { number, requestDate, requiredDate, notes, lines } = dto;

    return this.prisma.purchaseRequisition.create({
      data: {
        tenantId, companyId,
        number,
        requestDate: new Date(requestDate),
        requiredDate: requiredDate ? new Date(requiredDate) : undefined,
        notes,
        requestedBy: userId,
        lines: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            description: l.description,
            qty: l.qty,
            uom: l.uom || 'EA',
            estUnitCost: l.estUnitCost || 0,
            estTotal: l.qty * (l.estUnitCost || 0),
            lineNumber: l.lineNumber,
          })),
        },
      },
      include: { lines: { include: { item: true } } },
    });
  }

  async approvePR(tenantId: string, companyId: string, userId: string, id: string) {
    const pr = await this.getPR(tenantId, companyId, id);
    if (pr.status !== 'DRAFT') throw new BadRequestException('PR is not in DRAFT status');

    return this.prisma.purchaseRequisition.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: userId, approvedAt: new Date() },
    });
  }

  // ── Purchase Orders ──────────────────────────────────────────────────────────

  async getPOs(tenantId: string, companyId: string, params: { status?: string; vendorId?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;
    const where: any = { tenantId, companyId };
    if (params.status) where.status = params.status;
    if (params.vendorId) where.vendorId = params.vendorId;

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: { vendor: true, lines: { include: { item: true } }, _count: { select: { goodsReceipts: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getPO(tenantId: string, companyId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId, companyId },
      include: {
        vendor: true,
        pr: true,
        lines: { include: { item: true } },
        goodsReceipts: { include: { lines: { include: { item: true } } } },
        apInvoices: true,
      },
    });
    if (!po) throw new NotFoundException('PO not found');
    return po;
  }

  async createPO(tenantId: string, companyId: string, userId: string, dto: CreatePODto) {
    const { vendorId, prId, number, orderDate, expectedDate, currency, notes, lines } = dto;

    const subtotal = lines.reduce((sum, l) => sum + l.qty * (l.unitPrice || 0), 0);

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId, companyId, vendorId,
        prId: prId || undefined,
        number,
        orderDate: new Date(orderDate),
        expectedDate: expectedDate ? new Date(expectedDate) : undefined,
        currency: currency || 'USD',
        subtotal,
        total: subtotal,
        notes,
        createdBy: userId,
        lines: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            description: l.description,
            qty: l.qty,
            uom: l.uom || 'EA',
            unitPrice: l.unitPrice || 0,
            taxCode: l.taxCode,
            lineTotal: l.qty * (l.unitPrice || 0),
            lineNumber: l.lineNumber,
          })),
        },
      },
      include: { vendor: true, lines: { include: { item: true } } },
    });
  }

  async approvePO(tenantId: string, companyId: string, userId: string, id: string) {
    const po = await this.getPO(tenantId, companyId, id);
    if (po.status !== 'DRAFT') throw new BadRequestException('PO is not in DRAFT status');

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: userId, approvedAt: new Date() },
    });
  }

  // ── Goods Receipts ───────────────────────────────────────────────────────────

  async getGRNs(tenantId: string, companyId: string, params: { poId?: string; status?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;
    const where: any = { tenantId, companyId };
    if (params.poId) where.poId = params.poId;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where,
        include: { po: { include: { vendor: true } }, lines: { include: { item: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getGRN(tenantId: string, companyId: string, id: string) {
    const grn = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId, companyId },
      include: { po: { include: { vendor: true } }, lines: { include: { item: true } } },
    });
    if (!grn) throw new NotFoundException('GRN not found');
    return grn;
  }

  async createGRN(tenantId: string, companyId: string, userId: string, dto: CreateGRNDto) {
    const { poId, warehouseId, number, receiptDate, notes, lines } = dto;

    const po = await this.prisma.purchaseOrder.findFirst({ where: { id: poId, tenantId, companyId } });
    if (!po) throw new NotFoundException('PO not found');
    if (!['APPROVED', 'PARTIAL'].includes(po.status)) {
      throw new BadRequestException('PO must be in APPROVED or PARTIAL status to receive goods');
    }

    return this.prisma.$transaction(async (tx) => {
      const grn = await tx.goodsReceipt.create({
        data: {
          tenantId, companyId, poId, warehouseId, number,
          receiptDate: new Date(receiptDate),
          notes,
          createdBy: userId,
          status: 'DRAFT',
          lines: {
            create: lines.map((l) => ({
              itemId: l.itemId,
              poLineId: l.poLineId,
              qty: l.qty,
              unitCost: l.unitCost || 0,
              totalCost: l.qty * (l.unitCost || 0),
              locationId: l.locationId,
              lineNumber: l.lineNumber,
            })),
          },
        },
        include: { lines: { include: { item: true } }, po: { include: { vendor: true } } },
      });
      return grn;
    });
  }

  async postGRN(tenantId: string, companyId: string, userId: string, id: string) {
    const grn = await this.getGRN(tenantId, companyId, id);
    if (grn.status !== 'DRAFT') throw new BadRequestException('GRN already posted');

    return this.prisma.$transaction(async (tx) => {
      // Update PO lines received quantities
      for (const line of grn.lines) {
        if (line.poLineId) {
          await tx.pOLine.updateMany({
            where: { id: line.poLineId },
            data: { qtyReceived: { increment: Number(line.qty) } },
          });
        }

        // Update stock levels
        const existing = await tx.stockLevel.findUnique({
          where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId: line.itemId, warehouseId: grn.warehouseId } },
        });
        const currentQty = existing ? Number(existing.qty) : 0;
        const newQty = currentQty + Number(line.qty);

        if (existing) {
          await tx.stockLevel.update({
            where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId: line.itemId, warehouseId: grn.warehouseId } },
            data: { qty: newQty },
          });
        } else {
          await tx.stockLevel.create({
            data: { tenantId, companyId, itemId: line.itemId, warehouseId: grn.warehouseId, qty: newQty, avgCost: Number(line.unitCost) },
          });
        }

        // Create stock movement
        await tx.stockMovement.create({
          data: {
            tenantId, companyId, itemId: line.itemId, warehouseId: grn.warehouseId,
            movementType: 'RECEIPT',
            reference: grn.number,
            qty: Number(line.qty),
            unitCost: Number(line.unitCost),
            totalCost: Number(line.totalCost),
            qtyBefore: currentQty,
            qtyAfter: newQty,
            createdBy: userId,
            notes: `GRN: ${grn.number}`,
          },
        });
      }

      // Check if PO is fully received
      const poLines = await tx.pOLine.findMany({ where: { poId: grn.poId } });
      const allReceived = poLines.every((l) => Number(l.qtyReceived) >= Number(l.qty));
      const anyReceived = poLines.some((l) => Number(l.qtyReceived) > 0);

      await tx.purchaseOrder.update({
        where: { id: grn.poId },
        data: { status: allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'APPROVED' },
      });

      return tx.goodsReceipt.update({
        where: { id },
        data: { status: 'POSTED', postedBy: userId, postedAt: new Date() },
      });
    });
  }

  // ── Vendors (pass-through for procurement context) ───────────────────────────

  async getVendors(tenantId: string, companyId: string, params: { search?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;
    const where: any = { tenantId, companyId, isActive: true };
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.vendor.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      this.prisma.vendor.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getDashboard(tenantId: string, companyId: string) {
    const [pendingPRs, pendingPOs, openPOs, recentGRNs] = await Promise.all([
      this.prisma.purchaseRequisition.count({ where: { tenantId, companyId, status: 'DRAFT' } }),
      this.prisma.purchaseOrder.count({ where: { tenantId, companyId, status: 'DRAFT' } }),
      this.prisma.purchaseOrder.count({ where: { tenantId, companyId, status: { in: ['APPROVED', 'PARTIAL'] } } }),
      this.prisma.goodsReceipt.count({ where: { tenantId, companyId, status: 'POSTED' } }),
    ]);

    return { pendingPRs, pendingPOs, openPOs, recentGRNs };
  }
}
