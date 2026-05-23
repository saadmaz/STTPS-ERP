import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateVendorDto } from "./dto/create-vendor.dto";
import { CreateApInvoiceDto } from "./dto/create-ap-invoice.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";

@Injectable()
export class ApService {
  constructor(private prisma: PrismaService) {}

  // ─── Vendors ─────────────────────────────────────────────────────────────

  async getVendors(tenantId: string, companyId: string, query: PaginationDto) {
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
      this.prisma.vendor.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.vendor.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getVendor(id: string, tenantId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, tenantId },
      include: {
        invoices: {
          orderBy: { date: "desc" },
          take: 10,
          select: { id: true, number: true, date: true, total: true, balance: true, status: true },
        },
      },
    });
    if (!vendor) throw new NotFoundException("Vendor not found");
    return vendor;
  }

  async createVendor(dto: CreateVendorDto, tenantId: string, companyId: string) {
    const existing = await this.prisma.vendor.findUnique({
      where: { tenantId_companyId_code: { tenantId, companyId, code: dto.code } },
    });
    if (existing) throw new ConflictException(`Vendor code ${dto.code} already exists`);
    return this.prisma.vendor.create({ data: { ...dto, tenantId, companyId } });
  }

  async updateVendor(id: string, tenantId: string, data: Partial<CreateVendorDto>) {
    await this.getVendor(id, tenantId);
    return this.prisma.vendor.update({ where: { id }, data });
  }

  // ─── Invoices ─────────────────────────────────────────────────────────────

  async getInvoices(tenantId: string, companyId: string, query: PaginationDto & { status?: string }) {
    const { page = 1, limit = 25, search, status } = query;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { number: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.apInvoice.findMany({
        where,
        include: { vendor: { select: { id: true, name: true, code: true } } },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.apInvoice.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getInvoice(id: string, tenantId: string) {
    const inv = await this.prisma.apInvoice.findFirst({
      where: { id, tenantId },
      include: {
        vendor: true,
        lines: { include: { account: { select: { id: true, code: true, name: true } } }, orderBy: { lineNumber: "asc" } },
      },
    });
    if (!inv) throw new NotFoundException("Invoice not found");
    return inv;
  }

  async createInvoice(dto: CreateApInvoiceDto, tenantId: string, companyId: string, createdBy: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: dto.vendorId, tenantId } });
    if (!vendor) throw new NotFoundException("Vendor not found");

    const subtotal = dto.lines.reduce((s, l) => s + l.amount, 0);
    const taxAmount = dto.lines.reduce((s, l) => s + (l.taxAmount || 0), 0);
    const total = subtotal + taxAmount;

    const count = await this.prisma.apInvoice.count({ where: { tenantId, companyId } });
    const number = dto.number || `APINV-${String(count + 1).padStart(6, "0")}`;

    return this.prisma.apInvoice.create({
      data: {
        tenantId, companyId,
        vendorId: dto.vendorId,
        number,
        vendorRef: dto.vendorRef,
        date: new Date(dto.date),
        dueDate: new Date(dto.dueDate),
        currency: dto.currency || vendor.currency || "USD",
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
      include: { vendor: true, lines: true },
    });
  }

  async approveInvoice(id: string, tenantId: string, userId: string) {
    const inv = await this.getInvoice(id, tenantId);
    if (inv.status !== "DRAFT") throw new BadRequestException(`Invoice is already ${inv.status}`);
    return this.prisma.apInvoice.update({
      where: { id },
      data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() },
    });
  }

  async postInvoice(id: string, tenantId: string, userId: string) {
    const inv = await this.getInvoice(id, tenantId);
    if (!["DRAFT", "APPROVED"].includes(inv.status)) throw new BadRequestException(`Cannot post invoice with status ${inv.status}`);
    return this.prisma.apInvoice.update({
      where: { id },
      data: { status: "POSTED", postedBy: userId, postedAt: new Date() },
    });
  }

  async getAgingReport(tenantId: string, companyId: string) {
    const invoices = await this.prisma.apInvoice.findMany({
      where: { tenantId, companyId, status: { in: ["POSTED", "APPROVED"] }, balance: { gt: 0 } },
      include: { vendor: { select: { id: true, name: true, code: true } } },
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
