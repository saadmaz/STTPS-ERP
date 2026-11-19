import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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
import { NotificationsService } from "../platform/notifications/notifications.service.js";
import { EmailSender } from "../platform/notifications/email.sender.js";
import { RecordsService } from "../platform/records/records.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { AccountDoc, ContactDoc, CRM_COLLECTIONS } from "../crm/crm.models.js";
import { PRODUCT_COLLECTIONS, ProductDoc } from "../products/products.models.js";
import { PricingService } from "../products/products.services.js";
import { InventoryLedger } from "../inventory/inventory.ledger.js";
import {
  DeliveryDoc,
  DeliveryLine,
  OrderDoc,
  OrderLine,
  QuoteDoc,
  ReturnDoc,
  SALES_COLLECTIONS,
  SALES_LISTS,
  SalesLine,
  SalesSettingsDoc,
  Totals,
} from "./sales.models.js";
import {
  CreateDeliveryDto,
  CreateOrderDto,
  CreateQuoteDto,
  CreateReturnDto,
  SalesLineDto,
  SalesSettingsDto,
  UpdateDeliveryDto,
  UpdateOrderDto,
  UpdateQuoteDto,
  UpdateReturnDto,
} from "./sales.dto.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);
const pct = (v: string | undefined) => (v ? Math.round(Number(v) * 100) : 0);
const addDays = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const STOCKED = new Set(["stock", "manufactured"]);

// ─── Settings and pricing ─────────────────────────────────────────────────────

@Injectable()
export class SalesSettingsService {
  constructor(private readonly firestore: FirestoreService) {}

  private ref(scope: Scope) {
    return this.firestore.collection<SalesSettingsDoc>(SALES_COLLECTIONS.settings).doc(scope.companyId);
  }

  async get(scope: Scope): Promise<SalesSettingsDoc> {
    return (
      (await this.ref(scope).get()).data() ?? {
        companyId: scope.companyId,
        taxRates: [{ code: "VAT", name: "VAT 18%", rate: 1800 }, { code: "ZERO", name: "Zero rated", rate: 0 }],
        defaultTaxCode: "VAT",
        quoteValidityDays: 30,
        discountApprovalPct: 1500,
        defaultTerms: null,
        defaultWarehouseId: null,
        updatedAt: new Date(0).toISOString(),
      }
    );
  }

  async update(scope: Scope, dto: SalesSettingsDto): Promise<SalesSettingsDoc> {
    const current = await this.get(scope);
    const next: SalesSettingsDoc = {
      ...current,
      taxRates: dto.taxRates ? dto.taxRates.map((t) => ({ code: t.code, name: t.name, rate: pct(t.rate) })) : current.taxRates,
      defaultTaxCode: dto.defaultTaxCode ?? current.defaultTaxCode,
      quoteValidityDays: dto.quoteValidityDays ?? current.quoteValidityDays,
      discountApprovalPct: dto.discountApprovalPct ? pct(dto.discountApprovalPct) : current.discountApprovalPct,
      defaultTerms: dto.defaultTerms ?? current.defaultTerms,
      defaultWarehouseId: dto.defaultWarehouseId ?? current.defaultWarehouseId,
      updatedAt: new Date().toISOString(),
    };
    if (next.defaultTaxCode && !next.taxRates.some((t) => t.code === next.defaultTaxCode)) throw new BadRequestException("The default tax code is not in the list");
    await this.ref(scope).set(next);
    return next;
  }
}

export function computeLine(line: Omit<SalesLine, "net" | "tax" | "total">): SalesLine {
  const gross = extend(line.qty, line.unitPrice);
  const net = gross - applyRate(gross, line.discountPct, 4);
  const tax = applyRate(net, line.taxRate, 4);
  return { ...line, net, tax, total: net + tax };
}

export function totalsOf(lines: SalesLine[]): Totals {
  const subtotal = lines.reduce((a, l) => a + extend(l.qty, l.unitPrice), 0);
  const net = lines.reduce((a, l) => a + l.net, 0);
  const tax = lines.reduce((a, l) => a + l.tax, 0);
  return { subtotal, discount: subtotal - net, tax, total: net + tax };
}

/** Turns line input into priced, taxed lines: prices default from the pricing engine. */
@Injectable()
export class LinePricer {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly pricing: PricingService,
    private readonly settings: SalesSettingsService,
  ) {}

  async price(ctx: RequestContext, inputs: SalesLineDto[], accountId: string, currency: string): Promise<{ lines: SalesLine[]; products: Map<string, ProductDoc> }> {
    const settings = await this.settings.get(ctx);
    const ids = [...new Set(inputs.map((l) => l.productId))];
    const snaps = await this.firestore.db.getAll(...ids.map((id) => this.firestore.collection(PRODUCT_COLLECTIONS.products).doc(id)));
    const products = new Map<string, ProductDoc>();
    for (const snap of snaps) {
      const p = snap.data() as ProductDoc | undefined;
      if (p && p.companyId === ctx.companyId) products.set(snap.id, p);
    }
    const lines: SalesLine[] = [];
    for (const input of inputs) {
      const product = products.get(input.productId);
      if (!product) throw new BadRequestException("Product not found");
      if (!product.isSellable || product.status !== "active") throw new BadRequestException(`${product.sku} cannot be sold`);
      const qty = toQty(input.qty);
      if (qty <= 0) throw new BadRequestException("Quantities must be positive");
      let unitPrice: number;
      if (input.unitPrice !== undefined) unitPrice = toMinor(input.unitPrice, currency);
      else {
        const quote = await this.pricing.quote(ctx, { productId: product.id, accountId, qty: input.qty });
        if (quote.currency !== currency) throw new BadRequestException(`${product.sku} is priced in ${quote.currency}; enter a ${currency} price`);
        unitPrice = quote.unitPrice;
      }
      const taxCode = input.taxCode ?? product.taxCategory ?? settings.defaultTaxCode;
      const tax = taxCode ? settings.taxRates.find((t) => t.code === taxCode) : undefined;
      if (taxCode && !tax) throw new BadRequestException(`Unknown tax code ${taxCode}`);
      const discountPct = pct(input.discountPct);
      if (discountPct > 10_000) throw new BadRequestException("Discount cannot exceed 100%");
      lines.push(computeLine({ lineId: randomUUID().slice(0, 8), productId: product.id, description: input.description?.trim() || product.name, qty, unitPrice, discountPct, taxCode: tax?.code ?? null, taxRate: tax?.rate ?? 0 }));
    }
    return { lines, products };
  }
}

async function loadAccount(fs: FirestoreService, scope: Scope, accountId: string): Promise<AccountDoc> {
  const account = (await fs.collection<AccountDoc>(CRM_COLLECTIONS.accounts).doc(accountId).get()).data();
  if (!account || account.companyId !== scope.companyId || account.archivedAt) throw new BadRequestException("Customer not found");
  if (account.status === "blocked") throw new BadRequestException(`${account.name} is blocked`);
  return account;
}

// ─── Quotes ───────────────────────────────────────────────────────────────────

type QuoteInput = CreateQuoteDto & { priced?: SalesLine[]; defaults?: { currency: string; validUntil: string; terms: string | null } };
type QuotePatchInput = UpdateQuoteDto & { priced?: SalesLine[] };

@Injectable()
export class QuoteService extends MasterDataService<QuoteDoc, QuoteInput, QuotePatchInput> implements OnModuleInit {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly pricer: LinePricer,
    private readonly settings: SalesSettingsService,
    private readonly approvals: ApprovalsService,
    private readonly events: EventBusService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailSender,
  ) {
    super(fs, audit, unique, {
      module: "sales",
      entity: "quote",
      label: "Quote",
      collection: SALES_COLLECTIONS.quotes,
      route: "/sales/quotes",
      references: [
        { field: "accountId", collection: CRM_COLLECTIONS.accounts, label: "Customer" },
        { field: "contactId", collection: CRM_COLLECTIONS.contacts, label: "Contact" },
        { field: "opportunityId", collection: CRM_COLLECTIONS.opportunities, label: "Opportunity" },
      ],
      filterFields: ["status", "accountId", "ownerUserId", "opportunityId"],
      large: SALES_LISTS.quotes,
      numbering: { field: "number", key: "quote", prefix: "QT", yearly: true },
      customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "sales.quoteApproval", async (event) => {
      if (event.payload.entityType !== this.entityType) return;
      const ctx = systemContext(event, event.payload.decidedBy);
      const quote = await this.repo.find(ctx, event.payload.entityId);
      if (quote?.status === "pending_approval") await this.repo.update(ctx, quote.id, { status: event.payload.outcome === "approved" ? "approved" : "draft" });
    });
  }

  async create(ctx: RequestContext, dto: QuoteInput): Promise<QuoteDoc> {
    const account = await loadAccount(this.firestore, ctx, dto.accountId);
    const settings = await this.settings.get(ctx);
    const currency = dto.currency ?? account.currency;
    const { lines } = await this.pricer.price(ctx, dto.lines, account.id, currency);
    const date = dto.date?.slice(0, 10) ?? today();
    return super.create(ctx, { ...dto, priced: lines, defaults: { currency, validUntil: addDays(date, settings.quoteValidityDays), terms: settings.defaultTerms } });
  }

  async update(ctx: RequestContext, id: string, dto: QuotePatchInput, expectedVersion?: number): Promise<QuoteDoc> {
    if (!dto.lines) return super.update(ctx, id, dto, expectedVersion);
    const quote = await this.repo.get(ctx, id);
    const { lines } = await this.pricer.price(ctx, dto.lines, dto.accountId ?? quote.accountId, dto.currency ?? quote.currency);
    return super.update(ctx, id, { ...dto, priced: lines }, expectedVersion);
  }

  protected toNew(dto: QuoteInput, ctx: RequestContext): NewDoc<QuoteDoc> {
    const lines = dto.priced!;
    return {
      number: "",
      revision: 1,
      previousRevisionId: null,
      accountId: dto.accountId,
      contactId: orNull(dto.contactId),
      opportunityId: orNull(dto.opportunityId),
      currency: dto.defaults!.currency,
      date: dto.date?.slice(0, 10) ?? today(),
      validUntil: dto.validUntil?.slice(0, 10) ?? dto.defaults!.validUntil,
      lines,
      totals: totalsOf(lines),
      terms: dto.terms ?? dto.defaults!.terms,
      notes: orNull(dto.notes),
      status: "draft",
      sentAt: null,
      respondedAt: null,
      customerComment: null,
      orderId: null,
      ownerUserId: dto.ownerUserId ?? ctx.userId,
    };
  }

  protected toPatch(dto: QuotePatchInput, before: QuoteDoc): Patch<QuoteDoc> {
    if (!["draft", "approved"].includes(before.status)) throw new BadRequestException(`A ${before.status.replace("_", " ")} quote cannot be changed; revise it instead`);
    const { lines: _l, priced, accountId, ...rest } = dto;
    if (accountId && accountId !== before.accountId) throw new BadRequestException("Create a new quote for a different customer");
    return {
      ...rest,
      ...(priced ? { lines: priced, totals: totalsOf(priced) } : {}),
      ...(dto.validUntil ? { validUntil: dto.validUntil.slice(0, 10) } : {}),
      status: "draft",
    } as Patch<QuoteDoc>;
  }

  /** Approval when a line discount exceeds the company threshold; otherwise approved at once. */
  async submit(ctx: RequestContext, id: string): Promise<QuoteDoc> {
    const quote = await this.repo.get(ctx, id);
    if (quote.status !== "draft") throw new BadRequestException("Only draft quotes can be submitted");
    const settings = await this.settings.get(ctx);
    const maxDiscount = Math.max(0, ...quote.lines.map((l) => l.discountPct));
    if (maxDiscount <= settings.discountApprovalPct) return (await this.repo.update(ctx, id, { status: "approved" })).after;
    const prepared = await this.approvals.prepare(ctx, {
      entityType: this.entityType,
      entityId: id,
      entityLabel: `${quote.number} · ${fromMinor(quote.totals.total, quote.currency)} ${quote.currency}`,
      link: `/sales/quotes/${id}`,
      facts: { maxDiscountPct: maxDiscount / 100, amount: quote.totals.total, total: quote.totals.total, accountId: quote.accountId },
    });
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const request = await this.approvals.open(tx, ctx, prepared);
      return this.repo.applyUpdate(ctx, tx, before, { status: request.status === "approved" ? "approved" : "pending_approval" }).after;
    });
  }

  /** Issues a private link the customer can open to accept or reject, and emails it to the contact. */
  async send(ctx: RequestContext, id: string): Promise<{ quote: QuoteDoc; link: string; emailedTo: string | null }> {
    const quote = await this.repo.get(ctx, id);
    if (!["approved", "sent"].includes(quote.status)) throw new BadRequestException("Submit the quote (and get any approval) before sending it");
    const token = randomBytes(24).toString("base64url");
    await this.firestore.collection(SALES_COLLECTIONS.quoteTokens).doc(createHash("sha256").update(token).digest("hex")).set({
      quoteId: id, tenantId: ctx.tenantId, companyId: ctx.companyId, createdAt: new Date().toISOString(),
    });
    const { after } = await this.repo.update(ctx, id, { status: "sent", sentAt: new Date().toISOString() });
    const link = `${process.env.FRONTEND_URL ?? ""}/q/${token}`;
    let emailedTo: string | null = null;
    if (quote.contactId) {
      const contact = (await this.firestore.collection<ContactDoc>(CRM_COLLECTIONS.contacts).doc(quote.contactId).get()).data();
      if (contact?.email && !contact.doNotContact) {
        await this.email.send({ to: contact.email, subject: `Quotation ${quote.number}`, text: `Please review quotation ${quote.number}:\n\n${link}\n\nIt is valid until ${quote.validUntil}.` });
        emailedTo = contact.email;
      }
    }
    this.audit.record(ctx, { module: "sales", action: "sent", entity: this.entityType, entityId: id, after: { emailedTo } });
    return { quote: after, link, emailedTo };
  }

  /** A new revision with the same lines; the old one is superseded and its links stop working. */
  async revise(ctx: RequestContext, id: string): Promise<QuoteDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (["converted", "superseded", "accepted"].includes(before.status)) throw new BadRequestException(`A ${before.status} quote cannot be revised`);
      const next = this.repo.build(ctx, {
        ...(Object.fromEntries(Object.entries(before).filter(([k]) => !["id", "tenantId", "companyId", "createdAt", "updatedAt", "createdBy", "updatedBy", "version", "archivedAt", "archived"].includes(k))) as NewDoc<QuoteDoc>),
        revision: before.revision + 1,
        previousRevisionId: before.id,
        status: "draft",
        sentAt: null,
        respondedAt: null,
        customerComment: null,
      });
      tx.create(this.repo.ref(next.id), next);
      this.repo.applyUpdate(ctx, tx, before, { status: "superseded" });
      this.indexInTx(tx, ctx, next);
      return next;
    });
  }

  private async byToken(token: string) {
    const ref = (await this.firestore.collection(SALES_COLLECTIONS.quoteTokens).doc(createHash("sha256").update(token).digest("hex")).get()).data() as
      | { quoteId: string; tenantId: string; companyId: string }
      | undefined;
    if (!ref) throw new NotFoundException("This link is not valid");
    const scope = { tenantId: ref.tenantId, companyId: ref.companyId, userId: null };
    const quote = await this.repo.find(scope, ref.quoteId);
    if (!quote || !["sent", "accepted", "rejected", "converted"].includes(quote.status)) throw new NotFoundException("This quote is no longer available");
    return { quote, scope };
  }

  /** What the customer sees: no internal notes, owners or costs. */
  async publicView(token: string) {
    const { quote, scope } = await this.byToken(token);
    const company = (await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(scope.companyId).get()).data();
    const account = (await this.firestore.collection<AccountDoc>(CRM_COLLECTIONS.accounts).doc(quote.accountId).get()).data();
    return {
      number: quote.number,
      revision: quote.revision,
      company: { name: company?.name ?? "", taxId: company?.taxId ?? null },
      customer: { name: account?.name ?? "" },
      date: quote.date,
      validUntil: quote.validUntil,
      expired: quote.status === "sent" && quote.validUntil < today(),
      currency: quote.currency,
      lines: quote.lines.map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct, taxRate: l.taxRate, total: l.total })),
      totals: quote.totals,
      terms: quote.terms,
      status: quote.status === "converted" ? "accepted" : quote.status,
    };
  }

  async respond(token: string, accept: boolean, comment?: string) {
    const { quote, scope } = await this.byToken(token);
    if (quote.status !== "sent") throw new BadRequestException(`This quote has already been ${quote.status === "converted" ? "accepted" : quote.status}`);
    if (quote.validUntil < today()) throw new BadRequestException("This quote has expired; ask for a new one");
    const ctx = systemContext(scope, null);
    await this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, quote.id, tx);
      this.repo.applyUpdate(ctx, tx, before, { status: accept ? "accepted" : "rejected", respondedAt: new Date().toISOString(), customerComment: comment?.trim() || null });
      this.audit.record({ ...ctx, userId: "customer" }, { module: "sales", action: accept ? "accepted" : "rejected", entity: this.entityType, entityId: quote.id, after: { comment: comment ?? null } }, tx);
      if (accept) this.events.publish(tx, ctx, "QuoteAccepted", { entity: this.entityType, entityId: quote.id }, { quoteId: quote.id, accountId: quote.accountId, total: quote.totals.total });
      if (quote.ownerUserId) {
        this.notifications.notify({
          tenantId: ctx.tenantId, companyId: ctx.companyId, userIds: [quote.ownerUserId], category: "sales.quote",
          title: `${quote.number} was ${accept ? "accepted" : "rejected"} by the customer`, body: comment ?? null, link: `/sales/quotes/${quote.id}`, priority: "high",
        }, tx);
      }
    });
    return { status: accept ? "accepted" : "rejected" };
  }

  protected searchEntry(doc: QuoteDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.number} rev ${doc.revision}`, subtitle: `${fromMinor(doc.totals.total, doc.currency)} ${doc.currency}`, keywords: [doc.number] };
  }
}

// ─── Orders ───────────────────────────────────────────────────────────────────

type OrderInput = CreateOrderDto & { priced?: SalesLine[]; stocked?: Record<string, boolean>; defaults?: { currency: string; warehouseId: string | null; account: AccountDoc; quoteId?: string | null } };
type OrderPatchInput = UpdateOrderDto & { priced?: SalesLine[]; stocked?: Record<string, boolean> };

@Injectable()
export class OrderService extends MasterDataService<OrderDoc, OrderInput, OrderPatchInput> implements OnModuleInit {
  private readonly logger = new Logger("SalesOrders");

  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly pricer: LinePricer,
    private readonly settings: SalesSettingsService,
    private readonly approvals: ApprovalsService,
    private readonly events: EventBusService,
    private readonly ledger: InventoryLedger,
    private readonly records: RecordsService,
  ) {
    super(fs, audit, unique, {
      module: "sales",
      entity: "order",
      label: "Sales order",
      collection: SALES_COLLECTIONS.orders,
      route: "/sales/orders",
      references: [
        { field: "accountId", collection: CRM_COLLECTIONS.accounts, label: "Customer" },
        { field: "contactId", collection: CRM_COLLECTIONS.contacts, label: "Contact" },
        { field: "warehouseId", collection: "warehouses", label: "Warehouse" },
      ],
      filterFields: ["status", "accountId", "ownerUserId", "quoteId"],
      large: SALES_LISTS.orders,
      numbering: { field: "number", key: "salesOrder", prefix: "SO", yearly: true },
      customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "sales.orderApproval", async (event) => {
      if (event.payload.entityType !== this.entityType) return;
      const ctx = systemContext(event, event.payload.decidedBy);
      const order = await this.repo.find(ctx, event.payload.entityId);
      if (order?.status !== "pending_approval") return;
      if (event.payload.outcome === "approved") await this.firestore.runTransaction((tx) => this.doConfirm(tx, ctx, order.id));
      else await this.repo.update(ctx, order.id, { status: "draft" });
    });
  }

  async create(ctx: RequestContext, dto: OrderInput): Promise<OrderDoc> {
    const account = await loadAccount(this.firestore, ctx, dto.accountId);
    const settings = await this.settings.get(ctx);
    const currency = dto.currency ?? account.currency;
    const { lines, products } = await this.pricer.price(ctx, dto.lines, account.id, currency);
    const stocked = Object.fromEntries([...products.values()].map((p) => [p.id, STOCKED.has(p.type)]));
    const warehouseId = dto.warehouseId ?? settings.defaultWarehouseId;
    return super.create(ctx, { ...dto, priced: lines, stocked, defaults: { currency, warehouseId, account, quoteId: dto.defaults?.quoteId ?? null } });
  }

  async update(ctx: RequestContext, id: string, dto: OrderPatchInput, expectedVersion?: number): Promise<OrderDoc> {
    if (!dto.lines) return super.update(ctx, id, dto, expectedVersion);
    const order = await this.repo.get(ctx, id);
    const { lines, products } = await this.pricer.price(ctx, dto.lines, order.accountId, order.currency);
    const stocked = Object.fromEntries([...products.values()].map((p) => [p.id, STOCKED.has(p.type)]));
    return super.update(ctx, id, { ...dto, priced: lines, stocked }, expectedVersion);
  }

  private orderLines(priced: SalesLine[], dtoLines: CreateOrderDto["lines"], warehouseId: string | null, stocked: Record<string, boolean>): OrderLine[] {
    return priced.map((l, i) => {
      const wh = dtoLines[i]?.warehouseId ?? warehouseId;
      if (stocked[l.productId] && !wh) throw new BadRequestException("Choose the warehouse to ship from");
      return { ...l, warehouseId: wh ?? "", reserved: 0, delivered: 0, returned: 0, stocked: !!stocked[l.productId] };
    });
  }

  protected toNew(dto: OrderInput, ctx: RequestContext): NewDoc<OrderDoc> {
    const d = dto.defaults!;
    const lines = this.orderLines(dto.priced!, dto.lines, d.warehouseId, dto.stocked!);
    return {
      number: "",
      accountId: dto.accountId,
      contactId: orNull(dto.contactId),
      quoteId: d.quoteId ?? null,
      customerReference: orNull(dto.customerReference),
      currency: d.currency,
      date: dto.date?.slice(0, 10) ?? today(),
      requestedDate: dto.requestedDate?.slice(0, 10) ?? null,
      warehouseId: d.warehouseId ?? "",
      billingAddress: (d.account.billingAddress as Record<string, unknown> | null) ?? null,
      shippingAddress: (d.account.shippingAddress as Record<string, unknown> | null) ?? (d.account.billingAddress as Record<string, unknown> | null) ?? null,
      paymentTermsDays: d.account.paymentTermsDays,
      lines,
      totals: totalsOf(lines),
      status: "draft",
      holdReasons: [],
      confirmedAt: null,
      cancelledAt: null,
      cancelReason: null,
      ownerUserId: dto.ownerUserId ?? ctx.userId,
      notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: OrderPatchInput, before: OrderDoc): Patch<OrderDoc> {
    if (before.status !== "draft") throw new BadRequestException("Only draft orders can be changed");
    const { lines: dtoLines, priced, stocked, accountId, ...rest } = dto;
    if (accountId && accountId !== before.accountId) throw new BadRequestException("Create a new order for a different customer");
    const lines = priced ? this.orderLines(priced, dtoLines!, dto.warehouseId ?? before.warehouseId, stocked!) : undefined;
    return { ...rest, ...(lines ? { lines, totals: totalsOf(lines) } : {}) } as Patch<OrderDoc>;
  }

  /** Creates a draft order from an accepted quote and marks the quote converted. */
  async fromQuote(ctx: RequestContext, quotes: QuoteService, quoteId: string, warehouseId?: string): Promise<OrderDoc> {
    const quote = await quotes.repo.get(ctx, quoteId);
    if (quote.status !== "accepted") throw new BadRequestException("Only accepted quotes become orders");
    const order = await this.create(ctx, {
      accountId: quote.accountId,
      contactId: quote.contactId ?? undefined,
      currency: quote.currency,
      warehouseId,
      lines: quote.lines.map((l) => ({
        productId: l.productId,
        qty: String(l.qty / 1000),
        unitPrice: fromMinor(l.unitPrice, quote.currency),
        discountPct: String(l.discountPct / 100),
        taxCode: l.taxCode ?? undefined,
        description: l.description,
      })),
      defaults: { quoteId, currency: quote.currency, warehouseId: null, account: undefined as never },
    } as OrderInput);
    await this.firestore.runTransaction(async (tx) => {
      const before = await quotes.repo.get(ctx, quoteId, tx);
      quotes.repo.applyUpdate(ctx, tx, before, { status: "converted", orderId: order.id });
      this.records.linkInTx(tx, ctx, { type: "sales.quote", id: quoteId }, { type: this.entityType, id: order.id }, "converted_to");
    });
    return order;
  }

  /** Open order value for a customer (confirmed or awaiting approval, not yet fully delivered). */
  private async openExposure(scope: Scope, accountId: string, excludeId: string): Promise<number> {
    const snap = await this.repo.collection.where("companyId", "==", scope.companyId).where("accountId", "==", accountId).get();
    return snap.docs
      .map((d) => d.data())
      .filter((o) => o.id !== excludeId && ["pending_approval", "confirmed", "partially_delivered"].includes(o.status))
      .reduce((a, o) => a + o.totals.total, 0);
  }

  /**
   * Confirms the order: checks the credit limit and discounts (approval when
   * either is exceeded), then reserves what is in stock. Lines short of stock
   * stay on backorder.
   */
  async confirm(ctx: RequestContext, id: string): Promise<OrderDoc> {
    const order = await this.repo.get(ctx, id);
    if (order.status !== "draft") throw new BadRequestException("Only draft orders can be confirmed");
    const account = await loadAccount(this.firestore, ctx, order.accountId);
    const settings = await this.settings.get(ctx);
    const holds: string[] = [];
    const exposure = (await this.openExposure(ctx, account.id, id)) + order.totals.total;
    if (account.creditLimit !== null && exposure > account.creditLimit) holds.push("credit_limit");
    const maxDiscount = Math.max(0, ...order.lines.map((l) => l.discountPct));
    if (maxDiscount > settings.discountApprovalPct) holds.push("discount");
    if (holds.length === 0) return this.firestore.runTransaction((tx) => this.doConfirm(tx, ctx, id));

    const prepared = await this.approvals.prepare(ctx, {
      entityType: this.entityType,
      entityId: id,
      entityLabel: `${order.number} · ${account.name} · ${fromMinor(order.totals.total, order.currency)} ${order.currency}`,
      link: `/sales/orders/${id}`,
      facts: { creditExceeded: holds.includes("credit_limit"), maxDiscountPct: maxDiscount / 100, amount: order.totals.total, total: order.totals.total, exposure },
    });
    if (!prepared.definition && holds.includes("credit_limit")) {
      throw new BadRequestException(`Over the credit limit by ${fromMinor(exposure - account.creditLimit!, account.currency)} ${account.currency}: raise the limit or set up an approval workflow for sales orders`);
    }
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      // Read phase first: the approval engine writes the request as soon as it opens.
      const confirmation = await this.prepareConfirm(tx, ctx, before);
      const request = await this.approvals.open(tx, ctx, prepared);
      if (request.status === "approved") return confirmation.apply();
      return this.repo.applyUpdate(ctx, tx, before, { status: "pending_approval", holdReasons: holds }).after;
    });
  }

  private async doConfirm(tx: Transaction, ctx: RequestContext, id: string): Promise<OrderDoc> {
    const before = await this.repo.get(ctx, id, tx);
    return (await this.prepareConfirm(tx, ctx, before)).apply();
  }

  /** Reserves stock (read phase); `apply()` writes the reservation and confirms the order. */
  private async prepareConfirm(tx: Transaction, ctx: RequestContext, before: OrderDoc): Promise<{ apply: () => OrderDoc }> {
    const stockLines = before.lines.filter((l) => l.stocked);
    const reservation = stockLines.length
      ? await this.ledger.reserveMany(tx, ctx, stockLines.map((l) => ({ productId: l.productId, warehouseId: l.warehouseId, qty: l.qty })))
      : null;
    return {
      apply: () => {
        const lines = before.lines.map((l) => {
          const i = stockLines.indexOf(l);
          return i >= 0 ? { ...l, reserved: reservation!.reserved[i]! } : l;
        });
        reservation?.commit();
        const { after } = this.repo.applyUpdate(ctx, tx, before, { status: "confirmed", lines, confirmedAt: new Date().toISOString(), holdReasons: [] });
        this.audit.record(ctx, { module: "sales", action: "confirmed", entity: this.entityType, entityId: before.id, after: { reserved: lines.map((l) => l.reserved) } }, tx);
        this.events.publish(tx, ctx, "SalesOrderConfirmed", { entity: this.entityType, entityId: before.id }, { orderId: before.id, accountId: before.accountId, total: before.totals.total, currency: before.currency });
        return after;
      },
    };
  }

  /** Cancels what is not yet delivered and gives back its reserved stock. */
  async cancel(ctx: RequestContext, id: string, reason: string): Promise<OrderDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (["delivered", "cancelled", "closed"].includes(before.status)) throw new BadRequestException(`A ${before.status} order cannot be cancelled`);
      const held = before.lines.filter((l) => l.reserved > 0);
      const release = held.length ? await this.ledger.releaseMany(tx, ctx, held.map((l) => ({ productId: l.productId, warehouseId: l.warehouseId, qty: l.reserved }))) : null;
      release?.commit();
      const lines = before.lines.map((l) => ({ ...l, reserved: 0 }));
      const { after } = this.repo.applyUpdate(ctx, tx, before, { status: "cancelled", lines, cancelledAt: new Date().toISOString(), cancelReason: reason });
      this.audit.record(ctx, { module: "sales", action: "cancelled", entity: this.entityType, entityId: id, reason }, tx);
      return after;
    });
  }

  /** Tries again to reserve stock for lines still short (after a receipt). */
  async reserveShortages(ctx: RequestContext, id: string): Promise<OrderDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (!["confirmed", "partially_delivered"].includes(before.status)) throw new BadRequestException("Only open orders can be reserved");
      const short = before.lines.filter((l) => l.stocked && l.qty - l.delivered - l.reserved > 0);
      if (short.length === 0) return before;
      const r = await this.ledger.reserveMany(tx, ctx, short.map((l) => ({ productId: l.productId, warehouseId: l.warehouseId, qty: l.qty - l.delivered - l.reserved })));
      r.commit();
      const lines = before.lines.map((l) => {
        const i = short.indexOf(l);
        return i >= 0 ? { ...l, reserved: l.reserved + r.reserved[i]! } : l;
      });
      return this.repo.applyUpdate(ctx, tx, before, { lines }).after;
    });
  }

  protected searchEntry(doc: OrderDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: `${fromMinor(doc.totals.total, doc.currency)} ${doc.currency}`, keywords: [doc.customerReference] };
  }
}

// ─── Deliveries ───────────────────────────────────────────────────────────────

type DeliveryInput = CreateDeliveryDto & { prepared?: { order: OrderDoc; lines: DeliveryLine[] } };

@Injectable()
export class DeliveryService extends MasterDataService<DeliveryDoc, DeliveryInput, UpdateDeliveryDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly orders: OrderService,
    private readonly ledger: InventoryLedger,
    private readonly events: EventBusService,
    private readonly records: RecordsService,
  ) {
    super(fs, audit, unique, {
      module: "sales",
      entity: "delivery",
      label: "Delivery",
      collection: SALES_COLLECTIONS.deliveries,
      route: "/sales/deliveries",
      filterFields: ["status", "orderId", "accountId"],
      large: SALES_LISTS.deliveries,
      numbering: { field: "number", key: "delivery", prefix: "DN", yearly: true },
      customFields: false,
    });
  }

  private async openQty(scope: Scope, orderId: string): Promise<Map<string, number>> {
    const snap = await this.repo.collection.where("companyId", "==", scope.companyId).where("orderId", "==", orderId).get();
    const open = new Map<string, number>();
    for (const d of snap.docs.map((x) => x.data())) {
      if (!["draft", "picked", "packed"].includes(d.status)) continue;
      for (const l of d.lines) open.set(l.orderLineId, (open.get(l.orderLineId) ?? 0) + l.qty);
    }
    return open;
  }

  /** Plans a delivery: by default everything reserved (or, for non-stock lines, outstanding). */
  async create(ctx: RequestContext, dto: DeliveryInput): Promise<DeliveryDoc> {
    const order = await this.orders.repo.get(ctx, dto.orderId);
    if (!["confirmed", "partially_delivered"].includes(order.status)) throw new BadRequestException("Only confirmed orders can be delivered");
    const planned = await this.openQty(ctx, order.id);
    const deliverable = (l: OrderLine) => {
      const stocked = l.stocked;
      const outstanding = l.qty - l.delivered - (planned.get(l.lineId) ?? 0);
      return Math.max(0, stocked ? Math.min(outstanding, l.reserved - (planned.get(l.lineId) ?? 0)) : outstanding);
    };
    const lines: DeliveryLine[] = dto.lines
      ? dto.lines.map((dl) => {
          const line = order.lines.find((l) => l.lineId === dl.orderLineId);
          if (!line) throw new BadRequestException("Order line not found");
          const qty = toQty(dl.qty);
          if (qty <= 0 || qty > deliverable(line)) throw new BadRequestException(`At most ${deliverable(line) / 1000} of ${line.description} can be delivered now`);
          return { orderLineId: line.lineId, productId: line.productId, qty, lotNo: dl.lotNo ?? null, serialNos: dl.serialNos ?? [], unitCost: null };
        })
      : order.lines.filter((l) => deliverable(l) > 0).map((l) => ({ orderLineId: l.lineId, productId: l.productId, qty: deliverable(l), lotNo: null, serialNos: [], unitCost: null }));
    if (lines.length === 0) throw new BadRequestException("Nothing is ready to deliver: reserve stock first");
    return super.create(ctx, { ...dto, prepared: { order, lines } });
  }

  protected toNew(dto: DeliveryInput): NewDoc<DeliveryDoc> {
    const { order, lines } = dto.prepared!;
    return {
      number: "", orderId: order.id, accountId: order.accountId, warehouseId: order.warehouseId, lines, status: "draft",
      carrier: orNull(dto.carrier), trackingNo: orNull(dto.trackingNo), dispatchedAt: null, deliveredAt: null, receivedBy: null, exception: null,
      shippingAddress: order.shippingAddress,
    };
  }

  protected toPatch(dto: UpdateDeliveryDto, before: DeliveryDoc): Patch<DeliveryDoc> {
    if (["delivered", "cancelled"].includes(before.status)) throw new BadRequestException("This delivery is closed");
    return { ...dto } as Patch<DeliveryDoc>;
  }

  protected afterWrite(tx: Transaction, ctx: RequestContext, after: DeliveryDoc, before: DeliveryDoc | null): void {
    if (!before) this.records.linkInTx(tx, ctx, { type: "sales.order", id: after.orderId }, { type: this.entityType, id: after.id }, "delivered_by");
  }

  async setStatus(ctx: RequestContext, id: string, status: "picked" | "packed"): Promise<DeliveryDoc> {
    const d = await this.repo.get(ctx, id);
    const order = { draft: 0, picked: 1, packed: 2 } as Record<string, number>;
    if (!(d.status in order) || order[d.status]! >= order[status]!) throw new BadRequestException(`A ${d.status} delivery cannot be marked ${status}`);
    return (await this.repo.update(ctx, id, { status })).after;
  }

  /** Stock leaves the warehouse: issues it against the order's reservation and updates the order. */
  async dispatch(ctx: RequestContext, id: string): Promise<DeliveryDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (!["draft", "picked", "packed"].includes(before.status)) throw new BadRequestException("This delivery has already left");
      const order = await this.orders.repo.get(ctx, before.orderId, tx);
      const byLine = new Map(order.lines.map((l) => [l.lineId, l]));
      const stockLines = before.lines.filter((l) => byLine.get(l.orderLineId)?.stocked);
      const plan = stockLines.length
        ? await this.ledger.prepare(tx, ctx, stockLines.map((l) => {
            const ol = byLine.get(l.orderLineId)!;
            return {
              type: "sale" as const, productId: l.productId, warehouseId: ol.warehouseId, lotNo: l.lotNo, serialNos: l.serialNos, qty: -l.qty,
              consumeReserved: Math.min(l.qty, ol.reserved), reference: { entityType: this.entityType, entityId: id, label: before.number },
            };
          }))
        : null;
      const movements = plan?.commit() ?? [];
      const costs = new Map(stockLines.map((l, i) => [l.orderLineId + "#" + i, movements[i]!.unitCost]));
      const lines = before.lines.map((l) => {
        const i = stockLines.indexOf(l);
        return i >= 0 ? { ...l, unitCost: costs.get(l.orderLineId + "#" + i) ?? null } : l;
      });
      const orderLines = order.lines.map((ol) => {
        const shipped = before.lines.filter((l) => l.orderLineId === ol.lineId).reduce((a, l) => a + l.qty, 0);
        return shipped ? { ...ol, delivered: ol.delivered + shipped, reserved: Math.max(0, ol.reserved - shipped) } : ol;
      });
      const done = orderLines.every((l) => l.delivered >= l.qty);
      this.orders.repo.applyUpdate(ctx, tx, order, { lines: orderLines, status: done ? "delivered" : "partially_delivered" });
      const { after } = this.repo.applyUpdate(ctx, tx, before, { status: "dispatched", dispatchedAt: new Date().toISOString(), lines });
      this.ledger.auditPosting(tx, ctx, this.entityType, id, movements);
      this.events.publish(tx, ctx, "GoodsDispatched", { entity: this.entityType, entityId: id }, {
        deliveryId: id, orderId: order.id, accountId: order.accountId, currency: order.currency,
        lines: lines.map((l) => {
          const ol = byLine.get(l.orderLineId)!;
          return { orderLineId: l.orderLineId, productId: l.productId, qty: l.qty, unitPrice: ol.unitPrice, discountPct: ol.discountPct, taxRate: ol.taxRate, unitCost: l.unitCost };
        }),
      });
      return after;
    });
  }

  /** Proof of delivery. */
  async deliver(ctx: RequestContext, id: string, receivedBy: string): Promise<DeliveryDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "dispatched") throw new BadRequestException("Only dispatched deliveries can be confirmed");
      const { after } = this.repo.applyUpdate(ctx, tx, before, { status: "delivered", deliveredAt: new Date().toISOString(), receivedBy });
      this.events.publish(tx, ctx, "SalesDelivered", { entity: this.entityType, entityId: id }, { deliveryId: id, orderId: before.orderId, accountId: before.accountId });
      return after;
    });
  }

  async fail(ctx: RequestContext, id: string, reason: string): Promise<DeliveryDoc> {
    const d = await this.repo.get(ctx, id);
    if (d.status !== "dispatched") throw new BadRequestException("Only dispatched deliveries can fail");
    const { after } = await this.repo.update(ctx, id, { status: "failed", exception: reason });
    this.audit.record(ctx, { module: "sales", action: "delivery_failed", entity: this.entityType, entityId: id, reason });
    return after;
  }

  async cancel(ctx: RequestContext, id: string): Promise<DeliveryDoc> {
    const d = await this.repo.get(ctx, id);
    if (!["draft", "picked", "packed"].includes(d.status)) throw new BadRequestException("Dispatched deliveries cannot be cancelled; record a return");
    return (await this.repo.update(ctx, id, { status: "cancelled" })).after;
  }
}

// ─── Returns ──────────────────────────────────────────────────────────────────

type ReturnInput = CreateReturnDto & { prepared?: { delivery: DeliveryDoc; order: OrderDoc } };

@Injectable()
export class ReturnService extends MasterDataService<ReturnDoc, ReturnInput, UpdateReturnDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly deliveries: DeliveryService,
    private readonly orders: OrderService,
    private readonly ledger: InventoryLedger,
    private readonly events: EventBusService,
  ) {
    super(fs, audit, unique, {
      module: "sales",
      entity: "return",
      label: "Sales return",
      collection: SALES_COLLECTIONS.returns,
      route: "/sales/returns",
      filterFields: ["status", "orderId", "accountId"],
      large: SALES_LISTS.returns,
      numbering: { field: "number", key: "salesReturn", prefix: "RMA", yearly: true },
      customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: ReturnInput): Promise<ReturnDoc> {
    const delivery = await this.deliveries.repo.get(ctx, dto.deliveryId);
    if (!["dispatched", "delivered", "failed"].includes(delivery.status)) throw new BadRequestException("Only dispatched deliveries can be returned");
    const order = await this.orders.repo.get(ctx, delivery.orderId);
    const prior = (await this.repo.collection.where("companyId", "==", ctx.companyId).where("deliveryId", "==", delivery.id).get()).docs
      .map((d) => d.data())
      .filter((r) => !["rejected", "cancelled"].includes(r.status));
    for (const l of dto.lines) {
      const dl = delivery.lines[l.deliveryLineIndex];
      if (!dl) throw new BadRequestException("Delivery line not found");
      const already = prior.flatMap((r) => r.lines).filter((x) => x.deliveryLineIndex === l.deliveryLineIndex).reduce((a, x) => a + x.qty, 0);
      if (toQty(l.qty) <= 0 || toQty(l.qty) > dl.qty - already) throw new BadRequestException(`At most ${(dl.qty - already) / 1000} can be returned on line ${l.deliveryLineIndex + 1}`);
    }
    return super.create(ctx, { ...dto, prepared: { delivery, order } });
  }

  protected toNew(dto: ReturnInput): NewDoc<ReturnDoc> {
    const { delivery } = dto.prepared!;
    return {
      number: "", deliveryId: delivery.id, orderId: delivery.orderId, accountId: delivery.accountId, warehouseId: delivery.warehouseId, reason: dto.reason,
      lines: dto.lines.map((l) => ({ deliveryLineIndex: l.deliveryLineIndex, productId: delivery.lines[l.deliveryLineIndex]!.productId, qty: toQty(l.qty), lotNo: delivery.lines[l.deliveryLineIndex]!.lotNo, serialNos: l.serialNos ?? [], condition: l.condition ?? "resellable" })),
      status: "requested", receivedAt: null,
    };
  }

  protected toPatch(dto: UpdateReturnDto, before: ReturnDoc): Patch<ReturnDoc> {
    if (before.status !== "requested") throw new BadRequestException("Only requested returns can be changed");
    return { ...dto } as Patch<ReturnDoc>;
  }

  async approve(ctx: RequestContext, id: string): Promise<ReturnDoc> {
    const r = await this.repo.get(ctx, id);
    if (r.status !== "requested") throw new BadRequestException("Only requested returns can be approved");
    return (await this.repo.update(ctx, id, { status: "approved" })).after;
  }

  async reject(ctx: RequestContext, id: string, reason: string): Promise<ReturnDoc> {
    const r = await this.repo.get(ctx, id);
    if (!["requested", "approved"].includes(r.status)) throw new BadRequestException("This return is closed");
    const { after } = await this.repo.update(ctx, id, { status: "rejected" });
    this.audit.record(ctx, { module: "sales", action: "rejected", entity: this.entityType, entityId: id, reason });
    return after;
  }

  /** Goods are back: stock comes in at the cost it left with, and the order records the return. */
  async receive(ctx: RequestContext, id: string): Promise<ReturnDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "approved") throw new BadRequestException("Approve the return before receiving it");
      const delivery = await this.deliveries.repo.get(ctx, before.deliveryId, tx);
      const order = await this.orders.repo.get(ctx, before.orderId, tx);
      const stocked = before.lines.filter((l) => delivery.lines[l.deliveryLineIndex]!.unitCost !== null);
      const plan = stocked.length
        ? await this.ledger.prepare(tx, ctx, stocked.map((l) => {
            const dl = delivery.lines[l.deliveryLineIndex]!;
            const ol = order.lines.find((x) => x.lineId === dl.orderLineId)!;
            return {
              type: "customer_return" as const, productId: l.productId, warehouseId: ol.warehouseId, lotNo: l.lotNo, serialNos: l.serialNos, qty: l.qty,
              unitCost: dl.unitCost, reference: { entityType: this.entityType, entityId: id, label: before.number }, reason: `${before.reason} (${l.condition})`,
            };
          }))
        : null;
      const movements = plan?.commit() ?? [];
      const orderLines = order.lines.map((ol) => {
        const back = before.lines.filter((l) => delivery.lines[l.deliveryLineIndex]!.orderLineId === ol.lineId).reduce((a, l) => a + l.qty, 0);
        return back ? { ...ol, returned: ol.returned + back } : ol;
      });
      this.orders.repo.applyUpdate(ctx, tx, order, { lines: orderLines });
      this.ledger.auditPosting(tx, ctx, this.entityType, id, movements);
      this.events.publish(tx, ctx, "SalesReturnReceived", { entity: this.entityType, entityId: id }, {
        returnId: id, orderId: order.id, accountId: order.accountId, currency: order.currency,
        lines: before.lines.map((l) => {
          const dl = delivery.lines[l.deliveryLineIndex]!;
          const ol = order.lines.find((x) => x.lineId === dl.orderLineId)!;
          return { productId: l.productId, qty: l.qty, unitPrice: ol.unitPrice, discountPct: ol.discountPct, taxRate: ol.taxRate, unitCost: dl.unitCost };
        }),
      });
      return this.repo.applyUpdate(ctx, tx, before, { status: "received", receivedAt: new Date().toISOString() }).after;
    });
  }
}
