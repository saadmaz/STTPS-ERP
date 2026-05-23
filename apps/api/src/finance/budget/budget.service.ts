import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateBudgetDto } from "./dto/create-budget.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";

@Injectable()
export class BudgetService {
  constructor(private prisma: PrismaService) {}

  async getBudgets(tenantId: string, companyId: string, query: PaginationDto & { fiscalYear?: string }) {
    const { page = 1, limit = 25, fiscalYear } = query;
    const where: any = { tenantId, companyId };
    if (fiscalYear) where.fiscalYear = Number(fiscalYear);
    const [data, total] = await Promise.all([
      this.prisma.budget.findMany({ where, orderBy: [{ fiscalYear: "desc" }, { name: "asc" }], skip: (page - 1) * limit, take: limit }),
      this.prisma.budget.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getBudget(id: string, tenantId: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, tenantId },
      include: {
        lines: {
          include: { account: { select: { id: true, code: true, name: true, type: true } } },
          orderBy: [{ account: { code: "asc" } }, { period: "asc" }],
        },
      },
    });
    if (!budget) throw new NotFoundException("Budget not found");
    return budget;
  }

  async createBudget(dto: CreateBudgetDto, tenantId: string, companyId: string, createdBy: string) {
    return this.prisma.budget.create({
      data: {
        tenantId,
        companyId,
        name: dto.name,
        fiscalYear: dto.fiscalYear,
        description: dto.description,
        status: "DRAFT",
        createdBy,
        lines: {
          create: dto.lines.map((l) => ({
            accountId: l.accountId,
            period: l.period,
            amount: l.amount,
            notes: l.notes,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async approveBudget(id: string, tenantId: string, userId: string) {
    const budget = await this.getBudget(id, tenantId);
    if (budget.status !== "DRAFT") throw new BadRequestException(`Budget is already ${budget.status}`);
    return this.prisma.budget.update({
      where: { id },
      data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() },
    });
  }

  async getBudgetVsActual(id: string, tenantId: string) {
    const budget = await this.getBudget(id, tenantId);

    const periods = await this.prisma.glPeriod.findMany({
      where: { tenantId, companyId: budget.companyId, fiscalYear: budget.fiscalYear },
    });
    const periodIds = periods.map((p) => p.id);

    const journals = await this.prisma.glJournal.findMany({
      where: { tenantId, companyId: budget.companyId, status: "POSTED", periodId: { in: periodIds } },
      include: { lines: true },
    });

    const actuals: Record<string, Record<number, number>> = {};
    for (const j of journals) {
      const period = periods.find((p) => p.id === j.periodId);
      if (!period) continue;
      for (const l of j.lines) {
        if (!actuals[l.accountId]) actuals[l.accountId] = {};
        if (!actuals[l.accountId][period.period]) actuals[l.accountId][period.period] = 0;
        actuals[l.accountId][period.period] += Number(l.debit) - Number(l.credit);
      }
    }

    const comparison = (budget.lines as any[]).map((line) => {
      const actual = actuals[line.accountId]?.[line.period] ?? 0;
      const budgetAmt = Number(line.amount);
      return {
        accountId: line.accountId,
        account: line.account,
        period: line.period,
        budget: budgetAmt,
        actual,
        variance: budgetAmt - actual,
        variancePct: budgetAmt !== 0 ? ((budgetAmt - actual) / budgetAmt) * 100 : 0,
      };
    });

    return { budget: { id: budget.id, name: budget.name, fiscalYear: budget.fiscalYear, status: budget.status }, comparison };
  }
}
