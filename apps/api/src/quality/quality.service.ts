import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInspectionTemplateDto,
  CreateInspectionDto,
  CompleteInspectionDto,
  CreateNCRDto,
  CreateNCRActionDto,
  CloseNCRDto,
  CreateAuditDto,
  CompleteAuditDto,
  CreateAuditFindingDto,
} from './dto/create-quality.dto';

@Injectable()
export class QualityService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(tenantId: string, companyId: string) {
    const [totalInspections, passedInspections, openNCRs, criticalNCRs, plannedAudits, openIncidents] = await Promise.all([
      this.prisma.inspection.count({ where: { tenantId, companyId } }),
      this.prisma.inspection.count({ where: { tenantId, companyId, overallResult: 'PASS' } }),
      this.prisma.nonConformance.count({ where: { tenantId, companyId, status: { not: 'CLOSED' } } }),
      this.prisma.nonConformance.count({ where: { tenantId, companyId, severity: 'CRITICAL', status: { not: 'CLOSED' } } }),
      this.prisma.audit.count({ where: { tenantId, companyId, status: { in: ['PLANNED', 'IN_PROGRESS'] } } }),
      this.prisma.nonConformance.findMany({ where: { tenantId, companyId, status: { not: 'CLOSED' } }, take: 5, orderBy: { raisedAt: 'desc' } }),
    ]);

    const ncrsBySeverity = await this.prisma.nonConformance.groupBy({
      by: ['severity'],
      where: { tenantId, companyId, status: { not: 'CLOSED' } },
      _count: { _all: true },
    });

    return { totalInspections, passedInspections, openNCRs, criticalNCRs, plannedAudits, recentNCRs: openIncidents, ncrsBySeverity };
  }

  // ─── Templates ──────────────────────────────────────────────────────────────

  async getTemplates(tenantId: string, companyId: string) {
    return this.prisma.inspectionTemplate.findMany({
      where: { tenantId, companyId },
      include: { items: { orderBy: { sequence: 'asc' } }, _count: { select: { inspections: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTemplate(tenantId: string, companyId: string, dto: CreateInspectionTemplateDto) {
    const { items, ...rest } = dto;
    return this.prisma.inspectionTemplate.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        items: items?.length
          ? { create: items.map((i) => ({ sequence: i.sequence, question: i.question, itemType: i.itemType ?? 'PASS_FAIL', options: i.options, isRequired: i.isRequired ?? true })) }
          : undefined,
      },
      include: { items: true },
    });
  }

  // ─── Inspections ─────────────────────────────────────────────────────────────

  async getInspections(tenantId: string, companyId: string, params: { status?: string; page: number; limit: number }) {
    const { status, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.inspection.findMany({
        where,
        include: { template: { select: { name: true, category: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inspection.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getInspection(tenantId: string, companyId: string, id: string) {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id, tenantId, companyId },
      include: {
        template: { include: { items: { orderBy: { sequence: 'asc' } } } },
        responses: true,
        ncrs: { select: { id: true, number: true, title: true, severity: true, status: true } },
      },
    });
    if (!inspection) throw new NotFoundException('Inspection not found');
    return inspection;
  }

  async createInspection(tenantId: string, companyId: string, dto: CreateInspectionDto) {
    const { scheduledAt, ...rest } = dto;
    return this.prisma.inspection.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      },
    });
  }

  async completeInspection(tenantId: string, companyId: string, id: string, dto: CompleteInspectionDto) {
    const inspection = await this.prisma.inspection.findFirst({ where: { id, tenantId, companyId } });
    if (!inspection) throw new NotFoundException('Inspection not found');

    return this.prisma.$transaction(async (tx) => {
      if (dto.responses?.length) {
        await tx.inspectionResponse.deleteMany({ where: { inspectionId: id } });
        await tx.inspectionResponse.createMany({
          data: dto.responses.map((r) => ({
            inspectionId: id,
            itemId: r.itemId,
            result: r.result,
            numericValue: r.numericValue,
            textValue: r.textValue,
            notes: r.notes,
            hasDefect: r.hasDefect ?? false,
          })),
        });
      }

      return tx.inspection.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          conductedAt: new Date(),
          conductedBy: dto.conductedBy,
          findings: dto.findings,
          overallResult: dto.overallResult,
        },
      });
    });
  }

  // ─── Non-Conformances ────────────────────────────────────────────────────────

  async getNCRs(tenantId: string, companyId: string, params: { status?: string; severity?: string; page: number; limit: number }) {
    const { status, severity, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;
    if (severity) where.severity = severity;

    const [data, total] = await Promise.all([
      this.prisma.nonConformance.findMany({
        where,
        include: { actions: true },
        orderBy: { raisedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.nonConformance.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createNCR(tenantId: string, companyId: string, dto: CreateNCRDto) {
    const { dueDate, ...rest } = dto;
    return this.prisma.nonConformance.create({
      data: { tenantId, companyId, ...rest, dueDate: dueDate ? new Date(dueDate) : undefined },
    });
  }

  async addNCRAction(ncrId: string, tenantId: string, companyId: string, dto: CreateNCRActionDto) {
    const ncr = await this.prisma.nonConformance.findFirst({ where: { id: ncrId, tenantId, companyId } });
    if (!ncr) throw new NotFoundException('NCR not found');
    const { dueDate, ...rest } = dto;
    return this.prisma.nCRAction.create({ data: { ncrId, ...rest, dueDate: dueDate ? new Date(dueDate) : undefined } });
  }

  async closeNCR(ncrId: string, tenantId: string, companyId: string, _dto: CloseNCRDto) {
    const ncr = await this.prisma.nonConformance.findFirst({ where: { id: ncrId, tenantId, companyId } });
    if (!ncr) throw new NotFoundException('NCR not found');
    if (ncr.status === 'CLOSED') throw new BadRequestException('NCR already closed');
    return this.prisma.nonConformance.update({ where: { id: ncrId }, data: { status: 'CLOSED', closedAt: new Date() } });
  }

  // ─── Audits ──────────────────────────────────────────────────────────────────

  async getAudits(tenantId: string, companyId: string, params: { status?: string; page: number; limit: number }) {
    const { status, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.audit.findMany({
        where,
        include: { findings_: true },
        orderBy: { scheduledStart: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.audit.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createAudit(tenantId: string, companyId: string, dto: CreateAuditDto) {
    const { scheduledStart, scheduledEnd, ...rest } = dto;
    return this.prisma.audit.create({
      data: { tenantId, companyId, ...rest, scheduledStart: new Date(scheduledStart), scheduledEnd: new Date(scheduledEnd) },
    });
  }

  async startAudit(tenantId: string, companyId: string, id: string) {
    const audit = await this.prisma.audit.findFirst({ where: { id, tenantId, companyId } });
    if (!audit) throw new NotFoundException('Audit not found');
    return this.prisma.audit.update({ where: { id }, data: { status: 'IN_PROGRESS', actualStart: new Date() } });
  }

  async completeAudit(tenantId: string, companyId: string, id: string, dto: CompleteAuditDto) {
    const audit = await this.prisma.audit.findFirst({ where: { id, tenantId, companyId } });
    if (!audit) throw new NotFoundException('Audit not found');

    return this.prisma.$transaction(async (tx) => {
      if (dto.findings_?.length) {
        await tx.auditFinding.createMany({
          data: dto.findings_.map((f) => ({
            auditId: id,
            findingType: f.findingType,
            description: f.description,
            clause: f.clause,
            requiresAction: f.requiresAction ?? false,
          })),
        });
      }
      return tx.audit.update({ where: { id }, data: { status: 'COMPLETED', actualEnd: new Date(), findings: dto.findings, result: dto.result } });
    });
  }
}
