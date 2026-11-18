import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getProfitAndLoss(tenantId: string, companyId: string, fiscalYear: number, fromPeriod = 1, toPeriod = 12) {
    const periods = await this.prisma.glPeriod.findMany({
      where: { tenantId, companyId, fiscalYear, period: { gte: fromPeriod, lte: toPeriod } },
    });
    const periodIds = periods.map((p) => p.id);

    const journals = await this.prisma.glJournal.findMany({
      where: { tenantId, companyId, status: "POSTED", periodId: { in: periodIds } },
      include: {
        lines: {
          include: { account: { select: { id: true, code: true, name: true, type: true, parentId: true } } },
        },
      },
    });

    const balances: Record<string, { debit: number; credit: number; account: any }> = {};
    for (const j of journals) {
      for (const l of j.lines) {
        if (!balances[l.accountId]) balances[l.accountId] = { debit: 0, credit: 0, account: l.account };
        balances[l.accountId].debit += Number(l.debit);
        balances[l.accountId].credit += Number(l.credit);
      }
    }

    const revenue: any[] = [];
    const expenses: any[] = [];

    for (const [, entry] of Object.entries(balances)) {
      const net = entry.credit - entry.debit;
      const row = { ...entry.account, debit: entry.debit, credit: entry.credit, net };
      if (entry.account.type === "REVENUE") revenue.push(row);
      if (entry.account.type === "EXPENSE") expenses.push(row);
    }

    revenue.sort((a, b) => a.code.localeCompare(b.code));
    expenses.sort((a, b) => a.code.localeCompare(b.code));

    const totalRevenue = revenue.reduce((s, r) => s + r.net, 0);
    const totalExpenses = expenses.reduce((s, r) => s + r.net, 0);
    const netProfit = totalRevenue - totalExpenses;

    return {
      fiscalYear, fromPeriod, toPeriod,
      revenue, totalRevenue,
      expenses, totalExpenses,
      netProfit,
    };
  }

  async getBalanceSheet(tenantId: string, companyId: string, fiscalYear: number, asOfPeriod = 12) {
    const periods = await this.prisma.glPeriod.findMany({
      where: { tenantId, companyId, fiscalYear, period: { lte: asOfPeriod } },
    });
    const periodIds = periods.map((p) => p.id);

    const journals = await this.prisma.glJournal.findMany({
      where: { tenantId, companyId, status: "POSTED", periodId: { in: periodIds } },
      include: {
        lines: {
          include: { account: { select: { id: true, code: true, name: true, type: true, parentId: true } } },
        },
      },
    });

    const balances: Record<string, { debit: number; credit: number; account: any }> = {};
    for (const j of journals) {
      for (const l of j.lines) {
        if (!balances[l.accountId]) balances[l.accountId] = { debit: 0, credit: 0, account: l.account };
        balances[l.accountId].debit += Number(l.debit);
        balances[l.accountId].credit += Number(l.credit);
      }
    }

    const assets: any[] = [];
    const liabilities: any[] = [];
    const equity: any[] = [];

    for (const [, entry] of Object.entries(balances)) {
      const net = entry.debit - entry.credit;
      const row = { ...entry.account, debit: entry.debit, credit: entry.credit, net };
      if (entry.account.type === "ASSET") assets.push(row);
      if (entry.account.type === "LIABILITY") liabilities.push(row);
      if (entry.account.type === "EQUITY") equity.push(row);
    }

    assets.sort((a, b) => a.code.localeCompare(b.code));
    liabilities.sort((a, b) => a.code.localeCompare(b.code));
    equity.sort((a, b) => a.code.localeCompare(b.code));

    const totalAssets = assets.reduce((s, r) => s + r.net, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.net, 0);
    const totalEquity = equity.reduce((s, r) => s + r.net, 0);

    return {
      fiscalYear, asOfPeriod,
      assets, totalAssets,
      liabilities, totalLiabilities,
      equity, totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };
  }
}
