import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CreateArInvoiceDto } from "./dto/create-ar-invoice.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";

@Injectable()
export class ArService {
  constructor(private prisma: PrismaService) {}

  // ─── Customers ────────────────────────────────────────────────────────────

  async getCustomers(tenantId: string, companyId: string, query: PaginationDto) {
    const { page = 1, limit = 25, search } = query;
    const where: any = { tenantId, companyId, isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.customer.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getCustomer(id: string, tenantId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      include: {
        invoices: {
          orderBy: { date: "desc" },
          take: 10,
          select: { id: true, number: true, date: true, total: true, balance: true, status: true },
        },
      },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  async createCustomer(dto: CreateCustomerDto, tenantId: string, companyId: string) {
    const existing = await this.prisma.customer.findUnique({
      where: { tenantId_companyId_code: { tenantId, companyId, code: dto.code } },
    });
    if (existing) throw new ConflictException(`Customer code ${dto.code} already exists`);
    return this.prisma.customer.create({ data: { ...dto, tenantId, companyId } });
  }

  async updateCustomer(id: string, tenantId: string, data: Partial<CreateCustomerDto>) {
    await this.getCustomer(id, tenantId);
    return this.prisma.customer.update({ where: { id }, data });
  }

  // ─── Invoices ─────────────────────────────────────────────────────────────

  async getInvoices(tenantId: string, companyId: string, query: PaginationDto & { status?: string }) {
    const { page = 1, limit = 25, search, status } = query;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { number: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.arInvoice.findMany({
        where,
        include: { customer: { select: { id: true, name: true, code: true } } },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.arInvoice.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getInvoice(id: string, tenantId: string) {
    const inv = await this.prisma.arInvoice.findFirst({
      where: { id, tenantId },
      include: {
        customer: true,
        lines: { include: { account: { select: { id: true, code: true, name: true } } }, orderBy: { lineNumber: "asc" } },
      },
    });
    if (!inv) throw new NotFoundException("Invoice not found");
    return inv;
  }

  async createInvoice(dto: CreateArInvoiceDto, tenantId: string, companyId: string, createdBy: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, tenantId } });
    if (!customer) throw new NotFoundException("Customer not found");

    const subtotal = dto.lines.reduce((s, l) => s + l.amount, 0);
    const taxAmount = dto.lines.reduce((s, l) => s + (l.taxAmount || 0), 0);
    const total = subtotal + taxAmount;

    const count = await this.prisma.arInvoice.count({ where: { tenantId, companyId } });
    const number = dto.number || `INV-${String(count + 1).padStart(6, "0")}`;

    return this.prisma.arInvoice.create({
      data: {
        tenantId, companyId,
        customerId: dto.customerId,
        number,
        date: new Date(dto.date),
        dueDate: new Date(dto.dueDate),
        currency: dto.currency || customer.currency || "USD",
        subtotal, taxAmount, total,
        balance: total,
        status: "DRAFT",
        notes: dto.notes,
        createdBy,
        lines: {
          create: dto.lines.map((l, i) => ({
            accountId: l.accountId,
            lineNumber: i + 1,
            description: l.description,
            quantity: l.quantity ?? 1,
            unitPrice: l.unitPrice,
            amount: l.amount,
            taxCode: l.taxCode,
            taxAmount: l.taxAmount ?? 0,
          })),
        },
      },
      include: { customer: true, lines: true },
    });
  }

  async postInvoice(id: string, tenantId: string, userId: string) {
    const inv = await this.getInvoice(id, tenantId);
    if (inv.status !== "DRAFT") throw new BadRequestException(`Invoice is already ${inv.status}`);
    return this.prisma.arInvoice.update({
      where: { id },
      data: { status: "POSTED", postedBy: userId, postedAt: new Date() },
    });
  }

  async getAgingReport(tenantId: string, companyId: string) {
    const invoices = await this.prisma.arInvoice.findMany({
      where: { tenantId, companyId, status: "POSTED", balance: { gt: 0 } },
      include: { customer: { select: { id: true, name: true, code: true } } },
      orderBy: { dueDate: "asc" },
    });

    const today = new Date();
    const buckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };

    const rows = invoices.map((inv) => {
      const daysOverdue = Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
      const balance = Number(inv.balance);
      if (daysOverdue <= 0) buckets.current += balance;
      else if (daysOverdue <= 30) buckets.days30 += balance;
      else if (daysOverdue <= 60) buckets.days60 += balance;
      else if (daysOverdue <= 90) buckets.days90 += balance;
      else buckets.over90 += balance;
      return { ...inv, daysOverdue };
    });

    return { rows, buckets, total: Object.values(buckets).reduce((a, b) => a + b, 0) };
  }
}
