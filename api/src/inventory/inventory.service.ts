import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateItemDto,
  CreateItemCategoryDto,
  CreateWarehouseDto,
  CreateStorageLocationDto,
  CreateStockMovementDto,
  CreateStockCountDto,
} from './dto/create-item.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // ── Categories ──────────────────────────────────────────────────────────────

  async getCategories(tenantId: string, companyId: string) {
    return this.prisma.itemCategory.findMany({
      where: { tenantId, companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(tenantId: string, companyId: string, userId: string, dto: CreateItemCategoryDto) {
    return this.prisma.itemCategory.create({
      data: { tenantId, companyId, ...dto },
    });
  }

  // ── Items ────────────────────────────────────────────────────────────────────

  async getItems(tenantId: string, companyId: string, params: { page?: number; limit?: number; search?: string; categoryId?: string }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId, isActive: true };
    if (params.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.categoryId) where.categoryId = params.categoryId;

    const [data, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        include: { category: true, stockLevels: { include: { warehouse: true } } },
        skip,
        take: limit,
        orderBy: { code: 'asc' },
      }),
      this.prisma.item.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getItem(tenantId: string, companyId: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, tenantId, companyId },
      include: {
        category: true,
        stockLevels: { include: { warehouse: true, location: true } },
      },
    });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  async createItem(tenantId: string, companyId: string, userId: string, dto: CreateItemDto) {
    return this.prisma.item.create({
      data: { tenantId, companyId, ...dto },
      include: { category: true },
    });
  }

  async updateItem(tenantId: string, companyId: string, id: string, dto: Partial<CreateItemDto>) {
    await this.getItem(tenantId, companyId, id);
    return this.prisma.item.update({ where: { id }, data: dto });
  }

  // ── Warehouses ───────────────────────────────────────────────────────────────

  async getWarehouses(tenantId: string, companyId: string) {
    return this.prisma.warehouse.findMany({
      where: { tenantId, companyId, isActive: true },
      include: { locations: true, _count: { select: { stockLevels: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createWarehouse(tenantId: string, companyId: string, dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({
      data: { tenantId, companyId, ...dto },
    });
  }

  async createLocation(dto: CreateStorageLocationDto) {
    return this.prisma.storageLocation.create({ data: dto });
  }

  // ── Stock Levels ─────────────────────────────────────────────────────────────

  async getStockLevels(tenantId: string, companyId: string, params: { warehouseId?: string; itemId?: string }) {
    const where: any = { tenantId, companyId };
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.itemId) where.itemId = params.itemId;

    return this.prisma.stockLevel.findMany({
      where,
      include: { item: true, warehouse: true, location: true },
      orderBy: [{ warehouse: { name: 'asc' } }, { item: { code: 'asc' } }],
    });
  }

  // ── Stock Movements ──────────────────────────────────────────────────────────

  async getMovements(tenantId: string, companyId: string, params: { itemId?: string; warehouseId?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;
    const where: any = { tenantId, companyId };
    if (params.itemId) where.itemId = params.itemId;
    if (params.warehouseId) where.warehouseId = params.warehouseId;

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: { item: true, warehouse: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createMovement(tenantId: string, companyId: string, userId: string, dto: CreateStockMovementDto) {
    const { itemId, warehouseId, movementType, qty, unitCost = 0, reference, notes } = dto;

    return this.prisma.$transaction(async (tx) => {
      // Upsert stock level
      const existing = await tx.stockLevel.findUnique({
        where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId, warehouseId } },
      });

      const currentQty = existing ? Number(existing.qty) : 0;
      const isInbound = ['RECEIPT', 'RETURN', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'OPENING'].includes(movementType);
      const newQty = isInbound ? currentQty + qty : currentQty - qty;

      if (!isInbound && newQty < 0) {
        throw new BadRequestException('Insufficient stock');
      }

      const totalCost = qty * unitCost;

      if (existing) {
        await tx.stockLevel.update({
          where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId, warehouseId } },
          data: { qty: newQty },
        });
      } else {
        await tx.stockLevel.create({
          data: { tenantId, companyId, itemId, warehouseId, qty: newQty, avgCost: unitCost },
        });
      }

      return tx.stockMovement.create({
        data: {
          tenantId, companyId, itemId, warehouseId, movementType, reference,
          qty, unitCost, totalCost, qtyBefore: currentQty, qtyAfter: newQty, notes, createdBy: userId,
        },
        include: { item: true, warehouse: true },
      });
    });
  }

  // ── Stock Counts ─────────────────────────────────────────────────────────────

  async getStockCounts(tenantId: string, companyId: string) {
    return this.prisma.stockCount.findMany({
      where: { tenantId, companyId },
      include: { warehouse: true, _count: { select: { lines: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStockCount(tenantId: string, companyId: string, id: string) {
    const sc = await this.prisma.stockCount.findFirst({
      where: { id, tenantId, companyId },
      include: { warehouse: true, lines: { include: { item: true } } },
    });
    if (!sc) throw new NotFoundException('Stock count not found');
    return sc;
  }

  async createStockCount(tenantId: string, companyId: string, userId: string, dto: CreateStockCountDto) {
    const { warehouseId, reference, countDate, notes, lines } = dto;

    // Get current stock levels to set systemQty
    const stockLevels = await this.prisma.stockLevel.findMany({
      where: { tenantId, companyId, warehouseId },
    });
    const stockMap = new Map<string, number>(stockLevels.map((s) => [s.itemId, Number(s.qty)]));

    return this.prisma.stockCount.create({
      data: {
        tenantId,
        companyId,
        warehouseId,
        reference,
        countDate: new Date(countDate),
        notes,
        createdBy: userId,
        lines: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            systemQty: stockMap.get(l.itemId) || 0,
            countedQty: l.countedQty,
            variance: l.countedQty - (stockMap.get(l.itemId) || 0),
            notes: l.notes,
          })),
        },
      },
      include: { warehouse: true, lines: { include: { item: true } } },
    });
  }

  async postStockCount(tenantId: string, companyId: string, userId: string, id: string) {
    const sc = await this.getStockCount(tenantId, companyId, id);
    if (sc.status !== 'DRAFT') throw new BadRequestException('Stock count already posted');

    return this.prisma.$transaction(async (tx) => {
      // Apply variances as adjustment movements
      for (const line of sc.lines) {
        const variance = Number(line.variance);
        if (variance === 0) continue;

        const movementType = variance > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        const absQty = Math.abs(variance);

        const existing = await tx.stockLevel.findUnique({
          where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId: line.itemId, warehouseId: sc.warehouseId } },
        });
        const currentQty = existing ? Number(existing.qty) : 0;
        const newQty = currentQty + variance;

        if (existing) {
          await tx.stockLevel.update({
            where: { tenantId_companyId_itemId_warehouseId: { tenantId, companyId, itemId: line.itemId, warehouseId: sc.warehouseId } },
            data: { qty: newQty },
          });
        } else {
          await tx.stockLevel.create({
            data: { tenantId, companyId, itemId: line.itemId, warehouseId: sc.warehouseId, qty: newQty },
          });
        }

        await tx.stockMovement.create({
          data: {
            tenantId, companyId, itemId: line.itemId, warehouseId: sc.warehouseId,
            movementType, reference: sc.reference, qty: absQty, unitCost: 0, totalCost: 0,
            qtyBefore: currentQty, qtyAfter: newQty, createdBy: userId,
            notes: `Stock count adjustment: ${sc.reference}`,
          },
        });
      }

      return tx.stockCount.update({
        where: { id },
        data: { status: 'POSTED', approvedBy: userId, approvedAt: new Date() },
      });
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  async getSummary(tenantId: string, companyId: string) {
    const [totalItems, totalWarehouses, stockLevels] = await Promise.all([
      this.prisma.item.count({ where: { tenantId, companyId, isActive: true } }),
      this.prisma.warehouse.count({ where: { tenantId, companyId, isActive: true } }),
      this.prisma.stockLevel.findMany({ where: { tenantId, companyId }, include: { item: true } }),
    ]);

    const totalStockValue = stockLevels.reduce((sum, sl) => sum + Number(sl.qty) * Number(sl.avgCost), 0);

    return { totalItems, totalWarehouses, totalStockValue, stockLevels: stockLevels.length };
  }
}
