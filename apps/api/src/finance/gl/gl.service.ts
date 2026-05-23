import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateAccountDto } from "./dto/create-account.dto";
import { CreateJournalDto } from "./dto/create-journal.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";

@Injectable()
export class GlService {
  constructor(private prisma: PrismaService) {}

  // ─── Chart of Accounts ────────────────────────────────────────

  async getAccounts(tenantId: string, companyId: string) {
    return this.prisma.glAccount.findMany({
      where: { tenantId, companyId },
      include: { parent: { select: { id: true, code: true, name: true } } },
      orderBy: { code: "asc" },
    });
  }

  async getAccount(id: string, tenantId: string) {
    const account = await this.prisma.glAccount.findFirst({
      where: { id, tenantId },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
      },
    });
    if (!account) throw new NotFoundException("Account not found");
    return account;
  }

  async createAccount(dto: CreateAccountDto, tenantId: string, companyId: string) {
    const existing = await this.prisma.glAccount.findUnique({
      where: { tenantId_companyId_code: { tenantId, companyId, code: dto.code } },
    });
    if (existing) throw new ConflictException(`Account code ${dto.code} already exists`);

    return this.prisma.glAccount.create({
      data: { ...dto, tenantId, companyId },
    });
  }

  async updateAccount(id: string, tenantId: string, data: Partial<CreateAccountDto>) {
    await this.getAccount(id, tenantId);
    return this.prisma.glAccount.update({ where: { id }, data });
  }

  // ─── Fiscal Periods ───────────────────────────────────────────

  async getPeriods(tenantId: string, companyId: string, fiscalYear?: number) {
    return this.prisma.glPeriod.findMany({
      where: {
        tenantId,
        companyId,
        ...(fiscalYear ? { fiscalYear } : {}),
      },
      orderBy: [{ fiscalYear: "desc" }, { period: "asc" }],
    });
  }

  async getOpenPeriod(tenantId: string, companyId: string) {
    const period = await this.prisma.glPeriod.findFirst({
      where: { tenantId, companyId, status: "OPEN" },
      orderBy: [{ fiscalYear: "asc" }, { period: "asc" }],
    });
    return period;
  }

  // ─── Journal Entries ──────────────────────────────────────────

  async getJournals(tenantId: string, companyId: string, query: PaginationDto) {
    const { page = 1, limit = 25, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, companyId };
    if (search) {
      where.OR = [
        { number: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { reference: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.glJournal.findMany({
        where,
        include: {
          period: { select: { name: true, fiscalYear: true, period: true } },
          lines: {
            include: { account: { select: { code: true, name: true } } },
          },
        },
        orderBy: [{ date: "desc" }, { number: "desc" }],
        skip,
        take: limit,
      }),
      this.prisma.glJournal.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getJournal(id: string, tenantId: string) {
    const journal = await this.prisma.glJournal.findFirst({
      where: { id, tenantId },
      include: {
        period: true,
        lines: {
          include: { account: { select: { id: true, code: true, name: true, type: true } } },
          orderBy: { lineNumber: "asc" },
        },
      },
    });
    if (!journal) throw new NotFoundException("Journal entry not found");
    return journal;
  }

  async createJournal(dto: CreateJournalDto, tenantId: string, companyId: string, createdBy: string) {
    // Validate balanced entry
    const totalDebit = dto.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredit = dto.lines.reduce((sum, l) => sum + (l.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new BadRequestException(
        `Journal is not balanced. Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}`,
      );
    }

    // Find period for date
    const journalDate = new Date(dto.date);
    const period = await this.prisma.glPeriod.findFirst({
      where: {
        tenantId,
        companyId,
        status: { in: ["OPEN"] },
        startDate: { lte: journalDate },
        endDate: { gte: journalDate },
      },
    });

    if (!period) {
      throw new BadRequestException("No open period found for the journal date");
    }

    // Generate journal number
    const count = await this.prisma.glJournal.count({ where: { tenantId, companyId } });
    const number = `JE-${String(count + 1).padStart(6, "0")}`;

    return this.prisma.glJournal.create({
      data: {
        tenantId,
        companyId,
        periodId: period.id,
        number,
        date: journalDate,
        description: dto.description,
        reference: dto.reference,
        type: dto.type || "MANUAL",
        status: "DRAFT",
        currency: dto.currency || "USD",
        totalDebit,
        totalCredit,
        createdBy,
        lines: {
          create: dto.lines.map((line, idx) => ({
            accountId: line.accountId,
            lineNumber: idx + 1,
            description: line.description,
            debit: line.debit || 0,
            credit: line.credit || 0,
            currency: line.currency || dto.currency || "USD",
            exchangeRate: line.exchangeRate || 1,
          })),
        },
      },
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
        },
        period: true,
      },
    });
  }

  async postJournal(id: string, tenantId: string, postedBy: string) {
    const journal = await this.getJournal(id, tenantId);

    if (journal.status !== "DRAFT") {
      throw new BadRequestException(`Journal is already ${journal.status}`);
    }

    return this.prisma.glJournal.update({
      where: { id },
      data: {
        status: "POSTED",
        postedBy,
        postedAt: new Date(),
      },
    });
  }

  async voidJournal(id: string, tenantId: string, voidedBy: string) {
    const journal = await this.getJournal(id, tenantId);

    if (journal.status !== "POSTED") {
      throw new BadRequestException("Only posted journals can be voided");
    }

    return this.prisma.glJournal.update({
      where: { id },
      data: { status: "VOID" },
    });
  }

  // ─── Trial Balance ────────────────────────────────────────────

  async getTrialBalance(tenantId: string, companyId: string, fiscalYear: number, period?: number) {
    const periodWhere: any = { tenantId, companyId, fiscalYear, status: "POSTED" };

    if (period) {
      const p = await this.prisma.glPeriod.findFirst({
        where: { tenantId, companyId, fiscalYear, period },
      });
      if (!p) return [];
      periodWhere["periodId"] = p.id;
    }

    const accounts = await this.prisma.glAccount.findMany({
      where: { tenantId, companyId, isActive: true },
      orderBy: { code: "asc" },
    });

    const journals = await this.prisma.glJournal.findMany({
      where: { tenantId, companyId, status: "POSTED" },
      include: { lines: true },
    });

    const balances: Record<string, { debit: number; credit: number }> = {};
    for (const journal of journals) {
      for (const line of journal.lines) {
        if (!balances[line.accountId]) {
          balances[line.accountId] = { debit: 0, credit: 0 };
        }
        balances[line.accountId].debit += Number(line.debit);
        balances[line.accountId].credit += Number(line.credit);
      }
    }

    return accounts
      .filter((a) => balances[a.id])
      .map((a) => ({
        accountId: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        debit: balances[a.id]?.debit || 0,
        credit: balances[a.id]?.credit || 0,
        balance: (balances[a.id]?.debit || 0) - (balances[a.id]?.credit || 0),
      }));
  }

  // ─── Dashboard Stats ──────────────────────────────────────────

  async getDashboardStats(tenantId: string, companyId: string) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const [
      totalJournals,
      postedJournals,
      draftJournals,
      vendors,
      customers,
      apInvoices,
      arInvoices,
    ] = await Promise.all([
      this.prisma.glJournal.count({ where: { tenantId, companyId } }),
      this.prisma.glJournal.count({ where: { tenantId, companyId, status: "POSTED" } }),
      this.prisma.glJournal.count({ where: { tenantId, companyId, status: "DRAFT" } }),
      this.prisma.vendor.count({ where: { tenantId, companyId, isActive: true } }),
      this.prisma.customer.count({ where: { tenantId, companyId, isActive: true } }),
      this.prisma.apInvoice.aggregate({
        where: { tenantId, companyId, status: { not: "VOID" } },
        _sum: { total: true, balance: true },
      }),
      this.prisma.arInvoice.aggregate({
        where: { tenantId, companyId, status: { not: "VOID" } },
        _sum: { total: true, balance: true },
      }),
    ]);

    return {
      journals: { total: totalJournals, posted: postedJournals, draft: draftJournals },
      vendors,
      customers,
      ap: {
        totalInvoiced: Number(apInvoices._sum.total || 0),
        outstanding: Number(apInvoices._sum.balance || 0),
      },
      ar: {
        totalInvoiced: Number(arInvoices._sum.total || 0),
        outstanding: Number(arInvoices._sum.balance || 0),
      },
    };
  }
}
