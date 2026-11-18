import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectStatusDto, CreateTaskDto, UpdateTaskDto, CreateTimesheetDto, ApproveTimesheetDto, CreateBillingDto } from './dto/create-projects.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(tenantId: string, companyId: string) {
    const [totalProjects, activeProjects, totalTasks, openTasks, overdueTimesheets, recentProjects] = await Promise.all([
      this.prisma.project.count({ where: { tenantId, companyId } }),
      this.prisma.project.count({ where: { tenantId, companyId, status: 'ACTIVE' } }),
      this.prisma.wBSTask.count({ where: { tenantId, companyId } }),
      this.prisma.wBSTask.count({ where: { tenantId, companyId, status: { in: ['TODO', 'IN_PROGRESS'] } } }),
      this.prisma.timesheet.count({ where: { tenantId, companyId, status: 'SUBMITTED' } }),
      this.prisma.project.findMany({ where: { tenantId, companyId }, take: 5, orderBy: { createdAt: 'desc' }, include: { _count: { select: { tasks: true } } } }),
    ]);

    const byStatus = await this.prisma.project.groupBy({
      by: ['status'],
      where: { tenantId, companyId },
      _count: { _all: true },
    });

    return { totalProjects, activeProjects, totalTasks, openTasks, overdueTimesheets, recentProjects, byStatus };
  }

  // ─── Projects ─────────────────────────────────────────────────────────────────

  async getProjects(tenantId: string, companyId: string, params: { status?: string; page: number; limit: number }) {
    const { status, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: {
          _count: { select: { tasks: true, timesheets: true, billings: true } },
        },
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getProject(tenantId: string, companyId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId, companyId },
      include: {
        tasks: {
          where: { parentId: null },
          include: { children: { include: { children: true } }, timesheets: { select: { hours: true, billable: true } } },
          orderBy: { code: 'asc' },
        },
        billings: { orderBy: { createdAt: 'desc' } },
        _count: { select: { tasks: true, timesheets: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async createProject(tenantId: string, companyId: string, dto: CreateProjectDto) {
    const { startDate, endDate, budget, ...rest } = dto;
    return this.prisma.project.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
        budget: budget ?? undefined,
      },
    });
  }

  async updateProjectStatus(tenantId: string, companyId: string, id: string, dto: UpdateProjectStatusDto) {
    const project = await this.prisma.project.findFirst({ where: { id, tenantId, companyId } });
    if (!project) throw new NotFoundException('Project not found');
    const data: any = { status: dto.status };
    if (dto.status === 'COMPLETED') data.completedAt = new Date();
    return this.prisma.project.update({ where: { id }, data });
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────────

  async getTasks(tenantId: string, companyId: string, params: { projectId?: string; status?: string; assigneeId?: string; page: number; limit: number }) {
    const { projectId, status, assigneeId, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (assigneeId) where.assigneeId = assigneeId;

    const [data, total] = await Promise.all([
      this.prisma.wBSTask.findMany({
        where,
        include: { project: { select: { code: true, name: true } }, parent: { select: { code: true, title: true } } },
        orderBy: [{ projectId: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.wBSTask.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createTask(tenantId: string, companyId: string, dto: CreateTaskDto) {
    const { plannedStart, plannedEnd, estimatedHours, ...rest } = dto;
    return this.prisma.wBSTask.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        plannedStart: plannedStart ? new Date(plannedStart) : undefined,
        plannedEnd: plannedEnd ? new Date(plannedEnd) : undefined,
        estimatedHours: estimatedHours ?? undefined,
      },
    });
  }

  async updateTask(tenantId: string, companyId: string, id: string, dto: UpdateTaskDto) {
    const task = await this.prisma.wBSTask.findFirst({ where: { id, tenantId, companyId } });
    if (!task) throw new NotFoundException('Task not found');
    const data: any = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.progress !== undefined) data.progress = dto.progress;
    if (dto.actualHours !== undefined) data.actualHours = dto.actualHours;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    if (dto.status === 'IN_PROGRESS' && !task.actualStart) data.actualStart = new Date();
    if (dto.status === 'DONE') data.actualEnd = new Date();
    return this.prisma.wBSTask.update({ where: { id }, data });
  }

  // ─── Timesheets ───────────────────────────────────────────────────────────────

  async getTimesheets(tenantId: string, companyId: string, params: { projectId?: string; employeeId?: string; status?: string; page: number; limit: number }) {
    const { projectId, employeeId, status, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (projectId) where.projectId = projectId;
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.timesheet.findMany({
        where,
        include: { project: { select: { code: true, name: true } }, task: { select: { code: true, title: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.timesheet.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createTimesheet(tenantId: string, companyId: string, dto: CreateTimesheetDto) {
    const { date, ...rest } = dto;
    const entry = await this.prisma.timesheet.create({
      data: { tenantId, companyId, ...rest, date: new Date(date) },
    });

    if (dto.taskId) {
      await this.prisma.wBSTask.update({ where: { id: dto.taskId }, data: { actualHours: { increment: dto.hours } } });
    }
    await this.prisma.project.update({ where: { id: dto.projectId }, data: { actualCost: { increment: dto.hours } } });

    return entry;
  }

  async approveTimesheet(tenantId: string, companyId: string, id: string, dto: ApproveTimesheetDto) {
    const ts = await this.prisma.timesheet.findFirst({ where: { id, tenantId, companyId } });
    if (!ts) throw new NotFoundException('Timesheet not found');
    if (ts.status === 'APPROVED') throw new BadRequestException('Already approved');
    return this.prisma.timesheet.update({ where: { id }, data: { status: 'APPROVED', approvedBy: dto.approvedBy, approvedAt: new Date() } });
  }

  // ─── Billing ──────────────────────────────────────────────────────────────────

  async getBillings(tenantId: string, companyId: string, projectId?: string) {
    const where: any = { tenantId, companyId };
    if (projectId) where.projectId = projectId;
    return this.prisma.projectBilling.findMany({
      where,
      include: { project: { select: { code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBilling(tenantId: string, companyId: string, dto: CreateBillingDto) {
    const { amount, ...rest } = dto;
    return this.prisma.projectBilling.create({ data: { tenantId, companyId, ...rest, amount } });
  }

  async markBillingInvoiced(tenantId: string, companyId: string, id: string) {
    const billing = await this.prisma.projectBilling.findFirst({ where: { id, tenantId, companyId } });
    if (!billing) throw new NotFoundException('Billing record not found');
    return this.prisma.projectBilling.update({ where: { id }, data: { status: 'INVOICED', billedAt: new Date() } });
  }
}
