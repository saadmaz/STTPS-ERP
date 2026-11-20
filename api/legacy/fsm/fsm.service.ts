import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTechnicianDto,
  CreateServiceContractDto,
  CreateServiceOrderDto,
  AssignServiceOrderDto,
  CompleteServiceOrderDto,
  AddServiceOrderNoteDto,
} from './dto/create-fsm.dto';

@Injectable()
export class FsmService {
  constructor(private prisma: PrismaService) {}

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, companyId: string) {
    const now = new Date();
    const [totalOrders, openOrders, overdueOrders, availableTechs, activeContracts, recentOrders] =
      await Promise.all([
        this.prisma.serviceOrder.count({ where: { tenantId, companyId } }),
        this.prisma.serviceOrder.count({ where: { tenantId, companyId, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } } }),
        this.prisma.serviceOrder.count({
          where: { tenantId, companyId, slaDeadline: { lt: now }, status: { not: 'COMPLETED' } },
        }),
        this.prisma.technician.count({ where: { tenantId, companyId, status: 'AVAILABLE', isActive: true } }),
        this.prisma.serviceContract.count({ where: { tenantId, companyId, status: 'ACTIVE' } }),
        this.prisma.serviceOrder.findMany({
          where: { tenantId, companyId },
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { technician: { select: { name: true } } },
        }),
      ]);

    const byStatus = await this.prisma.serviceOrder.groupBy({
      by: ['status'],
      where: { tenantId, companyId },
      _count: { _all: true },
    });

    return { totalOrders, openOrders, overdueOrders, availableTechs, activeContracts, recentOrders, byStatus };
  }

  // ─── Technicians ─────────────────────────────────────────────────────────────

  async getTechnicians(tenantId: string, companyId: string) {
    return this.prisma.technician.findMany({
      where: { tenantId, companyId },
      include: { _count: { select: { serviceOrders: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTechnician(tenantId: string, companyId: string, dto: CreateTechnicianDto) {
    return this.prisma.technician.create({ data: { tenantId, companyId, ...dto } });
  }

  async updateTechnicianStatus(tenantId: string, companyId: string, id: string, status: string) {
    const tech = await this.prisma.technician.findFirst({ where: { id, tenantId, companyId } });
    if (!tech) throw new NotFoundException('Technician not found');
    return this.prisma.technician.update({ where: { id }, data: { status } });
  }

  // ─── Service Contracts ───────────────────────────────────────────────────────

  async getServiceContracts(tenantId: string, companyId: string, params: { status?: string; customerId?: string; page: number; limit: number }) {
    const { status, customerId, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const [data, total] = await Promise.all([
      this.prisma.serviceContract.findMany({
        where,
        include: {
          customer: { select: { name: true, code: true } },
          _count: { select: { serviceOrders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.serviceContract.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createServiceContract(tenantId: string, companyId: string, dto: CreateServiceContractDto) {
    const { startDate, endDate, value, slaHours, ...rest } = dto;
    return this.prisma.serviceContract.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        value: value ?? undefined,
        slaHours: slaHours ?? undefined,
      },
    });
  }

  // ─── Service Orders ──────────────────────────────────────────────────────────

  async getServiceOrders(tenantId: string, companyId: string, params: { status?: string; technicianId?: string; type?: string; page: number; limit: number }) {
    const { status, technicianId, type, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;
    if (technicianId) where.technicianId = technicianId;
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      this.prisma.serviceOrder.findMany({
        where,
        include: {
          technician: { select: { name: true, code: true, status: true } },
          customer: { select: { name: true, code: true } },
          contract: { select: { number: true, name: true, slaHours: true } },
        },
        orderBy: [{ priority: 'desc' }, { reportedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.serviceOrder.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getServiceOrder(tenantId: string, companyId: string, id: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId, companyId },
      include: {
        technician: true,
        customer: { select: { id: true, name: true, email: true, phone: true } },
        contract: true,
        notes: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Service order not found');
    return order;
  }

  async createServiceOrder(tenantId: string, companyId: string, dto: CreateServiceOrderDto) {
    const { scheduledAt, slaDeadline, ...rest } = dto;

    // Auto-compute SLA deadline from contract if not provided
    let computedSlaDeadline = slaDeadline ? new Date(slaDeadline) : undefined;
    if (!computedSlaDeadline && rest.contractId) {
      const contract = await this.prisma.serviceContract.findUnique({ where: { id: rest.contractId } });
      if (contract?.slaHours) {
        computedSlaDeadline = new Date(Date.now() + contract.slaHours * 3_600_000);
      }
    }

    return this.prisma.serviceOrder.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        slaDeadline: computedSlaDeadline,
        status: rest.technicianId ? 'ASSIGNED' : 'OPEN',
      },
    });
  }

  async assignServiceOrder(tenantId: string, companyId: string, id: string, dto: AssignServiceOrderDto) {
    const order = await this.prisma.serviceOrder.findFirst({ where: { id, tenantId, companyId } });
    if (!order) throw new NotFoundException('Service order not found');
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) throw new BadRequestException('Order is closed');

    return this.prisma.serviceOrder.update({
      where: { id },
      data: {
        technicianId: dto.technicianId,
        status: 'ASSIGNED',
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });
  }

  async startServiceOrder(tenantId: string, companyId: string, id: string) {
    const order = await this.prisma.serviceOrder.findFirst({ where: { id, tenantId, companyId } });
    if (!order) throw new NotFoundException('Service order not found');
    return this.prisma.serviceOrder.update({
      where: { id },
      data: { status: 'IN_PROGRESS', arrivedAt: new Date() },
    });
  }

  async completeServiceOrder(tenantId: string, companyId: string, id: string, dto: CompleteServiceOrderDto) {
    const order = await this.prisma.serviceOrder.findFirst({ where: { id, tenantId, companyId } });
    if (!order) throw new NotFoundException('Service order not found');
    if (order.status === 'COMPLETED') throw new BadRequestException('Order already completed');

    return this.prisma.serviceOrder.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        resolution: dto.resolution,
        customerRating: dto.customerRating ?? undefined,
      },
    });
  }

  async addNote(tenantId: string, companyId: string, userId: string, orderId: string, dto: AddServiceOrderNoteDto) {
    const order = await this.prisma.serviceOrder.findFirst({ where: { id: orderId, tenantId, companyId } });
    if (!order) throw new NotFoundException('Service order not found');
    return this.prisma.serviceOrderNote.create({
      data: {
        serviceOrderId: orderId,
        authorId: dto.authorId ?? userId,
        content: dto.content,
        isInternal: dto.isInternal ?? false,
      },
    });
  }
}
