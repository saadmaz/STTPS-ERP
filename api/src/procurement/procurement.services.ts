import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { COLLECTIONS } from "../firestore/collections.js";
import { CompanyDoc } from "../firestore/models.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, Scope, systemContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { applyRate, extend, fromMinor, toMinor, toQty } from "../platform/data/money.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { ApprovalsService } from "../platform/approvals/approvals.service.js";
import { APPROVAL_COMPLETED, ApprovalCompletedPayload } from "../platform/approvals/approvals.models.js";
import { RecordsService } from "../platform/records/records.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { PRODUCT_COLLECTIONS, ProductDoc } from "../products/products.models.js";
import { InventoryLedger } from "../inventory/inventory.ledger.js";
import { SalesSettingsService } from "../sales/sales.services.js";
import { ExchangeRateService } from "../org/org.services.js";
import {
  GoodsReceiptDoc,
  PROCUREMENT_COLLECTIONS,
  PROCUREMENT_LISTS,
  PurchaseLine,
  PurchaseOrderDoc,
  ReceiptLine,
  RequisitionDoc,
  RequisitionLine,
  RfqDoc,
  SupplierDoc,
  SupplierReturnDoc,
} from "./procurement.models.js";
import {
  AwardDto,
  CreatePurchaseOrderDto,
  CreateReceiptDto,
  CreateRequisitionDto,
  CreateRfqDto,
  CreateSupplierDto,
  CreateSupplierReturnDto,
  PurchaseLineDto,
  RequisitionLineDto,
  RfqQuoteDto,
  SupplierConfirmDto,
  UpdatePurchaseOrderDto,
  UpdateReceiptDto,
  UpdateRequisitionDto,
  UpdateRfqDto,
  UpdateSupplierDto,
  UpdateSupplierReturnDto,
} from "./procurement.dto.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);
const STOCKED = new Set(["stock", "manufactured"]);
/** Still owed by the supplier: ordered less accepted (rejected goods are still owed). */
const outstanding = (l: PurchaseLine) => Math.max(0, l.qty - (l.received - l.rejected));

async function products(fs: FirestoreService, scope: Scope, ids: string[]): Promise<Map<string, ProductDoc>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, ProductDoc>();
  if (!unique.length) return map;
  for (const snap of await fs.db.getAll(...unique.map((id) => fs.collection(PRODUCT_COLLECTIONS.products).doc(id)))) {
    const p = snap.data() as ProductDoc | undefined;
    if (p && p.companyId === scope.companyId) map.set(snap.id, p);
  }
  return map;
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

@Injectable()
export class SupplierService extends MasterDataService<SupplierDoc, CreateSupplierDto, UpdateSupplierDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "procurement",
      entity: "supplier",
      label: "Supplier",
      collection: PROCUREMENT_COLLECTIONS.suppliers,
      route: "/procurement/suppliers",
      uniqueFields: ["code"],
      filterFields: ["status", "category", "preferred"],
      large: PROCUREMENT_LISTS.suppliers,
      numbering: { field: "code", key: "supplier", prefix: "SUP" },
    });
  }

  protected toNew(dto: CreateSupplierDto): NewDoc<SupplierDoc> {
    return {
      code: dto.code ?? "",
      name: dto.name.trim(),
      nameLower: dto.name.trim().toLowerCase(),
      category: orNull(dto.category),
      status: dto.status ?? "active",
      email: orNull(dto.email),
      phone: orNull(dto.phone),
      address: orNull(dto.address),
      taxId: orNull(dto.taxId),
      currency: dto.currency ?? "LKR",
      paymentTermsDays: dto.paymentTermsDays ?? 30,
      bank: dto.bank
        ? { bankName: dto.bank.bankName ?? null, accountName: dto.bank.accountName ?? null, accountNo: dto.bank.accountNo ?? null, branch: dto.bank.branch ?? null, swift: dto.bank.swift ?? null }
        : null,
      certifications: (dto.certifications ?? []).map((c) => ({ name: c.name, expiresOn: c.expiresOn?.slice(0, 10) ?? null })),
      preferred: dto.preferred ?? false,
      leadTimeDays: orNull(dto.leadTimeDays),
      performanceScore: null,
      receiptsCount: 0,
      onTimeCount: 0,
      acceptedQty: 0,
      receivedQty: 0,
      notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateSupplierDto): Patch<SupplierDoc> {
    const { customFields: _c, ...rest } = dto;
    const patch = { ...rest } as Patch<SupplierDoc>;
    if (dto.name) patch.nameLower = dto.name.trim().toLowerCase();
    return patch;
  }

  protected searchEntry(doc: SupplierDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code, keywords: [doc.email, doc.phone, doc.taxId] };
  }
}

async function activeSupplier(fs: FirestoreService, scope: Scope, id: string): Promise<SupplierDoc> {
  const s = (await fs.collection<SupplierDoc>(PROCUREMENT_COLLECTIONS.suppliers).doc(id).get()).data();
  if (!s || s.companyId !== scope.companyId || s.archivedAt) throw new BadRequestException("Supplier not found");
  if (s.status !== "active") throw new BadRequestException(`${s.name} is ${s.status.replace("_", " ")}`);
  return s;
}

// ─── Requisitions ─────────────────────────────────────────────────────────────

function requisitionLines(dto: RequisitionLineDto[], productMap: Map<string, ProductDoc>, currency: string): RequisitionLine[] {
  return dto.map((l) => {
    const product = l.productId ? productMap.get(l.productId) : undefined;
    if (l.productId && !product) throw new BadRequestException("Product not found");
    if (product && !product.isPurchasable) throw new BadRequestException(`${product.sku} cannot be purchased`);
    const description = l.description?.trim() || product?.name;
    if (!description) throw new BadRequestException("Describe items that are not products");
    const qty = toQty(l.qty);
    if (qty <= 0) throw new BadRequestException("Quantities must be positive");
    return {
      lineId: randomUUID().slice(0, 8),
      productId: product?.id ?? null,
      description,
      qty,
      uom: l.uom ?? product?.purchaseUom ?? product?.baseUom ?? "pcs",
      estimatedPrice: l.estimatedPrice ? toMinor(l.estimatedPrice, currency) : product && product.currency === currency ? product.purchasePrice : 0,
      suggestedSupplierId: l.suggestedSupplierId ?? product?.preferredSupplierId ?? null,
    };
  });
}

type RequisitionInput = CreateRequisitionDto & { built?: RequisitionLine[] };

@Injectable()
export class RequisitionService extends MasterDataService<RequisitionDoc, RequisitionInput, UpdateRequisitionDto & { built?: RequisitionLine[] }> implements OnModuleInit {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly approvals: ApprovalsService,
    private readonly events: EventBusService,
  ) {
    super(fs, audit, unique, {
      module: "procurement",
      entity: "requisition",
      label: "Purchase requisition",
      collection: PROCUREMENT_COLLECTIONS.requisitions,
      route: "/procurement/requisitions",
      references: [
        { field: "departmentId", collection: "orgDepartments", label: "Department" },
        { field: "costCentreId", collection: "orgCostCentres", label: "Cost centre" },
      ],
      filterFields: ["status", "requesterId", "departmentId"],
      large: PROCUREMENT_LISTS.requisitions,
      numbering: { field: "number", key: "requisition", prefix: "PR", yearly: true },
      customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "procurement.requisitionApproval", async (event) => {
      if (event.payload.entityType !== this.entityType) return;
      const ctx = systemContext(event, event.payload.decidedBy);
      const doc = await this.repo.find(ctx, event.payload.entityId);
      if (doc?.status !== "pending_approval") return;
      const status = event.payload.outcome === "approved" ? "approved" : event.payload.outcome === "rejected" ? "rejected" : "draft";
      await this.repo.update(ctx, doc.id, { status });
    });
  }

  async create(ctx: RequestContext, dto: RequisitionInput): Promise<RequisitionDoc> {
    const currency = dto.currency ?? "LKR";
    const built = requisitionLines(dto.lines, await products(this.firestore, ctx, dto.lines.map((l) => l.productId ?? "")), currency);
    return super.create(ctx, { ...dto, built });
  }

  async update(ctx: RequestContext, id: string, dto: UpdateRequisitionDto & { built?: RequisitionLine[] }, expectedVersion?: number): Promise<RequisitionDoc> {
    if (!dto.lines) return super.update(ctx, id, dto, expectedVersion);
    const before = await this.repo.get(ctx, id);
    const built = requisitionLines(dto.lines, await products(this.firestore, ctx, dto.lines.map((l) => l.productId ?? "")), dto.currency ?? before.currency);
    return super.update(ctx, id, { ...dto, built }, expectedVersion);
  }

  protected toNew(dto: RequisitionInput, ctx: RequestContext): NewDoc<RequisitionDoc> {
    const lines = dto.built!;
    return {
      number: "", requesterId: ctx.userId, departmentId: orNull(dto.departmentId), costCentreId: orNull(dto.costCentreId), projectId: orNull(dto.projectId),
      requiredDate: dto.requiredDate?.slice(0, 10) ?? null, justification: orNull(dto.justification), currency: dto.currency ?? "LKR",
      lines, estimatedTotal: lines.reduce((a, l) => a + extend(l.qty, l.estimatedPrice), 0), status: "draft", orderIds: [],
    };
  }

  protected toPatch(dto: UpdateRequisitionDto & { built?: RequisitionLine[] }, before: RequisitionDoc): Patch<RequisitionDoc> {
    if (!["draft", "rejected"].includes(before.status)) throw new BadRequestException("Only draft requisitions can be changed");
    const { lines: _l, built, ...rest } = dto;
    return { ...rest, ...(built ? { lines: built, estimatedTotal: built.reduce((a, l) => a + extend(l.qty, l.estimatedPrice), 0) } : {}), status: "draft" } as Patch<RequisitionDoc>;
  }

  async submit(ctx: RequestContext, id: string): Promise<RequisitionDoc> {
    const doc = await this.repo.get(ctx, id);
    if (!["draft", "rejected"].includes(doc.status)) throw new BadRequestException("Only draft requisitions can be submitted");
    const prepared = await this.approvals.prepare(ctx, {
      entityType: this.entityType,
      entityId: id,
      entityLabel: `${doc.number} · ${fromMinor(doc.estimatedTotal, doc.currency)} ${doc.currency}`,
      link: `/procurement/requisitions/${id}`,
      facts: { amount: doc.estimatedTotal, departmentId: doc.departmentId, costCentreId: doc.costCentreId, projectId: doc.projectId, requesterDepartmentId: doc.departmentId },
    });
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const request = await this.approvals.open(tx, ctx, prepared);
      return this.repo.applyUpdate(ctx, tx, before, { status: request.status === "approved" ? "approved" : "pending_approval" }).after;
    });
  }

  async cancel(ctx: RequestContext, id: string): Promise<RequisitionDoc> {
    const doc = await this.repo.get(ctx, id);
    if (["ordered", "cancelled"].includes(doc.status)) throw new BadRequestException(`This requisition is ${doc.status}`);
    if (doc.status === "pending_approval") throw new BadRequestException("Withdraw the approval request first");
    return (await this.repo.update(ctx, id, { status: "cancelled" })).after;
  }
}

// ─── Purchase orders ──────────────────────────────────────────────────────────

type PoInput = CreatePurchaseOrderDto & { built?: { lines: PurchaseLine[]; supplier: SupplierDoc; currency: string }; rfqId?: string | null };

@Injectable()
export class PurchaseOrderService extends MasterDataService<PurchaseOrderDoc, PoInput, UpdatePurchaseOrderDto & { built?: { lines: PurchaseLine[] } }> implements OnModuleInit {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly approvals: ApprovalsService,
    private readonly events: EventBusService,
    private readonly ledger: InventoryLedger,
    private readonly taxes: SalesSettingsService,
    private readonly records: RecordsService,
  ) {
    super(fs, audit, unique, {
      module: "procurement",
      entity: "order",
      label: "Purchase order",
      collection: PROCUREMENT_COLLECTIONS.orders,
      route: "/procurement/orders",
      references: [
        { field: "supplierId", collection: PROCUREMENT_COLLECTIONS.suppliers, label: "Supplier" },
        { field: "warehouseId", collection: "warehouses", label: "Warehouse" },
        { field: "requisitionId", collection: PROCUREMENT_COLLECTIONS.requisitions, label: "Requisition" },
      ],
      filterFields: ["status", "supplierId", "requisitionId"],
      large: PROCUREMENT_LISTS.orders,
      numbering: { field: "number", key: "purchaseOrder", prefix: "PO", yearly: true },
      customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "procurement.orderApproval", async (event) => {
      if (event.payload.entityType !== this.entityType) return;
      const ctx = systemContext(event, event.payload.decidedBy);
      await this.firestore.runTransaction(async (tx) => {
        const before = await this.repo.find(ctx, event.payload.entityId, tx);
        if (before?.status !== "pending_approval") return;
        if (event.payload.outcome === "approved") (await this.prepareApprove(tx, ctx, before)).apply();
        else this.repo.applyUpdate(ctx, tx, before, { status: "draft" });
      });
    });
  }

  async buildLines(ctx: RequestContext, input: PurchaseLineDto[], currency: string): Promise<PurchaseLine[]> {
    const map = await products(this.firestore, ctx, input.map((l) => l.productId));
    const settings = await this.taxes.get(ctx);
    return input.map((l) => {
      const p = map.get(l.productId);
      if (!p) throw new BadRequestException("Product not found");
      if (!p.isPurchasable) throw new BadRequestException(`${p.sku} cannot be purchased`);
      const qty = toQty(l.qty);
      if (qty <= 0) throw new BadRequestException("Quantities must be positive");
      if (l.unitPrice === undefined && p.currency !== currency) throw new BadRequestException(`Enter a ${currency} price for ${p.sku}`);
      const unitPrice = l.unitPrice !== undefined ? toMinor(l.unitPrice, currency) : p.purchasePrice;
      const taxCode = l.taxCode ?? p.taxCategory ?? settings.defaultTaxCode;
      const tax = taxCode ? settings.taxRates.find((t) => t.code === taxCode) : undefined;
      if (taxCode && !tax) throw new BadRequestException(`Unknown tax code ${taxCode}`);
      const net = extend(qty, unitPrice);
      const taxAmount = applyRate(net, tax?.rate ?? 0, 4);
      return {
        lineId: randomUUID().slice(0, 8), productId: p.id, description: l.description?.trim() || p.name, qty, unitPrice, taxCode: tax?.code ?? null, taxRate: tax?.rate ?? 0,
        net, tax: taxAmount, total: net + taxAmount, received: 0, rejected: 0, returned: 0, stocked: STOCKED.has(p.type),
      };
    });
  }

  async create(ctx: RequestContext, dto: PoInput): Promise<PurchaseOrderDoc> {
    const supplier = await activeSupplier(this.firestore, ctx, dto.supplierId);
    const currency = dto.currency ?? supplier.currency;
    const lines = await this.buildLines(ctx, dto.lines, currency);
    return super.create(ctx, { ...dto, built: { lines, supplier, currency } });
  }

  async update(ctx: RequestContext, id: string, dto: UpdatePurchaseOrderDto & { built?: { lines: PurchaseLine[] } }, expectedVersion?: number): Promise<PurchaseOrderDoc> {
    if (!dto.lines) return super.update(ctx, id, dto, expectedVersion);
    const before = await this.repo.get(ctx, id);
    return super.update(ctx, id, { ...dto, built: { lines: await this.buildLines(ctx, dto.lines, before.currency) } }, expectedVersion);
  }

  protected toNew(dto: PoInput): NewDoc<PurchaseOrderDoc> {
    const { lines, supplier, currency } = dto.built!;
    return {
      number: "", supplierId: supplier.id, requisitionId: orNull(dto.requisitionId), rfqId: dto.rfqId ?? null, currency, date: dto.date?.slice(0, 10) ?? today(),
      expectedDate: dto.expectedDate?.slice(0, 10) ?? (supplier.leadTimeDays ? new Date(Date.now() + supplier.leadTimeDays * 86_400_000).toISOString().slice(0, 10) : null),
      warehouseId: dto.warehouseId, paymentTermsDays: supplier.paymentTermsDays, lines, totals: this.totals(lines), status: "draft", amendment: 0,
      supplierConfirmedAt: null, supplierReference: null, cancelReason: null, notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdatePurchaseOrderDto & { built?: { lines: PurchaseLine[] } }, before: PurchaseOrderDoc): Patch<PurchaseOrderDoc> {
    if (before.status !== "draft") throw new BadRequestException("Only draft orders can be changed; amend an approved order");
    const { lines: _l, built, supplierId, currency, ...rest } = dto;
    if (supplierId && supplierId !== before.supplierId) throw new BadRequestException("Create a new order for a different supplier");
    if (currency && currency !== before.currency) throw new BadRequestException("The currency cannot change");
    return { ...rest, ...(built ? { lines: built.lines, totals: this.totals(built.lines) } : {}) } as Patch<PurchaseOrderDoc>;
  }

  protected afterWrite(tx: Transaction, ctx: RequestContext, after: PurchaseOrderDoc, before: PurchaseOrderDoc | null): void {
    if (!before && after.requisitionId) this.records.linkInTx(tx, ctx, { type: "procurement.requisition", id: after.requisitionId }, { type: this.entityType, id: after.id }, "ordered_by");
  }

  totals(lines: PurchaseLine[]) {
    return { subtotal: lines.reduce((a, l) => a + l.net, 0), tax: lines.reduce((a, l) => a + l.tax, 0), total: lines.reduce((a, l) => a + l.total, 0) };
  }

  private async prepareApprove(tx: Transaction, ctx: RequestContext, before: PurchaseOrderDoc) {
    const stocked = before.lines.filter((l) => l.stocked);
    const onOrder = stocked.length ? await this.ledger.adjustOnOrder(tx, ctx, stocked.map((l) => ({ productId: l.productId, delta: outstanding(l) }))) : null;
    return {
      apply: () => {
        onOrder?.commit();
        const { after } = this.repo.applyUpdate(ctx, tx, before, { status: "approved" });
        this.events.publish(tx, ctx, "PurchaseOrderApproved", { entity: this.entityType, entityId: before.id }, { orderId: before.id, supplierId: before.supplierId, total: before.totals.total, currency: before.currency });
        return after;
      },
    };
  }

  /** Approval by the thresholds configured for purchase orders; approved at once when none apply. */
  async submit(ctx: RequestContext, id: string): Promise<PurchaseOrderDoc> {
    const doc = await this.repo.get(ctx, id);
    if (doc.status !== "draft") throw new BadRequestException("Only draft orders can be submitted");
    await activeSupplier(this.firestore, ctx, doc.supplierId);
    const prepared = await this.approvals.prepare(ctx, {
      entityType: this.entityType,
      entityId: id,
      entityLabel: `${doc.number}${doc.amendment ? ` amendment ${doc.amendment}` : ""} · ${fromMinor(doc.totals.total, doc.currency)} ${doc.currency}`,
      link: `/procurement/orders/${id}`,
      facts: { amount: doc.totals.total, total: doc.totals.total, supplierId: doc.supplierId, amendment: doc.amendment },
    });
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const approval = await this.prepareApprove(tx, ctx, before);
      const request = await this.approvals.open(tx, ctx, prepared);
      if (request.status === "approved") return approval.apply();
      return this.repo.applyUpdate(ctx, tx, before, { status: "pending_approval" }).after;
    });
  }

  async markSent(ctx: RequestContext, id: string): Promise<PurchaseOrderDoc> {
    const doc = await this.repo.get(ctx, id);
    if (doc.status !== "approved") throw new BadRequestException("Only approved orders can be sent");
    return (await this.repo.update(ctx, id, { status: "sent" })).after;
  }

  async supplierConfirm(ctx: RequestContext, id: string, dto: SupplierConfirmDto): Promise<PurchaseOrderDoc> {
    const doc = await this.repo.get(ctx, id);
    if (!["approved", "sent"].includes(doc.status)) throw new BadRequestException("Only approved or sent orders can be confirmed");
    return (await this.repo.update(ctx, id, {
      status: "confirmed", supplierConfirmedAt: new Date().toISOString(), supplierReference: dto.supplierReference ?? null, expectedDate: dto.expectedDate?.slice(0, 10) ?? doc.expectedDate,
    })).after;
  }

  /** Reopens an approved order for changes; it must be approved again (as a new amendment). */
  async amend(ctx: RequestContext, id: string): Promise<PurchaseOrderDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (!["approved", "sent", "confirmed"].includes(before.status)) throw new BadRequestException("Only approved orders can be amended");
      if (before.lines.some((l) => l.received > 0)) throw new BadRequestException("Goods have been received; close this order and raise a new one");
      const stocked = before.lines.filter((l) => l.stocked);
      const onOrder = stocked.length ? await this.ledger.adjustOnOrder(tx, ctx, stocked.map((l) => ({ productId: l.productId, delta: -outstanding(l) }))) : null;
      onOrder?.commit();
      return this.repo.applyUpdate(ctx, tx, before, { status: "draft", amendment: before.amendment + 1, supplierConfirmedAt: null }).after;
    });
  }

  /** Cancels (nothing received) or closes (partly received) and takes the rest off order. */
  async cancel(ctx: RequestContext, id: string, reason: string): Promise<PurchaseOrderDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (["received", "cancelled", "closed"].includes(before.status)) throw new BadRequestException(`A ${before.status} order cannot be cancelled`);
      const wasOnOrder = ["approved", "sent", "confirmed", "partially_received"].includes(before.status);
      const stocked = before.lines.filter((l) => l.stocked && outstanding(l) > 0);
      const onOrder = wasOnOrder && stocked.length ? await this.ledger.adjustOnOrder(tx, ctx, stocked.map((l) => ({ productId: l.productId, delta: -outstanding(l) }))) : null;
      onOrder?.commit();
      const partly = before.lines.some((l) => l.received > 0);
      const { after } = this.repo.applyUpdate(ctx, tx, before, { status: partly ? "closed" : "cancelled", cancelReason: reason });
      this.audit.record(ctx, { module: "procurement", action: partly ? "closed" : "cancelled", entity: this.entityType, entityId: id, reason }, tx);
      return after;
    });
  }

  protected searchEntry(doc: PurchaseOrderDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: `${fromMinor(doc.totals.total, doc.currency)} ${doc.currency}`, keywords: [doc.supplierReference] };
  }
}

// ─── RFQs ─────────────────────────────────────────────────────────────────────

type RfqInput = CreateRfqDto & { built?: RequisitionLine[] };

@Injectable()
export class RfqService extends MasterDataService<RfqDoc, RfqInput, UpdateRfqDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly requisitions: RequisitionService,
    private readonly orders: PurchaseOrderService,
  ) {
    super(fs, audit, unique, {
      module: "procurement",
      entity: "rfq",
      label: "Request for quotation",
      collection: PROCUREMENT_COLLECTIONS.rfqs,
      route: "/procurement/rfqs",
      filterFields: ["status", "requisitionId"],
      large: PROCUREMENT_LISTS.rfqs,
      numbering: { field: "number", key: "rfq", prefix: "RFQ", yearly: true },
      customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: RfqInput): Promise<RfqDoc> {
    for (const s of dto.supplierIds) await activeSupplier(this.firestore, ctx, s);
    let built: RequisitionLine[];
    if (dto.requisitionId) {
      const req = await this.requisitions.repo.get(ctx, dto.requisitionId);
      if (req.status !== "approved") throw new BadRequestException("The requisition must be approved first");
      built = req.lines;
    } else {
      if (!dto.lines?.length) throw new BadRequestException("Add lines or choose a requisition");
      built = requisitionLines(dto.lines, await products(this.firestore, ctx, dto.lines.map((l) => l.productId ?? "")), "LKR");
    }
    return super.create(ctx, { ...dto, built });
  }

  protected toNew(dto: RfqInput): NewDoc<RfqDoc> {
    return {
      number: "", requisitionId: orNull(dto.requisitionId), lines: dto.built!, supplierIds: [...new Set(dto.supplierIds)], quotes: [], dueDate: dto.dueDate?.slice(0, 10) ?? null,
      status: "open", awardedSupplierId: null, awardReason: null, orderId: null,
    };
  }

  protected toPatch(dto: UpdateRfqDto, before: RfqDoc): Patch<RfqDoc> {
    if (before.status !== "open") throw new BadRequestException("This RFQ is closed");
    return { dueDate: dto.dueDate?.slice(0, 10) ?? before.dueDate };
  }

  /** Records a supplier's prices (replacing any earlier quote from them). */
  async addQuote(ctx: RequestContext, id: string, dto: RfqQuoteDto): Promise<RfqDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "open") throw new BadRequestException("This RFQ is closed");
      if (!before.supplierIds.includes(dto.supplierId)) throw new BadRequestException("That supplier was not invited");
      const prices: Record<string, number> = {};
      for (const line of before.lines) {
        const p = dto.prices[line.lineId];
        if (p === undefined) continue;
        if (!/^\d{1,13}(\.\d{1,4})?$/.test(p)) throw new BadRequestException(`Invalid price for ${line.description}`);
        prices[line.lineId] = toMinor(p, "LKR");
      }
      if (Object.keys(prices).length === 0) throw new BadRequestException("Enter at least one price");
      const quotes = [...before.quotes.filter((q) => q.supplierId !== dto.supplierId), { supplierId: dto.supplierId, receivedAt: new Date().toISOString(), prices, leadTimeDays: dto.leadTimeDays ?? null, notes: dto.notes ?? null }];
      return this.repo.applyUpdate(ctx, tx, before, { quotes }).after;
    });
  }

  /** Side-by-side totals per supplier; complete quotes cheapest first. */
  async compare(ctx: RequestContext, id: string) {
    const rfq = await this.repo.get(ctx, id);
    return rfq.quotes
      .map((q) => ({
        supplierId: q.supplierId,
        complete: rfq.lines.every((l) => q.prices[l.lineId] !== undefined),
        total: rfq.lines.reduce((a, l) => a + (q.prices[l.lineId] !== undefined ? extend(l.qty, q.prices[l.lineId]!) : 0), 0),
        leadTimeDays: q.leadTimeDays,
        lines: rfq.lines.map((l) => ({ lineId: l.lineId, description: l.description, unitPrice: q.prices[l.lineId] ?? null })),
      }))
      .sort((a, b) => Number(b.complete) - Number(a.complete) || a.total - b.total);
  }

  /** Awards to a supplier and raises a draft purchase order at their prices. */
  async award(ctx: RequestContext, id: string, dto: AwardDto): Promise<{ rfq: RfqDoc; order: PurchaseOrderDoc }> {
    const rfq = await this.repo.get(ctx, id);
    if (rfq.status !== "open") throw new BadRequestException("This RFQ is closed");
    const quote = rfq.quotes.find((q) => q.supplierId === dto.supplierId);
    if (!quote) throw new BadRequestException("That supplier has not quoted");
    const comparison = await this.compare(ctx, id);
    if (comparison[0]?.supplierId !== dto.supplierId && !dto.reason?.trim()) throw new BadRequestException("Say why you are not choosing the cheapest complete quote");
    const missing = rfq.lines.filter((l) => !l.productId || quote.prices[l.lineId] === undefined);
    if (missing.length) throw new BadRequestException(`Cannot order ${missing.map((l) => l.description).join(", ")}: needs a product and a quoted price`);
    if (!dto.warehouseId) throw new BadRequestException("Choose the receiving warehouse");
    const order = await this.orders.create(ctx, {
      supplierId: dto.supplierId,
      requisitionId: rfq.requisitionId ?? undefined,
      warehouseId: dto.warehouseId,
      currency: "LKR",
      lines: rfq.lines.map((l) => ({ productId: l.productId!, qty: String(l.qty / 1000), unitPrice: fromMinor(quote.prices[l.lineId]!, "LKR"), description: l.description })),
      rfqId: id,
    });
    const { after } = await this.repo.update(ctx, id, { status: "awarded", awardedSupplierId: dto.supplierId, awardReason: dto.reason ?? null, orderId: order.id });
    if (rfq.requisitionId) {
      await this.firestore.runTransaction(async (tx) => {
        const req = await this.requisitions.repo.get(ctx, rfq.requisitionId!, tx);
        this.requisitions.repo.applyUpdate(ctx, tx, req, { status: "ordered", orderIds: [...req.orderIds, order.id] });
      });
    }
    return { rfq: after, order };
  }
}

// ─── Goods receipts ───────────────────────────────────────────────────────────

type ReceiptInput = CreateReceiptDto & { built?: { order: PurchaseOrderDoc; lines: ReceiptLine[] } };

@Injectable()
export class GoodsReceiptService extends MasterDataService<GoodsReceiptDoc, ReceiptInput, UpdateReceiptDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly orders: PurchaseOrderService,
    private readonly ledger: InventoryLedger,
    private readonly events: EventBusService,
    private readonly rates: ExchangeRateService,
    private readonly records: RecordsService,
  ) {
    super(fs, audit, unique, {
      module: "procurement",
      entity: "receipt",
      label: "Goods receipt",
      collection: PROCUREMENT_COLLECTIONS.receipts,
      route: "/procurement/receipts",
      filterFields: ["status", "orderId", "supplierId"],
      large: PROCUREMENT_LISTS.receipts,
      numbering: { field: "number", key: "goodsReceipt", prefix: "GRN", yearly: true },
      customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: ReceiptInput): Promise<GoodsReceiptDoc> {
    const order = await this.orders.repo.get(ctx, dto.orderId);
    if (!["approved", "sent", "confirmed", "partially_received"].includes(order.status)) throw new BadRequestException("Only approved orders can be received");
    const lines: ReceiptLine[] = dto.lines.map((l) => {
      const ol = order.lines.find((x) => x.lineId === l.orderLineId);
      if (!ol) throw new BadRequestException("Order line not found");
      const received = toQty(l.received);
      const rejected = l.rejected ? toQty(l.rejected) : 0;
      if (received <= 0) throw new BadRequestException("Received quantities must be positive");
      if (rejected > received) throw new BadRequestException("Cannot reject more than was received");
      const outstanding = ol.qty - (ol.received - ol.rejected);
      if (received - rejected > outstanding) throw new BadRequestException(`Only ${outstanding / 1000} of ${ol.description} is still expected`);
      if (rejected && !l.rejectReason) throw new BadRequestException("Give a reason for rejected goods");
      return {
        orderLineId: ol.lineId, productId: ol.productId, received, accepted: received - rejected, rejected, rejectReason: l.rejectReason ?? null,
        lotNo: l.lotNo ?? null, expiryDate: l.expiryDate?.slice(0, 10) ?? null, serialNos: l.serialNos ?? [], locationId: l.locationId ?? null,
      };
    });
    return super.create(ctx, { ...dto, built: { order, lines } });
  }

  protected toNew(dto: ReceiptInput): NewDoc<GoodsReceiptDoc> {
    const { order, lines } = dto.built!;
    return {
      number: "", orderId: order.id, supplierId: order.supplierId, warehouseId: order.warehouseId, date: dto.date?.slice(0, 10) ?? today(),
      supplierDeliveryNote: orNull(dto.supplierDeliveryNote), lines, status: "draft", postedAt: null, notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateReceiptDto, before: GoodsReceiptDoc): Patch<GoodsReceiptDoc> {
    if (before.status !== "draft") throw new BadRequestException("Posted receipts cannot be changed");
    return { ...dto } as Patch<GoodsReceiptDoc>;
  }

  protected afterWrite(tx: Transaction, ctx: RequestContext, after: GoodsReceiptDoc, before: GoodsReceiptDoc | null): void {
    if (!before) this.records.linkInTx(tx, ctx, { type: "procurement.order", id: after.orderId }, { type: this.entityType, id: after.id }, "received_by");
  }

  /** The order's unit price in the company currency, per base unit. */
  private async costConverter(ctx: RequestContext, order: PurchaseOrderDoc, date: string): Promise<(price: number) => number> {
    const company = (await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(ctx.companyId).get()).data();
    const base = company?.currency ?? "LKR";
    if (order.currency === base) return (p) => p;
    const rate = await this.rates.rateOn(ctx, order.currency, base, date);
    if (!rate) throw new BadRequestException(`Add an exchange rate from ${order.currency} to ${base} for ${date}`);
    const [whole, frac = ""] = rate.split(".");
    const scaled = BigInt(whole! + frac.padEnd(10, "0").slice(0, 10));
    return (p) => Number((BigInt(p) * scaled + 5_000_000_000n) / 10_000_000_000n);
  }

  /** Puts accepted goods into stock at the order price and updates the order and the supplier's record. */
  async post(ctx: RequestContext, id: string): Promise<GoodsReceiptDoc> {
    const draft = await this.repo.get(ctx, id);
    const order0 = await this.orders.repo.get(ctx, draft.orderId);
    const convert = await this.costConverter(ctx, order0, draft.date);
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "draft") throw new BadRequestException("This receipt is already posted");
      const order = await this.orders.repo.get(ctx, before.orderId, tx);
      const supplierRef = this.firestore.collection<SupplierDoc>(PROCUREMENT_COLLECTIONS.suppliers).doc(order.supplierId);
      const supplier = (await tx.get(supplierRef)).data()!;
      const byLine = new Map(order.lines.map((l) => [l.lineId, l]));
      for (const l of before.lines) {
        const ol = byLine.get(l.orderLineId)!;
        if (l.accepted > ol.qty - (ol.received - ol.rejected)) throw new BadRequestException(`${ol.description} has already been received`);
      }
      const stocked = before.lines.filter((l) => byLine.get(l.orderLineId)!.stocked && l.accepted > 0);
      const plan = stocked.length
        ? await this.ledger.prepare(tx, ctx, stocked.map((l) => ({
            type: "purchase" as const, productId: l.productId, warehouseId: before.warehouseId, locationId: l.locationId, lotNo: l.lotNo, expiryDate: l.expiryDate,
            serialNos: l.serialNos, qty: l.accepted, unitCost: convert(byLine.get(l.orderLineId)!.unitPrice), onOrderDelta: -l.accepted,
            reference: { entityType: this.entityType, entityId: id, label: before.number }, date: before.date,
          })))
        : null;

      // Writes.
      const movements = plan?.commit() ?? [];
      const orderLines = order.lines.map((ol) => {
        const mine = before.lines.filter((l) => l.orderLineId === ol.lineId);
        return mine.length ? { ...ol, received: ol.received + mine.reduce((a, l) => a + l.received, 0), rejected: ol.rejected + mine.reduce((a, l) => a + l.rejected, 0) } : ol;
      });
      const complete = orderLines.every((l) => l.received - l.rejected >= l.qty);
      this.orders.repo.applyUpdate(ctx, tx, order, { lines: orderLines, status: complete ? "received" : "partially_received" });

      const accepted = before.lines.reduce((a, l) => a + l.accepted, 0);
      const received = before.lines.reduce((a, l) => a + l.received, 0);
      const onTime = !order.expectedDate || before.date <= order.expectedDate;
      const next = {
        receiptsCount: supplier.receiptsCount + 1,
        onTimeCount: supplier.onTimeCount + (onTime ? 1 : 0),
        acceptedQty: supplier.acceptedQty + accepted,
        receivedQty: supplier.receivedQty + received,
      };
      const score = Math.round(((next.onTimeCount / next.receiptsCount) * 0.5 + (next.acceptedQty / Math.max(1, next.receivedQty)) * 0.5) * 100);
      tx.update(supplierRef, { ...next, performanceScore: score });

      const costs = new Map(stocked.map((l, i) => [l, movements[i]!.unitCost]));
      const lines = before.lines.map((l) => ({ ...l, unitCost: costs.get(l) ?? convert(byLine.get(l.orderLineId)!.unitPrice) }));
      const { after } = this.repo.applyUpdate(ctx, tx, before, { status: "posted", postedAt: new Date().toISOString(), lines });
      this.ledger.auditPosting(tx, ctx, this.entityType, id, movements);
      this.events.publish(tx, ctx, "GoodsReceived", { entity: this.entityType, entityId: id }, {
        receiptId: id, orderId: order.id, supplierId: order.supplierId, currency: order.currency, date: before.date,
        lines: before.lines.map((l) => {
          const ol = byLine.get(l.orderLineId)!;
          return { orderLineId: l.orderLineId, productId: l.productId, accepted: l.accepted, rejected: l.rejected, unitPrice: ol.unitPrice, taxRate: ol.taxRate };
        }),
      });
      return after;
    });
  }

  async cancel(ctx: RequestContext, id: string): Promise<GoodsReceiptDoc> {
    const r = await this.repo.get(ctx, id);
    if (r.status !== "draft") throw new BadRequestException("Posted receipts cannot be cancelled; return the goods to the supplier");
    return (await this.repo.update(ctx, id, { status: "cancelled" })).after;
  }
}

// ─── Supplier returns ─────────────────────────────────────────────────────────

type SupplierReturnInput = CreateSupplierReturnDto & { built?: { receipt: GoodsReceiptDoc } };

@Injectable()
export class SupplierReturnService extends MasterDataService<SupplierReturnDoc, SupplierReturnInput, UpdateSupplierReturnDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly receipts: GoodsReceiptService,
    private readonly orders: PurchaseOrderService,
    private readonly ledger: InventoryLedger,
    private readonly events: EventBusService,
  ) {
    super(fs, audit, unique, {
      module: "procurement",
      entity: "supplierReturn",
      label: "Supplier return",
      collection: PROCUREMENT_COLLECTIONS.returns,
      permission: "procurement.receipt",
      route: "/procurement/returns",
      filterFields: ["status", "supplierId"],
      large: PROCUREMENT_LISTS.returns,
      numbering: { field: "number", key: "supplierReturn", prefix: "SRN", yearly: true },
      customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: SupplierReturnInput): Promise<SupplierReturnDoc> {
    const receipt = await this.receipts.repo.get(ctx, dto.receiptId);
    if (receipt.status !== "posted") throw new BadRequestException("Only posted receipts can be returned");
    const prior = (await this.repo.collection.where("companyId", "==", ctx.companyId).where("receiptId", "==", receipt.id).get()).docs
      .map((d) => d.data())
      .filter((r) => r.status !== "cancelled");
    for (const l of dto.lines) {
      const rl = receipt.lines[l.receiptLineIndex];
      if (!rl) throw new BadRequestException("Receipt line not found");
      const already = prior.flatMap((r) => r.lines).filter((x) => x.receiptLineIndex === l.receiptLineIndex).reduce((a, x) => a + x.qty, 0);
      if (toQty(l.qty) <= 0 || toQty(l.qty) > rl.accepted - already) throw new BadRequestException(`At most ${(rl.accepted - already) / 1000} can be returned on line ${l.receiptLineIndex + 1}`);
    }
    return super.create(ctx, { ...dto, built: { receipt } });
  }

  protected toNew(dto: SupplierReturnInput): NewDoc<SupplierReturnDoc> {
    const { receipt } = dto.built!;
    return {
      number: "", receiptId: receipt.id, orderId: receipt.orderId, supplierId: receipt.supplierId, warehouseId: receipt.warehouseId, reason: dto.reason,
      lines: dto.lines.map((l) => ({ receiptLineIndex: l.receiptLineIndex, productId: receipt.lines[l.receiptLineIndex]!.productId, qty: toQty(l.qty), lotNo: receipt.lines[l.receiptLineIndex]!.lotNo, serialNos: l.serialNos ?? [] })),
      status: "draft", shippedAt: null,
    };
  }

  protected toPatch(dto: UpdateSupplierReturnDto, before: SupplierReturnDoc): Patch<SupplierReturnDoc> {
    if (before.status !== "draft") throw new BadRequestException("Shipped returns cannot be changed");
    return { ...dto } as Patch<SupplierReturnDoc>;
  }

  /** Sends the goods back: stock goes out at the cost it came in with. */
  async ship(ctx: RequestContext, id: string): Promise<SupplierReturnDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "draft") throw new BadRequestException("Already shipped");
      const receipt = await this.receipts.repo.get(ctx, before.receiptId, tx);
      const order = await this.orders.repo.get(ctx, before.orderId, tx);
      const stockedLines = before.lines.filter((l) => order.lines.find((ol) => ol.lineId === receipt.lines[l.receiptLineIndex]!.orderLineId)?.stocked);
      const plan = stockedLines.length
        ? await this.ledger.prepare(tx, ctx, stockedLines.map((l) => ({
            type: "supplier_return" as const, productId: l.productId, warehouseId: before.warehouseId, lotNo: l.lotNo, serialNos: l.serialNos, qty: -l.qty,
            reference: { entityType: this.entityType, entityId: id, label: before.number }, reason: before.reason,
          })))
        : null;
      const movements = plan?.commit() ?? [];
      const orderLines = order.lines.map((ol) => {
        const back = before.lines.filter((l) => receipt.lines[l.receiptLineIndex]!.orderLineId === ol.lineId).reduce((a, l) => a + l.qty, 0);
        return back ? { ...ol, returned: ol.returned + back } : ol;
      });
      this.orders.repo.applyUpdate(ctx, tx, order, { lines: orderLines });
      this.ledger.auditPosting(tx, ctx, this.entityType, id, movements);
      this.events.publish(tx, ctx, "SupplierReturnShipped", { entity: this.entityType, entityId: id }, {
        returnId: id, orderId: order.id, supplierId: order.supplierId, currency: order.currency,
        lines: before.lines.map((l) => {
          const ol = order.lines.find((x) => x.lineId === receipt.lines[l.receiptLineIndex]!.orderLineId)!;
          return { productId: l.productId, qty: l.qty, unitPrice: ol.unitPrice, taxRate: ol.taxRate };
        }),
      });
      return this.repo.applyUpdate(ctx, tx, before, { status: "shipped", shippedAt: new Date().toISOString() }).after;
    });
  }

  async cancel(ctx: RequestContext, id: string): Promise<SupplierReturnDoc> {
    const r = await this.repo.get(ctx, id);
    if (r.status !== "draft") throw new BadRequestException("Shipped returns cannot be cancelled");
    return (await this.repo.update(ctx, id, { status: "cancelled" })).after;
  }
}


// ─── Analytics ────────────────────────────────────────────────────────────────

const SPENT = new Set(["approved", "sent", "confirmed", "partially_received", "received", "closed"]);

@Injectable()
export class ProcurementAnalyticsService {
  constructor(private readonly firestore: FirestoreService) {}

  /** Spend by supplier, category and department, price variance, lead times and delivery performance (blueprint §9). */
  async summary(ctx: RequestContext, range: { from?: string; to?: string } = {}) {
    const col = (name: string) => this.firestore.collection(name).where("companyId", "==", ctx.companyId).where("archived", "==", false);
    const [orderSnap, receiptSnap, supplierSnap, productSnap, reqSnap] = await Promise.all([
      col(PROCUREMENT_COLLECTIONS.orders).select("supplierId", "requisitionId", "currency", "date", "status", "lines", "totals").limit(10_000).get(),
      col(PROCUREMENT_COLLECTIONS.receipts).select("orderId", "supplierId", "date", "status").limit(20_000).get(),
      col(PROCUREMENT_COLLECTIONS.suppliers).select("name", "performanceScore", "receiptsCount", "onTimeCount", "acceptedQty", "receivedQty").limit(5_000).get(),
      col(PRODUCT_COLLECTIONS.products).select("categoryId", "purchasePrice", "currency").limit(20_000).get(),
      col(PROCUREMENT_COLLECTIONS.requisitions).select("departmentId").limit(20_000).get(),
    ]);
    const inRange = (d: string) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
    const orders = orderSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Pick<PurchaseOrderDoc, "supplierId" | "requisitionId" | "currency" | "date" | "status" | "lines" | "totals">) }))
      .filter((o) => SPENT.has(o.status) && inRange(o.date));
    const productInfo = new Map(productSnap.docs.map((d) => [d.id, d.data() as Pick<ProductDoc, "categoryId" | "purchasePrice" | "currency">]));
    const department = new Map(reqSnap.docs.map((d) => [d.id, (d.data() as Pick<RequisitionDoc, "departmentId">).departmentId]));

    const add = (m: Record<string, number>, k: string, v: number) => void (m[k] = (m[k] ?? 0) + v);
    const bySupplier: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byDepartment: Record<string, number> = {};
    const prices = new Map<string, { qty: number; spend: number; min: number; max: number; standard: number | null; variance: number }>();
    let openCommitment = 0;
    for (const o of orders) {
      add(bySupplier, o.supplierId, o.totals.subtotal);
      add(byDepartment, (o.requisitionId && department.get(o.requisitionId)) || "unassigned", o.totals.subtotal);
      for (const l of o.lines) {
        const info = productInfo.get(l.productId);
        add(byCategory, info?.categoryId ?? "uncategorised", l.net);
        const standard = info && info.currency === o.currency ? info.purchasePrice : null;
        const p = prices.get(l.productId) ?? { qty: 0, spend: 0, min: l.unitPrice, max: l.unitPrice, standard, variance: 0 };
        p.qty += l.qty;
        p.spend += l.net;
        p.min = Math.min(p.min, l.unitPrice);
        p.max = Math.max(p.max, l.unitPrice);
        if (standard !== null) p.variance += extend(l.qty, l.unitPrice - standard);
        prices.set(l.productId, p);
        if (!["received", "closed"].includes(o.status)) openCommitment += extend(Math.max(0, l.qty - (l.received - l.rejected)), l.unitPrice);
      }
    }

    const orderDate = new Map(orders.map((o) => [o.id, o.date]));
    const leadDays: Record<string, number[]> = {};
    for (const r of receiptSnap.docs.map((d) => d.data() as Pick<GoodsReceiptDoc, "orderId" | "supplierId" | "date" | "status">)) {
      const placed = orderDate.get(r.orderId);
      if (r.status !== "posted" || !placed) continue;
      (leadDays[r.supplierId] ??= []).push(Math.max(0, (Date.parse(r.date) - Date.parse(placed)) / 86_400_000));
    }
    const suppliers = supplierSnap.docs.map((d) => {
      const s = d.data() as Pick<SupplierDoc, "name" | "performanceScore" | "receiptsCount" | "onTimeCount" | "acceptedQty" | "receivedQty">;
      const days = leadDays[d.id] ?? [];
      return {
        supplierId: d.id, name: s.name, spend: bySupplier[d.id] ?? 0, performanceScore: s.performanceScore,
        onTimeRate: s.receiptsCount ? s.onTimeCount / s.receiptsCount : null,
        acceptanceRate: s.receivedQty ? s.acceptedQty / s.receivedQty : null,
        averageLeadTimeDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      };
    }).filter((s) => s.spend > 0 || s.performanceScore !== null).sort((a, b) => b.spend - a.spend);

    return {
      range,
      orders: orders.length,
      totalSpend: orders.reduce((a, o) => a + o.totals.subtotal, 0),
      openCommitment,
      byCategory,
      byDepartment,
      suppliers,
      priceVariance: [...prices.entries()]
        .map(([productId, p]) => ({ productId, qty: p.qty, averagePrice: p.qty ? Math.round((p.spend * 1000) / p.qty) : 0, minPrice: p.min, maxPrice: p.max, standardPrice: p.standard, variance: p.variance }))
        .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
        .slice(0, 50),
      note: "Amounts are minor units before tax; orders in other currencies are summed as recorded.",
    };
  }
}
