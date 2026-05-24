import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAssetCategoryDto,
  CreateAssetDto,
  CreateMaintenancePlanDto,
  CreateWorkOrderDto,
  CompleteWorkOrderDto,
  RegisterIoTDeviceDto,
  RecordIoTReadingDto,
} from './dto/create-eam.dto';
import { addDays } from 'date-fns';

@Injectable()
export class EamService {
  constructor(private prisma: PrismaService) {}

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, companyId: string) {
    const now = new Date();
    const [totalAssets, activeAssets, openWorkOrders, overdueMaintenancePlans, criticalWorkOrders, recentWorkOrders] =
      await Promise.all([
        this.prisma.asset.count({ where: { tenantId, companyId } }),
        this.prisma.asset.count({ where: { tenantId, companyId, status: 'ACTIVE' } }),
        this.prisma.workOrder.count({ where: { tenantId, companyId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        this.prisma.maintenancePlan.count({ where: { tenantId, companyId, isActive: true, nextDueAt: { lt: now } } }),
        this.prisma.workOrder.count({ where: { tenantId, companyId, priority: 'CRITICAL', status: { not: 'COMPLETED' } } }),
        this.prisma.workOrder.findMany({
          where: { tenantId, companyId },
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { asset: { select: { name: true, code: true } } },
        }),
      ]);

    const workOrdersByStatus = await this.prisma.workOrder.groupBy({
      by: ['status'],
      where: { tenantId, companyId },
      _count: { _all: true },
    });

    return { totalAssets, activeAssets, openWorkOrders, overdueMaintenancePlans, criticalWorkOrders, recentWorkOrders, workOrdersByStatus };
  }

  // ─── Asset Categories ────────────────────────────────────────────────────────

  async getCategories(tenantId: string, companyId: string) {
    return this.prisma.assetCategory.findMany({
      where: { tenantId, companyId },
      include: { _count: { select: { assets: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(tenantId: string, companyId: string, dto: CreateAssetCategoryDto) {
    return this.prisma.assetCategory.create({ data: { tenantId, companyId, ...dto } });
  }

  // ─── Assets ─────────────────────────────────────────────────────────────────

  async getAssets(tenantId: string, companyId: string, params: { status?: string; categoryId?: string; page: number; limit: number }) {
    const { status, categoryId, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;

    const [data, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        include: {
          category: { select: { name: true } },
          _count: { select: { workOrders: true, maintenancePlans: true } },
        },
        orderBy: { code: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.asset.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getAsset(tenantId: string, companyId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, tenantId, companyId },
      include: {
        category: true,
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true, status: true } },
        maintenancePlans: { where: { isActive: true }, orderBy: { nextDueAt: 'asc' } },
        workOrders: { take: 5, orderBy: { createdAt: 'desc' } },
        iotDevices: true,
      },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async createAsset(tenantId: string, companyId: string, dto: CreateAssetDto) {
    const { purchaseDate, purchaseCost, warrantyExpiry, ...rest } = dto;
    return this.prisma.asset.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        purchaseCost: purchaseCost ?? undefined,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : undefined,
      },
    });
  }

  // ─── Maintenance Plans ───────────────────────────────────────────────────────

  async getMaintenancePlans(tenantId: string, companyId: string, params: { assetId?: string; page: number; limit: number }) {
    const { assetId, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (assetId) where.assetId = assetId;

    const [data, total] = await Promise.all([
      this.prisma.maintenancePlan.findMany({
        where,
        include: {
          asset: { select: { code: true, name: true } },
          tasks: { orderBy: { sequence: 'asc' } },
        },
        orderBy: { nextDueAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.maintenancePlan.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createMaintenancePlan(tenantId: string, companyId: string, dto: CreateMaintenancePlanDto) {
    const { nextDueAt, estimatedHours, tasks, ...rest } = dto;
    return this.prisma.maintenancePlan.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        nextDueAt: new Date(nextDueAt),
        estimatedHours: estimatedHours ?? undefined,
        tasks: tasks?.length
          ? { create: tasks.map((t) => ({ sequence: t.sequence, description: t.description, estimatedMins: t.estimatedMins ?? 0 })) }
          : undefined,
      },
      include: { tasks: true },
    });
  }

  async triggerMaintenancePlan(tenantId: string, companyId: string, userId: string, planId: string) {
    const plan = await this.prisma.maintenancePlan.findFirst({ where: { id: planId, tenantId, companyId } });
    if (!plan) throw new NotFoundException('Maintenance plan not found');

    const nextDueAt = addDays(new Date(), plan.frequencyDays);

    return this.prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.create({
        data: {
          tenantId,
          companyId,
          assetId: plan.assetId,
          maintenancePlanId: plan.id,
          number: `WO-PM-${Date.now()}`,
          type: 'PREVENTIVE',
          priority: 'NORMAL',
          description: `PM: ${plan.name}`,
          assignedTo: userId,
          estimatedHours: plan.estimatedHours ?? undefined,
        },
      });

      await tx.maintenancePlan.update({
        where: { id: planId },
        data: { lastRunAt: new Date(), nextDueAt },
      });

      return wo;
    });
  }

  // ─── Work Orders ─────────────────────────────────────────────────────────────

  async getWorkOrders(tenantId: string, companyId: string, params: { status?: string; assetId?: string; type?: string; page: number; limit: number }) {
    const { status, assetId, type, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;
    if (assetId) where.assetId = assetId;
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        include: {
          asset: { select: { code: true, name: true, location: true } },
          costs: { orderBy: { sequence: 'asc' } },
        },
        orderBy: [{ priority: 'desc' }, { reportedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createWorkOrder(tenantId: string, companyId: string, dto: CreateWorkOrderDto) {
    const { scheduledStart, scheduledEnd, estimatedHours, ...rest } = dto;
    return this.prisma.workOrder.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined,
        estimatedHours: estimatedHours ?? undefined,
      },
    });
  }

  async startWorkOrder(tenantId: string, companyId: string, id: string) {
    const wo = await this.prisma.workOrder.findFirst({ where: { id, tenantId, companyId } });
    if (!wo) throw new NotFoundException('Work order not found');
    if (!['OPEN', 'ON_HOLD'].includes(wo.status)) throw new BadRequestException('Work order cannot be started');
    return this.prisma.workOrder.update({ where: { id }, data: { status: 'IN_PROGRESS', actualStart: new Date() } });
  }

  async completeWorkOrder(tenantId: string, companyId: string, id: string, dto: CompleteWorkOrderDto) {
    const wo = await this.prisma.workOrder.findFirst({ where: { id, tenantId, companyId } });
    if (!wo) throw new NotFoundException('Work order not found');
    if (wo.status === 'COMPLETED') throw new BadRequestException('Work order already completed');

    const costs = dto.costs ?? [];
    const totalCost = costs.reduce((sum, c) => sum + (c.unitCost * (c.quantity ?? 1)), 0);

    return this.prisma.$transaction(async (tx) => {
      if (costs.length > 0) {
        await tx.workOrderCost.createMany({
          data: costs.map((c, i) => ({
            workOrderId: id,
            type: c.type,
            description: c.description,
            quantity: c.quantity ?? 1,
            unitCost: c.unitCost,
            totalCost: c.unitCost * (c.quantity ?? 1),
            sequence: i + 1,
          })),
        });
      }

      return tx.workOrder.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          actualEnd: new Date(),
          resolution: dto.resolution,
          actualHours: dto.actualHours ?? undefined,
          totalCost: { increment: totalCost },
        },
      });
    });
  }

  // ─── IoT Devices ─────────────────────────────────────────────────────────────

  async getIoTDevices(tenantId: string, companyId: string) {
    return this.prisma.IoTDevice.findMany({
      where: { tenantId, companyId },
      include: {
        asset: { select: { code: true, name: true } },
        _count: { select: { readings: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async registerDevice(tenantId: string, companyId: string, dto: RegisterIoTDeviceDto) {
    return this.prisma.IoTDevice.create({ data: { tenantId, companyId, ...dto } });
  }

  async recordReading(tenantId: string, deviceId: string, dto: RecordIoTReadingDto) {
    const device = await this.prisma.IoTDevice.findFirst({ where: { id: deviceId, tenantId } });
    if (!device) throw new NotFoundException('Device not found');

    await this.prisma.IoTDevice.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });

    return this.prisma.IoTReading.create({
      data: { deviceId, metric: dto.metric, value: dto.value, unit: dto.unit, isAlert: dto.isAlert ?? false },
    });
  }

  async getDeviceReadings(tenantId: string, deviceId: string, params: { metric?: string; limit: number }) {
    const device = await this.prisma.IoTDevice.findFirst({ where: { id: deviceId, tenantId } });
    if (!device) throw new NotFoundException('Device not found');

    const where: any = { deviceId };
    if (params.metric) where.metric = params.metric;

    return this.prisma.IoTReading.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: params.limit,
    });
  }
}
