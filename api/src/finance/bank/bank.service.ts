import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateBankAccountDto } from "./dto/create-bank-account.dto";
import { CreateBankTransactionDto } from "./dto/create-bank-statement.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";

@Injectable()
export class BankService {
  constructor(private prisma: PrismaService) {}

  async getBankAccounts(tenantId: string, companyId: string, query: PaginationDto) {
    const { page = 1, limit = 25, search } = query;
    const where: any = { tenantId, companyId, isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { bankName: { contains: search, mode: "insensitive" } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.bankAccount.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.bankAccount.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getBankAccount(id: string, tenantId: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, tenantId },
      include: {
        glAccount: { select: { id: true, code: true, name: true } },
        statements: { orderBy: { date: "desc" }, take: 20 },
      },
    });
    if (!account) throw new NotFoundException("Bank account not found");
    return account;
  }

  async createBankAccount(dto: CreateBankAccountDto, tenantId: string, companyId: string) {
    const existing = await this.prisma.bankAccount.findUnique({
      where: { tenantId_companyId_code: { tenantId, companyId, code: dto.code } },
    });
    if (existing) throw new ConflictException(`Bank account code ${dto.code} already exists`);
    return this.prisma.bankAccount.create({ data: { ...dto, tenantId, companyId } });
  }

  async updateBankAccount(id: string, tenantId: string, data: Partial<CreateBankAccountDto>) {
    await this.getBankAccount(id, tenantId);
    return this.prisma.bankAccount.update({ where: { id }, data });
  }

  async getTransactions(tenantId: string, bankAccountId: string, query: PaginationDto) {
    const { page = 1, limit = 50 } = query;
    const account = await this.prisma.bankAccount.findFirst({ where: { id: bankAccountId, tenantId } });
    if (!account) throw new NotFoundException("Bank account not found");

    const where = { bankAccountId };
    const [data, total] = await Promise.all([
      this.prisma.bankStatement.findMany({ where, orderBy: { date: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.bankStatement.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createTransaction(dto: CreateBankTransactionDto, tenantId: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id: dto.bankAccountId, tenantId } });
    if (!account) throw new NotFoundException("Bank account not found");

    const txn = await this.prisma.bankStatement.create({
      data: {
        tenantId,
        companyId: account.companyId,
        bankAccountId: dto.bankAccountId,
        date: new Date(dto.date),
        description: dto.description,
        debit: dto.debit,
        credit: dto.credit,
        balance: dto.balance,
        reference: dto.reference,
        isReconciled: dto.isReconciled ?? false,
      },
    });

    await this.prisma.bankAccount.update({
      where: { id: dto.bankAccountId },
      data: { balance: dto.balance },
    });

    return txn;
  }

  async getSummary(tenantId: string, companyId: string) {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { tenantId, companyId, isActive: true },
      select: { id: true, code: true, name: true, currency: true, balance: true, bankName: true },
    });
    const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
    return { accounts, totalBalance };
  }
}
