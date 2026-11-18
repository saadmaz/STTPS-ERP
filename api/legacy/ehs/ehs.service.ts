import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncidentDto, InvestigateIncidentDto, CreateRiskAssessmentDto, CreatePermitDto, ApprovePermitDto } from './dto/create-ehs.dto';

@Injectable()
export class EhsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(tenantId: string, companyId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalIncidents, openIncidents, recentIncidents, activePermits, expiredPermits, activeRisks, recentIncidentList] = await Promise.all([
      this.prisma.incident.count({ where: { tenantId, companyId } }),
      this.prisma.incident.count({ where: { tenantId, companyId, status: { not: 'CLOSED' } } }),
      this.prisma.incident.count({ where: { tenantId, companyId, occurredAt: { gte: thirtyDaysAgo } } }),
      this.prisma.permitToWork.count({ where: { tenantId, companyId, status: 'APPROVED', validTo: { gte: now } } }),
      this.prisma.permitToWork.count({ where: { tenantId, companyId, status: 'APPROVED', validTo: { lt: now } } }),
      this.prisma.riskAssessment.count({ where: { tenantId, companyId, status: 'ACTIVE' } }),
      this.prisma.incident.findMany({ where: { tenantId, companyId }, take: 5, orderBy: { occurredAt: 'desc' } }),
    ]);

    const bySeverity = await this.prisma.incident.groupBy({
      by: ['severity'],
      where: { tenantId, companyId },
      _count: { _all: true },
    });

    return { totalIncidents, openIncidents, recentIncidents, activePermits, expiredPermits, activeRisks, recentIncidentList, bySeverity };
  }

  // ─── Incidents ───────────────────────────────────────────────────────────────

  async getIncidents(tenantId: string, companyId: string, params: { status?: string; type?: string; page: number; limit: number }) {
    const { status, type, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;
    if (type) where.incidentType = type;

    const [data, total] = await Promise.all([
      this.prisma.incident.findMany({ where, orderBy: { occurredAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.incident.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createIncident(tenantId: string, companyId: string, dto: CreateIncidentDto) {
    const { occurredAt, ...rest } = dto;
    return this.prisma.incident.create({ data: { tenantId, companyId, ...rest, occurredAt: new Date(occurredAt) } });
  }

  async investigateIncident(tenantId: string, companyId: string, id: string, dto: InvestigateIncidentDto) {
    const incident = await this.prisma.incident.findFirst({ where: { id, tenantId, companyId } });
    if (!incident) throw new NotFoundException('Incident not found');
    return this.prisma.incident.update({ where: { id }, data: { status: 'INVESTIGATING', rootCause: dto.rootCause, preventiveActions: dto.preventiveActions } });
  }

  async closeIncident(tenantId: string, companyId: string, id: string) {
    const incident = await this.prisma.incident.findFirst({ where: { id, tenantId, companyId } });
    if (!incident) throw new NotFoundException('Incident not found');
    if (incident.status === 'CLOSED') throw new BadRequestException('Already closed');
    return this.prisma.incident.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
  }

  // ─── Risk Assessments ────────────────────────────────────────────────────────

  async getRisks(tenantId: string, companyId: string, params: { status?: string; page: number; limit: number }) {
    const { status, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.riskAssessment.findMany({ where, include: { hazards: true }, orderBy: { assessedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.riskAssessment.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createRisk(tenantId: string, companyId: string, dto: CreateRiskAssessmentDto) {
    const { reviewDue, hazards, ...rest } = dto;
    return this.prisma.riskAssessment.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        reviewDue: new Date(reviewDue),
        hazards: hazards?.length
          ? {
              create: hazards.map((h) => ({
                hazard: h.hazard,
                category: h.category ?? 'GENERAL',
                likelihood: h.likelihood,
                severity: h.severity,
                riskScore: h.likelihood * h.severity,
                controls: h.controls,
                residualLikelihood: h.residualLikelihood,
                residualSeverity: h.residualSeverity,
                residualScore: h.residualLikelihood && h.residualSeverity ? h.residualLikelihood * h.residualSeverity : undefined,
              })),
            }
          : undefined,
      },
      include: { hazards: true },
    });
  }

  async activateRisk(tenantId: string, companyId: string, id: string) {
    const risk = await this.prisma.riskAssessment.findFirst({ where: { id, tenantId, companyId } });
    if (!risk) throw new NotFoundException('Risk assessment not found');
    return this.prisma.riskAssessment.update({ where: { id }, data: { status: 'ACTIVE' } });
  }

  // ─── Permits to Work ─────────────────────────────────────────────────────────

  async getPermits(tenantId: string, companyId: string, params: { status?: string; page: number; limit: number }) {
    const { status, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.permitToWork.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.permitToWork.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createPermit(tenantId: string, companyId: string, dto: CreatePermitDto) {
    const { validFrom, validTo, ...rest } = dto;
    return this.prisma.permitToWork.create({ data: { tenantId, companyId, ...rest, validFrom: new Date(validFrom), validTo: new Date(validTo) } });
  }

  async approvePermit(tenantId: string, companyId: string, id: string, dto: ApprovePermitDto) {
    const permit = await this.prisma.permitToWork.findFirst({ where: { id, tenantId, companyId } });
    if (!permit) throw new NotFoundException('Permit not found');
    if (permit.status !== 'PENDING') throw new BadRequestException('Permit not in PENDING state');
    return this.prisma.permitToWork.update({ where: { id }, data: { status: 'APPROVED', approvedBy: dto.approvedBy } });
  }

  async closePermit(tenantId: string, companyId: string, id: string) {
    const permit = await this.prisma.permitToWork.findFirst({ where: { id, tenantId, companyId } });
    if (!permit) throw new NotFoundException('Permit not found');
    return this.prisma.permitToWork.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
  }
}
