import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBOMDto,
  CreateWorkCenterDto,
  CreateRoutingDto,
  CreateProductionOrderDto,
  RecordProductionDto,
  RunMRPDto,
} from './dto/create-manufacturing.dto';

@Injectable()
export class ManufacturingService {
  constructor(private prisma: PrismaService) {}

  // ── Dashboard ────────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, companyId: string) {
    const [totalBOMs, totalWorkCenters, openOrders, draftMRPs] = await Promise.all([
      this.prisma.billOfMaterials.count({ where: { tenantId, companyId, isActive: true } }),
      this.prisma.workCenter.count({ where: { tenantId, companyId, isActive: true } }),
      this.prisma.productionOrder.count({ where: { tenantId, companyId, status: { in: ['RELEASED', 'IN_PROGRESS'] } } }),
      this.prisma.mRPPlan.count({ where: { tenantId, companyId, status: 'DRAFT' } }),
    ]);

    const ordersByStatus = await this.prisma.productionOrder.groupBy({
      by: ['status'],
      where: { tenantId, companyId },
      _count: true,
    });

    const recentOrders = await this.prisma.productionOrder.findMany({
      where: { tenantId, companyId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { item: true },
    });

    return { totalBOMs, totalWorkCenters, openOrders, draftMRPs, ordersByStatus, recentOrders };
  }

  // ── BOM ──────────────────────────────────────────────────────────────────────

  async getBOMs(tenantId: string, companyId: string, params: { itemId?: string; status?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId };
    if (params.itemId) where.itemId = params.itemId;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.billOfMaterials.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { item: true, _count: { select: { lines: true } } },
      }),
      this.prisma.billOfMaterials.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getBOM(tenantId: string, companyId: string, id: string) {
    const bom = await this.prisma.billOfMaterials.findFirst({
      where: { id, tenantId, companyId },
      include: { item: true, lines: { include: { item: true }, orderBy: { lineNumber: 'asc' } } },
    });
    if (!bom) throw new NotFoundException('BOM not found');
    return bom;
  }

  async createBOM(tenantId: string, companyId: string, dto: CreateBOMDto) {
    const { validFrom, validTo, lines, ...rest } = dto;
    return this.prisma.billOfMaterials.create({
      data: {
        tenantId, companyId,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validTo: validTo ? new Date(validTo) : undefined,
        ...rest,
        lines: { create: lines },
      },
      include: { item: true, lines: { include: { item: true }, orderBy: { lineNumber: 'asc' } } },
    });
  }

  async activateBOM(tenantId: string, companyId: string, id: string) {
    await this.getBOM(tenantId, companyId, id);
    return this.prisma.billOfMaterials.update({
      where: { id },
      data: { status: 'ACTIVE', isActive: true },
    });
  }

  // ── Work Centers ──────────────────────────────────────────────────────────────

  async getWorkCenters(tenantId: string, companyId: string) {
    return this.prisma.workCenter.findMany({
      where: { tenantId, companyId, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async createWorkCenter(tenantId: string, companyId: string, dto: CreateWorkCenterDto) {
    return this.prisma.workCenter.create({ data: { tenantId, companyId, ...dto } });
  }

  // ── Routings ──────────────────────────────────────────────────────────────────

  async getRoutings(tenantId: string, companyId: string) {
    return this.prisma.routing.findMany({
      where: { tenantId, companyId, isActive: true },
      include: { _count: { select: { operations: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async getRouting(tenantId: string, companyId: string, id: string) {
    const routing = await this.prisma.routing.findFirst({
      where: { id, tenantId, companyId },
      include: { operations: { include: { workCenter: true }, orderBy: { sequence: 'asc' } } },
    });
    if (!routing) throw new NotFoundException('Routing not found');
    return routing;
  }

  async createRouting(tenantId: string, companyId: string, dto: CreateRoutingDto) {
    const { operations, ...rest } = dto;
    return this.prisma.routing.create({
      data: {
        tenantId, companyId, ...rest,
        operations: { create: operations },
      },
      include: { operations: { include: { workCenter: true }, orderBy: { sequence: 'asc' } } },
    });
  }

  // ── Production Orders ──────────────────────────────────────────────────────────

  async getOrders(tenantId: string, companyId: string, params: { status?: string; itemId?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId };
    if (params.status) where.status = params.status;
    if (params.itemId) where.itemId = params.itemId;

    const [data, total] = await Promise.all([
      this.prisma.productionOrder.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { item: true, _count: { select: { components: true, operations: true } } },
      }),
      this.prisma.productionOrder.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getOrder(tenantId: string, companyId: string, id: string) {
    const order = await this.prisma.productionOrder.findFirst({
      where: { id, tenantId, companyId },
      include: {
        item: true,
        bom: true,
        components: { include: { item: true }, orderBy: { lineNumber: 'asc' } },
        operations: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Production order not found');
    return order;
  }

  async createOrder(tenantId: string, companyId: string, userId: string, dto: CreateProductionOrderDto) {
    const { plannedStart, plannedEnd, components, bomId, ...rest } = dto;

    let orderComponents = components;

    // If bomId provided and no components, auto-populate from BOM
    if (bomId && components.length === 0) {
      const bom = await this.prisma.billOfMaterials.findFirst({
        where: { id: bomId, tenantId, companyId },
        include: { lines: true },
      });
      if (bom) {
        const baseQty = Number(bom.baseQty);
        const ratio = dto.plannedQty / baseQty;
        orderComponents = bom.lines.map((l, i) => ({
          itemId: l.itemId,
          description: l.description ?? undefined,
          requiredQty: Number(l.qty) * ratio,
          uom: l.uom,
          lineNumber: l.lineNumber ?? i + 1,
        }));
      }
    }

    return this.prisma.productionOrder.create({
      data: {
        tenantId, companyId, createdBy: userId,
        bomId: bomId || undefined,
        plannedStart: plannedStart ? new Date(plannedStart) : undefined,
        plannedEnd: plannedEnd ? new Date(plannedEnd) : undefined,
        ...rest,
        components: { create: orderComponents },
      },
      include: { item: true, components: { include: { item: true }, orderBy: { lineNumber: 'asc' } } },
    });
  }

  async releaseOrder(tenantId: string, companyId: string, userId: string, id: string) {
    const order = await this.getOrder(tenantId, companyId, id);
    if (order.status !== 'DRAFT') throw new BadRequestException('Order already released');
    return this.prisma.productionOrder.update({
      where: { id },
      data: { status: 'RELEASED', releasedBy: userId, releasedAt: new Date() },
    });
  }

  async recordProduction(tenantId: string, companyId: string, userId: string, id: string, dto: RecordProductionDto) {
    const order = await this.getOrder(tenantId, companyId, id);
    if (!['RELEASED', 'IN_PROGRESS'].includes(order.status)) {
      throw new BadRequestException('Order must be released before recording production');
    }

    const { producedQty, scrapQty = 0, warehouseId, notes } = dto;
    const newProduced = Number(order.producedQty) + producedQty;
    const newScrap = Number(order.scrapQty) + scrapQty;
    const isComplete = newProduced >= Number(order.plannedQty);

    return this.prisma.$transaction(async (tx) => {
      // Issue components (proportional to produced qty)
      if (warehouseId) {
        const ratio = producedQty / Number(order.plannedQty);
        for (const comp of order.components) {
          const issueQty = Number(comp.requiredQty) * ratio;
          const existing = await tx.stockLevel.findUnique({
            where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId: comp.itemId, warehouseId } },
          });
          const currentQty = existing ? Number(existing.qty) : 0;
          const newQty = currentQty - issueQty;
          if (newQty < 0) throw new BadRequestException(`Insufficient stock for component ${comp.itemId}`);
          if (existing) {
            await tx.stockLevel.update({
              where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId: comp.itemId, warehouseId } },
              data: { qty: newQty },
            });
          }
          await tx.stockMovement.create({
            data: {
              tenantId, companyId, itemId: comp.itemId, warehouseId,
              movementType: 'ISSUE',
              reference: order.number,
              qty: issueQty, unitCost: 0, totalCost: 0,
              qtyBefore: currentQty, qtyAfter: newQty,
              createdBy: userId,
              notes: `Production issue: ${order.number}`,
            },
          });
        }

        // GR for finished goods
        const fgExisting = await tx.stockLevel.findUnique({
          where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId: order.itemId, warehouseId } },
        });
        const fgCurrent = fgExisting ? Number(fgExisting.qty) : 0;
        const fgNew = fgCurrent + producedQty;
        if (fgExisting) {
          await tx.stockLevel.update({
            where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId: order.itemId, warehouseId } },
            data: { qty: fgNew },
          });
        } else {
          await tx.stockLevel.create({
            data: { tenantId, companyId, itemId: order.itemId, warehouseId, qty: fgNew },
          });
        }
        await tx.stockMovement.create({
          data: {
            tenantId, companyId, itemId: order.itemId, warehouseId,
            movementType: 'RECEIPT',
            reference: order.number,
            qty: producedQty, unitCost: 0, totalCost: 0,
            qtyBefore: fgCurrent, qtyAfter: fgNew,
            createdBy: userId,
            notes: `Production receipt: ${order.number}`,
          },
        });
      }

      return tx.productionOrder.update({
        where: { id },
        data: {
          producedQty: newProduced,
          scrapQty: newScrap,
          status: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
          actualStart: order.status === 'RELEASED' ? new Date() : order.actualStart,
          actualEnd: isComplete ? new Date() : undefined,
          closedBy: isComplete ? userId : undefined,
          closedAt: isComplete ? new Date() : undefined,
        },
      });
    });
  }

  // ── MRP ───────────────────────────────────────────────────────────────────────

  async getMRPPlans(tenantId: string, companyId: string) {
    return this.prisma.mRPPlan.findMany({
      where: { tenantId, companyId },
      include: { _count: { select: { proposals: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMRPPlan(tenantId: string, companyId: string, id: string) {
    const plan = await this.prisma.mRPPlan.findFirst({
      where: { id, tenantId, companyId },
      include: { proposals: { include: { item: true }, orderBy: { plannedStart: 'asc' } } },
    });
    if (!plan) throw new NotFoundException('MRP plan not found');
    return plan;
  }

  async runMRP(tenantId: string, companyId: string, userId: string, dto: RunMRPDto) {
    // Gather demand from open sales orders
    const openOrders = await this.prisma.salesOrder.findMany({
      where: { tenantId, companyId, status: { in: ['APPROVED', 'PARTIAL'] } },
      include: { lines: true },
    });

    // Aggregate demand by item
    const demand = new Map<string, { qty: number; requestedDate: Date }>();
    for (const so of openOrders) {
      for (const line of so.lines) {
        const itemId = line.itemId;
        const remaining = Number(line.qty) - Number(line.qtyDelivered);
        if (remaining <= 0) continue;
        const existing = demand.get(itemId);
        const date = so.requestedDate ?? so.orderDate;
        if (existing) {
          existing.qty += remaining;
          if (new Date(date) < existing.requestedDate) existing.requestedDate = new Date(date);
        } else {
          demand.set(itemId, { qty: remaining, requestedDate: new Date(date) });
        }
      }
    }

    // Check current stock and BOM coverage
    const proposals: { itemId: string; orderType: string; requiredQty: number; plannedStart: Date; plannedEnd: Date }[] = [];

    for (const [itemId, { qty, requestedDate }] of demand) {
      const stock = await this.prisma.stockLevel.findMany({
        where: { tenantId, companyId, itemId },
      });
      const onHand = stock.reduce((sum, s) => sum + Number(s.qty), 0);
      const shortage = qty - onHand;
      if (shortage <= 0) continue;

      // Check if item has a BOM (manufactured) or is purchased
      const bom = await this.prisma.billOfMaterials.findFirst({
        where: { tenantId, companyId, itemId, isActive: true },
      });

      const plannedEnd = requestedDate;
      const plannedStart = new Date(requestedDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days lead time

      proposals.push({
        itemId,
        orderType: bom ? 'PRODUCTION' : 'PURCHASE',
        requiredQty: shortage,
        plannedStart,
        plannedEnd,
      });
    }

    return this.prisma.mRPPlan.create({
      data: {
        tenantId, companyId, createdBy: userId,
        reference: dto.reference,
        runDate: new Date(),
        planType: dto.planType ?? 'FULL',
        notes: dto.notes,
        status: 'DRAFT',
        proposals: {
          create: proposals.map((p) => ({
            tenantId, companyId,
            itemId: p.itemId,
            orderType: p.orderType,
            requiredQty: p.requiredQty,
            plannedStart: p.plannedStart,
            plannedEnd: p.plannedEnd,
          })),
        },
      },
      include: { proposals: { include: { item: true }, orderBy: { plannedStart: 'asc' } } },
    });
  }
}
