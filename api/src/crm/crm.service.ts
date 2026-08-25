import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLeadDto,
  CreateCrmAccountDto,
  CreateCrmContactDto,
  CreateOpportunityDto,
  CreateActivityDto,
} from './dto/create-crm.dto';

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService) {}

  // ── Dashboard ────────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, companyId: string) {
    const [totalLeads, openOpportunities, totalAccounts, totalContacts, recentActivities] =
      await Promise.all([
        this.prisma.lead.count({ where: { tenantId, companyId } }),
        this.prisma.opportunity.count({ where: { tenantId, companyId, status: 'OPEN' } }),
        this.prisma.crmAccount.count({ where: { tenantId, companyId, isActive: true } }),
        this.prisma.crmContact.count({ where: { tenantId, companyId, isActive: true } }),
        this.prisma.activity.findMany({
          where: { tenantId, companyId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    const pipeline = await this.prisma.opportunity.groupBy({
      by: ['stage'],
      where: { tenantId, companyId, status: 'OPEN' },
      _sum: { amount: true },
      _count: true,
    });

    return { totalLeads, openOpportunities, totalAccounts, totalContacts, recentActivities, pipeline };
  }

  // ── Leads ────────────────────────────────────────────────────────────────────

  async getLeads(tenantId: string, companyId: string, params: { status?: string; page?: number; limit?: number; search?: string }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId };
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { company: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getLead(tenantId: string, companyId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId, companyId },
      include: { activities: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async createLead(tenantId: string, companyId: string, userId: string, dto: CreateLeadDto) {
    return this.prisma.lead.create({ data: { tenantId, companyId, ownerId: userId, ...dto } });
  }

  async updateLead(tenantId: string, companyId: string, id: string, dto: Partial<CreateLeadDto>) {
    await this.getLead(tenantId, companyId, id);
    return this.prisma.lead.update({ where: { id }, data: dto });
  }

  // ── Accounts ─────────────────────────────────────────────────────────────────

  async getAccounts(tenantId: string, companyId: string, params: { page?: number; limit?: number; search?: string }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId, isActive: true };
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { industry: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.crmAccount.findMany({
        where, skip, take: limit, orderBy: { name: 'asc' },
        include: { _count: { select: { contacts: true, opportunities: true } } },
      }),
      this.prisma.crmAccount.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getAccount(tenantId: string, companyId: string, id: string) {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id, tenantId, companyId },
      include: {
        contacts: true,
        opportunities: { orderBy: { createdAt: 'desc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async createAccount(tenantId: string, companyId: string, userId: string, dto: CreateCrmAccountDto) {
    return this.prisma.crmAccount.create({ data: { tenantId, companyId, ownerId: userId, ...dto } });
  }

  async updateAccount(tenantId: string, companyId: string, id: string, dto: Partial<CreateCrmAccountDto>) {
    await this.getAccount(tenantId, companyId, id);
    return this.prisma.crmAccount.update({ where: { id }, data: dto });
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────

  async getContacts(tenantId: string, companyId: string, params: { accountId?: string; page?: number; limit?: number; search?: string }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId, isActive: true };
    if (params.accountId) where.accountId = params.accountId;
    if (params.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.crmContact.findMany({
        where, skip, take: limit, orderBy: { lastName: 'asc' },
        include: { account: true },
      }),
      this.prisma.crmContact.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getContact(tenantId: string, companyId: string, id: string) {
    const contact = await this.prisma.crmContact.findFirst({
      where: { id, tenantId, companyId },
      include: {
        account: true,
        opportunities: { orderBy: { createdAt: 'desc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async createContact(tenantId: string, companyId: string, userId: string, dto: CreateCrmContactDto) {
    return this.prisma.crmContact.create({
      data: { tenantId, companyId, ownerId: userId, ...dto },
      include: { account: true },
    });
  }

  async updateContact(tenantId: string, companyId: string, id: string, dto: Partial<CreateCrmContactDto>) {
    await this.getContact(tenantId, companyId, id);
    return this.prisma.crmContact.update({ where: { id }, data: dto, include: { account: true } });
  }

  // ── Opportunities ─────────────────────────────────────────────────────────────

  async getOpportunities(tenantId: string, companyId: string, params: { stage?: string; status?: string; accountId?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId };
    if (params.stage) where.stage = params.stage;
    if (params.status) where.status = params.status;
    if (params.accountId) where.accountId = params.accountId;

    const [data, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { account: true, contact: true },
      }),
      this.prisma.opportunity.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getOpportunity(tenantId: string, companyId: string, id: string) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id, tenantId, companyId },
      include: {
        account: true,
        contact: true,
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
        quotes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!opp) throw new NotFoundException('Opportunity not found');
    return opp;
  }

  async createOpportunity(tenantId: string, companyId: string, userId: string, dto: CreateOpportunityDto) {
    const { closeDate, ...rest } = dto;
    return this.prisma.opportunity.create({
      data: {
        tenantId, companyId, ownerId: userId,
        closeDate: closeDate ? new Date(closeDate) : undefined,
        ...rest,
      },
      include: { account: true, contact: true },
    });
  }

  async updateOpportunity(tenantId: string, companyId: string, id: string, dto: Partial<CreateOpportunityDto>) {
    await this.getOpportunity(tenantId, companyId, id);
    const { closeDate, ...rest } = dto;
    return this.prisma.opportunity.update({
      where: { id },
      data: { closeDate: closeDate ? new Date(closeDate) : undefined, ...rest },
      include: { account: true, contact: true },
    });
  }

  // ── Activities ────────────────────────────────────────────────────────────────

  async getActivities(tenantId: string, companyId: string, params: { status?: string; type?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId };
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;

    const [data, total] = await Promise.all([
      this.prisma.activity.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { lead: true, account: true, contact: true, opportunity: true },
      }),
      this.prisma.activity.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createActivity(tenantId: string, companyId: string, userId: string, dto: CreateActivityDto) {
    const { dueDate, ...rest } = dto;
    return this.prisma.activity.create({
      data: {
        tenantId, companyId, ownerId: userId,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        ...rest,
      },
    });
  }

  async completeActivity(tenantId: string, companyId: string, userId: string, id: string) {
    const activity = await this.prisma.activity.findFirst({ where: { id, tenantId, companyId } });
    if (!activity) throw new NotFoundException('Activity not found');
    return this.prisma.activity.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
}
