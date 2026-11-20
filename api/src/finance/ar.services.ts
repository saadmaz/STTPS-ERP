import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, Scope, systemContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { applyRate, currencyDecimals, extend, fromMinor, toMinor, toQty } from "../platform/data/money.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { DomainEvent, EventBusService } from "../platform/events/event-bus.service.js";
import { ModulesService } from "../platform/modules/modules.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { ExchangeRateService } from "../org/org.services.js";
import { CRM_COLLECTIONS } from "../crm/crm.models.js";
import { PRODUCT_COLLECTIONS, ProductDoc } from "../products/products.models.js";
import { OrderService, SalesSettingsService, taxRateOn } from "../sales/sales.services.js";
import { DeliveryDoc, OrderDoc, ReturnDoc, SALES_COLLECTIONS } from "../sales/sales.models.js";
import { AR_COLLECTIONS, AR_LISTS, InvoiceDoc, InvoiceLine, ReceiptDoc } from "./ar.models.js";
import { CreateInvoiceDto, CreateReceiptDto, InvoiceLineDto, UpdateInvoiceDto, UpdateReceiptDto } from "./ar.dto.js";
import { GeneralLedger, LineInput } from "./ledger.service.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const OPEN = ["posted", "partially_paid"] as const;

interface Customer {
  id: string;
  companyId: string;
  name: string;
  code: string;
  currency: string;
  paymentTermsDays: number;
  email: string | null;
  ownerUserId: string | null;
  taxExempt: boolean;
  archivedAt: string | null;
}

export async function customer(fs: FirestoreService, scope: Scope, id: string): Promise<Customer> {
  const c = (await fs.collection(CRM_COLLECTIONS.accounts).doc(id).get()).data() as Customer | undefined;
  if (!c || c.companyId !== scope.companyId || c.archivedAt) throw new BadRequestException("Customer not found");
  return { ...c, id };
}

/** Converts minor units of `currency` into base-currency minor units at a decimal-string rate. */
export function toBase(amount: number, rate: string, currency: string, base: string): number {
  if (rate === "1" && currency === base) return amount;
  const [whole, frac = ""] = rate.split(".");
  const scaled = BigInt(whole! + frac.padEnd(10, "0").slice(0, 10));
  const shift = currencyDecimals(base) - currencyDecimals(currency);
  let num = BigInt(amount) * scaled;
  let den = 10_000_000_000n;
  if (shift > 0) num *= 10n ** BigInt(shift);
  else if (shift < 0) den *= 10n ** BigInt(-shift);
  const neg = num < 0n;
  const abs = neg ? -num : num;
  const q = (abs + den / 2n) / den;
  return Number(neg ? -q : q);
}

export function computeInvoiceLine(l: Omit<InvoiceLine, "net" | "tax" | "total">): InvoiceLine {
  const gross = extend(l.qty, l.unitPrice);
  const net = gross - applyRate(gross, l.discountPct, 4);
  const tax = applyRate(net, l.taxRate, 4);
  return { ...l, net, tax, total: net + tax };
}

export function invoiceTotals(lines: InvoiceLine[]) {
  const subtotal = lines.reduce((a, l) => a + extend(l.qty, l.unitPrice), 0);
  const net = lines.reduce((a, l) => a + l.net, 0);
  const tax = lines.reduce((a, l) => a + l.tax, 0);
  return { subtotal, discount: subtotal - net, tax, total: net + tax };
}

// ─── Invoices and credit notes ────────────────────────────────────────────────

type InvoiceInput = CreateInvoiceDto & {
  built?: { lines: InvoiceLine[]; customer: Customer; currency: string; rate: string; orderId?: string | null; deliveryId?: string | null; returnId?: string | null };
};

@Injectable()
export class InvoiceService extends MasterDataService<InvoiceDoc, InvoiceInput, UpdateInvoiceDto & { built?: { lines: InvoiceLine[] } }> implements OnModuleInit {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly ledger: GeneralLedger,
    private readonly taxes: SalesSettingsService,
    private readonly rates: ExchangeRateService,
    private readonly events: EventBusService,
    private readonly modules: ModulesService,
    private readonly orders: OrderService,
  ) {
    super(fs, audit, unique, {
      module: "finance",
      entity: "invoice",
      label: "Invoice",
      collection: AR_COLLECTIONS.invoices,
      route: "/finance/invoices",
      filterFields: ["status", "customerId", "kind", "orderId"],
      large: AR_LISTS.invoices,
      numbering: { field: "number", key: "invoice", prefix: "INV", yearly: true },
      customFields: false,
    });
  }

  onModuleInit(): void {
    const auto = (name: string, run: (ctx: RequestContext, event: DomainEvent<{ deliveryId?: string; returnId?: string }>) => Promise<unknown>) =>
      async (event: DomainEvent<{ deliveryId?: string; returnId?: string }>) => {
        if (!(await this.modules.isEnabled(event.tenantId, "finance"))) return;
        const ctx = systemContext(event);
        const settings = await this.ledger.settings(ctx);
        if (!settings?.autoInvoiceDeliveries) return;
        try {
          await run(ctx, event);
        } catch (error) {
          // Leave it for a person to invoice manually; record why.
          this.audit.record(ctx, { module: "finance", action: `${name}.failed`, entity: event.entity, entityId: event.entityId, reason: error instanceof Error ? error.message : String(error) });
        }
      };
    this.events.subscribe("GoodsDispatched", "finance.autoInvoice", auto("autoInvoice", (ctx, e) => this.fromDelivery(ctx, e.payload.deliveryId!, true)));
    this.events.subscribe("SalesReturnReceived", "finance.autoCreditNote", auto("autoCreditNote", (ctx, e) => this.fromReturn(ctx, e.payload.returnId!, true)));
  }

  /** Base-currency rate for a currency on a date. */
  async rateFor(ctx: RequestContext, currency: string, date: string): Promise<string> {
    const base = (await this.ledger.settings(ctx))?.baseCurrency ?? "LKR";
    if (currency === base) return "1";
    const rate = await this.rates.rateOn(ctx, currency, base, date);
    if (!rate) throw new BadRequestException(`Add an exchange rate from ${currency} to ${base} for ${date}`);
    return rate;
  }

  /** `date` resolves effective-dated tax rates; `exempt` (the customer's exemption) forces every line tax-free. */
  async buildLines(ctx: RequestContext, input: InvoiceLineDto[], currency: string, date: string, exempt: boolean): Promise<InvoiceLine[]> {
    const ids = [...new Set(input.map((l) => l.productId).filter((x): x is string => !!x))];
    const products = new Map<string, ProductDoc>();
    if (ids.length) {
      for (const s of await this.firestore.db.getAll(...ids.map((id) => this.firestore.collection(PRODUCT_COLLECTIONS.products).doc(id)))) {
        const p = s.data() as ProductDoc | undefined;
        if (p && p.companyId === ctx.companyId) products.set(s.id, p);
      }
    }
    const settings = await this.taxes.get(ctx);
    return input.map((l) => {
      const p = l.productId ? products.get(l.productId) : undefined;
      if (l.productId && !p) throw new BadRequestException("Product not found");
      const description = l.description?.trim() || p?.name;
      if (!description) throw new BadRequestException("Describe each line");
      const taxCode = exempt ? "" : l.taxCode ?? p?.taxCategory ?? settings.defaultTaxCode;
      const tax = taxCode ? settings.taxRates.find((t) => t.code === taxCode) : undefined;
      if (taxCode && !tax) throw new BadRequestException(`Unknown tax code ${taxCode}`);
      const qty = toQty(l.qty);
      if (qty <= 0) throw new BadRequestException("Quantities must be positive");
      return computeInvoiceLine({
        lineId: randomUUID().slice(0, 8), productId: p?.id ?? null, description, qty, unitPrice: toMinor(l.unitPrice, currency),
        discountPct: l.discountPct ? Math.round(Number(l.discountPct) * 100) : 0, taxCode: tax?.code ?? null, taxRate: tax ? taxRateOn(tax, date) : 0, accountId: l.accountId ?? null,
      });
    });
  }

  async create(ctx: RequestContext, dto: InvoiceInput): Promise<InvoiceDoc> {
    if (dto.built) return super.create(ctx, dto);
    const c = await customer(this.firestore, ctx, dto.customerId);
    const currency = dto.currency ?? c.currency;
    const date = dto.date?.slice(0, 10) ?? today();
    if (dto.creditedInvoiceId) {
      const inv = await this.repo.get(ctx, dto.creditedInvoiceId);
      if (inv.kind !== "invoice" || inv.customerId !== c.id || inv.currency !== currency) throw new BadRequestException("Credit an invoice of the same customer and currency");
    }
    const lines = await this.buildLines(ctx, dto.lines, currency, date, c.taxExempt);
    return super.create(ctx, { ...dto, built: { lines, customer: c, currency, rate: await this.rateFor(ctx, currency, date) } });
  }

  async update(ctx: RequestContext, id: string, dto: UpdateInvoiceDto & { built?: { lines: InvoiceLine[] } }, expectedVersion?: number): Promise<InvoiceDoc> {
    if (!dto.lines) return super.update(ctx, id, dto, expectedVersion);
    const before = await this.repo.get(ctx, id);
    const c = await customer(this.firestore, ctx, before.customerId);
    return super.update(ctx, id, { ...dto, built: { lines: await this.buildLines(ctx, dto.lines, before.currency, before.date, c.taxExempt) } }, expectedVersion);
  }

  protected toNew(dto: InvoiceInput): NewDoc<InvoiceDoc> {
    const b = dto.built!;
    const kind = dto.kind ?? "invoice";
    const date = dto.date?.slice(0, 10) ?? today();
    const totals = invoiceTotals(b.lines);
    return {
      number: "", kind, invoiceType: dto.invoiceType ?? "standard", customerId: b.customer.id, orderId: b.orderId ?? orNull(dto.orderId), deliveryId: b.deliveryId ?? null, returnId: b.returnId ?? null,
      scheduleEntryId: orNull(dto.scheduleEntryId), recurringScheduleId: orNull(dto.recurringScheduleId), appliedToInvoiceId: null,
      creditedInvoiceId: orNull(dto.creditedInvoiceId), customerReference: orNull(dto.customerReference), date,
      dueDate: dto.dueDate?.slice(0, 10) ?? (kind === "invoice" ? addDays(date, b.customer.paymentTermsDays) : date), currency: b.currency, rate: b.rate,
      lines: b.lines, totals, baseTotal: 0, amountPaid: 0, balanceDue: totals.total, status: "draft", journalId: null, postedAt: null, applications: [],
      dunningLevel: 0, lastReminderAt: null, notes: orNull(dto.notes),
    };
  }

  protected async beforeWrite(tx: Transaction, ctx: RequestContext, next: InvoiceDoc): Promise<void> {
    if (next.kind === "credit_note" && next.number.startsWith("INV-")) next.number = next.number.replace(/^INV-/, "CN-");
    const base = (await this.ledger.settings(ctx, tx))?.baseCurrency ?? "LKR";
    next.baseTotal = toBase(next.totals.total, next.rate, next.currency, base);
  }

  protected toPatch(dto: UpdateInvoiceDto & { built?: { lines: InvoiceLine[] } }, before: InvoiceDoc): Patch<InvoiceDoc> {
    if (before.status !== "draft") throw new BadRequestException("Only draft invoices can be changed; issue a credit note instead");
    const { lines: _l, built, date, dueDate, ...rest } = dto;
    const patch = { ...rest } as Patch<InvoiceDoc>;
    if (date) Object.assign(patch, { date: date.slice(0, 10) });
    if (dueDate) Object.assign(patch, { dueDate: dueDate.slice(0, 10) });
    if (built) {
      const totals = invoiceTotals(built.lines);
      Object.assign(patch, { lines: built.lines, totals, balanceDue: totals.total });
    }
    return patch;
  }

  /** Journal lines: receivable against income (per account) and output tax; mirrored for credit notes. */
  private async journalLines(tx: Transaction, ctx: RequestContext, inv: InvoiceDoc): Promise<LineInput[]> {
    const settings = await this.ledger.settings(ctx, tx);
    const base = settings?.baseCurrency ?? "LKR";
    const credit = inv.kind === "invoice";
    const incomeRole = !credit ? "salesReturns" : inv.invoiceType === "deposit" ? "customerDeposits" : "revenue";
    const byAccount = new Map<string, number>();
    for (const l of inv.lines) {
      const acc = l.accountId ?? this.ledger.account(settings, incomeRole);
      byAccount.set(acc, (byAccount.get(acc) ?? 0) + l.net);
    }
    const party = { partyType: "customer" as const, partyId: inv.customerId };
    const foreign = inv.currency !== base ? { currency: inv.currency } : {};
    const lines: LineInput[] = [];
    let baseSum = 0;
    for (const [accountId, amount] of byAccount) {
      const b = toBase(amount, inv.rate, inv.currency, base);
      baseSum += b;
      lines.push({ accountId, [credit ? "credit" : "debit"]: b, description: inv.number, ...foreign, foreignAmount: inv.currency !== base ? amount : null });
    }
    if (inv.totals.tax) {
      const b = toBase(inv.totals.tax, inv.rate, inv.currency, base);
      baseSum += b;
      lines.push({ accountId: this.ledger.account(settings, "taxOutput"), [credit ? "credit" : "debit"]: b, description: `${inv.number} tax` });
    }
    lines.push({ accountId: this.ledger.account(settings, "receivable"), [credit ? "debit" : "credit"]: baseSum, description: inv.number, ...party, ...foreign, foreignAmount: inv.currency !== base ? inv.totals.total : null });
    return lines;
  }

  /** Posts the invoice (or credit note) to the ledger. */
  async post(ctx: RequestContext, id: string): Promise<InvoiceDoc> {
    return this.firestore.runTransaction(async (tx) => (await this.preparePost(tx, ctx, await this.repo.get(ctx, id, tx))).apply());
  }

  async preparePost(tx: Transaction, ctx: RequestContext, before: InvoiceDoc) {
    if (before.status !== "draft") throw new BadRequestException("Only draft invoices can be posted");
    if (before.totals.total <= 0) throw new BadRequestException("The total must be positive");
    const lines = await this.journalLines(tx, ctx, before);
    const plan = await this.ledger.prepare(tx, ctx, {
      date: before.date, lines, source: "system", memo: `${before.kind === "invoice" ? "Invoice" : "Credit note"} ${before.number}`,
      reference: { entityType: this.entityType, entityId: before.id, label: before.number },
    }, { withNumber: true });
    return {
      apply: (): InvoiceDoc => {
        const journal = plan.commitNew();
        const { after } = this.repo.applyUpdate(ctx, tx, before, { status: "posted", journalId: journal.id, postedAt: new Date().toISOString() });
        this.events.publish(tx, ctx, before.kind === "invoice" ? "InvoicePosted" : "CreditNotePosted", { entity: this.entityType, entityId: before.id }, {
          invoiceId: before.id, customerId: before.customerId, total: before.totals.total, currency: before.currency, dueDate: before.dueDate,
        });
        return after;
      },
    };
  }

  async cancel(ctx: RequestContext, id: string): Promise<InvoiceDoc> {
    const inv = await this.repo.get(ctx, id);
    if (inv.status !== "draft") throw new BadRequestException("Posted invoices cannot be cancelled; issue a credit note");
    return (await this.repo.update(ctx, id, { status: "cancelled" })).after;
  }

  /** Invoices a dispatched delivery at the order's prices; once per delivery. */
  async fromDelivery(ctx: RequestContext, deliveryId: string, post = false): Promise<InvoiceDoc> {
    const delivery = (await this.firestore.collection<DeliveryDoc>(SALES_COLLECTIONS.deliveries).doc(deliveryId).get()).data();
    if (!delivery || delivery.companyId !== ctx.companyId) throw new BadRequestException("Delivery not found");
    if (!["dispatched", "delivered"].includes(delivery.status)) throw new BadRequestException("Only dispatched deliveries can be invoiced");
    const order = (await this.firestore.collection<OrderDoc>(SALES_COLLECTIONS.orders).doc(delivery.orderId).get()).data()!;
    const c = await customer(this.firestore, ctx, order.accountId);
    const date = today();
    const lines = delivery.lines.map((dl) => {
      const ol = order.lines.find((x) => x.lineId === dl.orderLineId)!;
      return computeInvoiceLine({ lineId: randomUUID().slice(0, 8), productId: dl.productId, description: ol.description, qty: dl.qty, unitPrice: ol.unitPrice, discountPct: ol.discountPct, taxCode: ol.taxCode, taxRate: ol.taxRate, accountId: null });
    });
    const rate = await this.rateFor(ctx, order.currency, date);
    const existing = await this.repo.collection.where("companyId", "==", ctx.companyId).where("deliveryId", "==", deliveryId).get();
    if (existing.docs.some((d) => d.data().status !== "cancelled")) throw new BadRequestException("This delivery is already invoiced");
    const inv = await this.create(ctx, {
      customerId: c.id, customerReference: order.customerReference ?? undefined, date, currency: order.currency, lines: [],
      built: { lines, customer: c, currency: order.currency, rate, orderId: order.id, deliveryId },
    });
    return post ? this.post(ctx, inv.id) : inv;
  }

  /** Credits a received sales return at the original prices. */
  async fromReturn(ctx: RequestContext, returnId: string, post = false): Promise<InvoiceDoc> {
    const ret = (await this.firestore.collection<ReturnDoc>(SALES_COLLECTIONS.returns).doc(returnId).get()).data();
    if (!ret || ret.companyId !== ctx.companyId) throw new BadRequestException("Return not found");
    if (ret.status !== "received") throw new BadRequestException("Only received returns can be credited");
    const delivery = (await this.firestore.collection<DeliveryDoc>(SALES_COLLECTIONS.deliveries).doc(ret.deliveryId).get()).data()!;
    const order = (await this.firestore.collection<OrderDoc>(SALES_COLLECTIONS.orders).doc(ret.orderId).get()).data()!;
    const c = await customer(this.firestore, ctx, order.accountId);
    const date = today();
    const lines = ret.lines.map((rl) => {
      const ol = order.lines.find((x) => x.lineId === delivery.lines[rl.deliveryLineIndex]!.orderLineId)!;
      return computeInvoiceLine({ lineId: randomUUID().slice(0, 8), productId: rl.productId, description: ol.description, qty: rl.qty, unitPrice: ol.unitPrice, discountPct: ol.discountPct, taxCode: ol.taxCode, taxRate: ol.taxRate, accountId: null });
    });
    const existing = await this.repo.collection.where("companyId", "==", ctx.companyId).where("returnId", "==", returnId).get();
    if (existing.docs.some((d) => d.data().status !== "cancelled")) throw new BadRequestException("This return is already credited");
    const invoiced = (await this.repo.collection.where("companyId", "==", ctx.companyId).where("deliveryId", "==", ret.deliveryId).get()).docs.map((d) => d.data()).find((d) => d.kind === "invoice" && d.status !== "cancelled");
    const cn = await this.create(ctx, {
      customerId: c.id, kind: "credit_note", creditedInvoiceId: invoiced?.id, date, currency: order.currency, lines: [], notes: ret.reason,
      built: { lines, customer: c, currency: order.currency, rate: await this.rateFor(ctx, order.currency, date), orderId: order.id, deliveryId: null, returnId },
    });
    return post ? this.post(ctx, cn.id) : cn;
  }

  /**
   * Drafts a deposit or milestone invoice for one entry of an order's billing
   * schedule, at a percentage of the order's net total or a fixed amount. A
   * deposit posts to customer deposits (a liability) instead of revenue.
   */
  async fromScheduleEntry(ctx: RequestContext, orderId: string, entryId: string, post = false): Promise<InvoiceDoc> {
    const order = await this.orders.repo.get(ctx, orderId);
    if (order.status === "cancelled" || order.status === "closed") throw new BadRequestException(`A ${order.status} order cannot be invoiced`);
    const entry = order.billingSchedule.find((e) => e.entryId === entryId);
    if (!entry) throw new BadRequestException("Billing schedule entry not found");
    if (entry.status !== "pending") throw new BadRequestException("This schedule entry is already invoiced or cancelled");
    const net = order.totals.total - order.totals.tax;
    const amount = entry.basis === "percent" ? applyRate(net, entry.value, 4) : entry.value;
    if (amount <= 0) throw new BadRequestException("The schedule amount must be positive");
    const c = await customer(this.firestore, ctx, order.accountId);
    // A deposit carries no tax of its own: tax is recognised once, on the final invoice. "" (not undefined) stops buildLines defaulting to the settings tax code.
    const taxCode = entry.kind === "deposit" ? "" : entry.taxCode ?? undefined;
    const inv = await this.create(ctx, {
      customerId: c.id, currency: order.currency, customerReference: order.customerReference ?? undefined,
      invoiceType: entry.kind, orderId: order.id, scheduleEntryId: entry.entryId,
      lines: [{ description: entry.label, qty: "1", unitPrice: fromMinor(amount, order.currency), taxCode }],
    });
    await this.orders.markScheduleInvoiced(ctx, orderId, entryId, inv.id);
    return post ? this.post(ctx, inv.id) : inv;
  }

  /**
   * Uses up a fully-paid deposit against an open invoice of the same
   * customer and currency: the customer deposits liability is cleared
   * against the invoice's receivable, for the deposit's full amount.
   */
  async applyDeposit(ctx: RequestContext, depositInvoiceId: string, invoiceId: string): Promise<{ deposit: InvoiceDoc; invoice: InvoiceDoc }> {
    return this.firestore.runTransaction(async (tx) => {
      const dep = await this.repo.get(ctx, depositInvoiceId, tx);
      const inv = await this.repo.get(ctx, invoiceId, tx);
      if (dep.kind !== "invoice" || dep.invoiceType !== "deposit") throw new BadRequestException("Choose a deposit invoice");
      if (dep.status !== "paid") throw new BadRequestException("The deposit must be fully paid before it is applied");
      if (dep.appliedToInvoiceId) throw new BadRequestException("This deposit is already applied");
      if (inv.kind !== "invoice" || !OPEN.includes(inv.status as never)) throw new BadRequestException("Choose an open invoice");
      if (dep.customerId !== inv.customerId || dep.currency !== inv.currency) throw new BadRequestException("Same customer and currency only");
      const amount = dep.totals.total;
      if (amount > inv.balanceDue) throw new BadRequestException(`The deposit of ${fromMinor(amount, inv.currency)} ${inv.currency} is more than the ${fromMinor(inv.balanceDue, inv.currency)} due`);
      const settings = await this.ledger.settings(ctx, tx);
      const base = toBase(amount, dep.rate, dep.currency, settings?.baseCurrency ?? "LKR");
      const party = { partyType: "customer" as const, partyId: inv.customerId };
      const plan = await this.ledger.prepare(tx, ctx, {
        date: today(), source: "system", memo: `Deposit ${dep.number} applied to ${inv.number}`,
        reference: { entityType: this.entityType, entityId: inv.id, label: inv.number },
        lines: [
          { accountId: this.ledger.account(settings, "customerDeposits"), debit: base, description: dep.number, ...party },
          { accountId: this.ledger.account(settings, "receivable"), credit: base, description: `Deposit ${dep.number}`, ...party },
        ],
      }, { withNumber: true });
      plan.commitNew();
      const date = today();
      const { after: invoice } = this.repo.applyUpdate(ctx, tx, inv, settle(inv, amount, { applications: [...inv.applications, { documentId: dep.id, amount, date }] }));
      const { after: deposit } = this.repo.applyUpdate(ctx, tx, dep, { appliedToInvoiceId: inv.id });
      this.audit.record(ctx, { module: "finance", action: "deposit_applied", entity: this.entityType, entityId: inv.id, after: { depositInvoiceId: dep.id, amount } }, tx);
      return { deposit, invoice };
    });
  }

  /** Uses a posted credit note to settle part of an open invoice (no ledger effect: both sit on receivables). */
  async applyCredit(ctx: RequestContext, creditNoteId: string, invoiceId: string, amountText: string): Promise<{ creditNote: InvoiceDoc; invoice: InvoiceDoc }> {
    return this.firestore.runTransaction(async (tx) => {
      const cn = await this.repo.get(ctx, creditNoteId, tx);
      const inv = await this.repo.get(ctx, invoiceId, tx);
      if (cn.kind !== "credit_note" || !OPEN.includes(cn.status as never)) throw new BadRequestException("Choose a posted credit note with credit left");
      if (inv.kind !== "invoice" || !OPEN.includes(inv.status as never)) throw new BadRequestException("Choose an open invoice");
      if (cn.customerId !== inv.customerId || cn.currency !== inv.currency) throw new BadRequestException("Same customer and currency only");
      const amount = toMinor(amountText, inv.currency);
      if (amount <= 0 || amount > cn.balanceDue || amount > inv.balanceDue) throw new BadRequestException(`At most ${fromMinor(Math.min(cn.balanceDue, inv.balanceDue), inv.currency)} can be applied`);
      const date = today();
      const after = (d: InvoiceDoc, other: string) => this.repo.applyUpdate(ctx, tx, d, settle(d, amount, { applications: [...d.applications, { documentId: other, amount, date }] })).after;
      return { creditNote: after(cn, inv.id), invoice: after(inv, cn.id) };
    });
  }

  /** Writes off what is left on an invoice to a bad-debt expense account. */
  async writeOff(ctx: RequestContext, id: string, accountId: string, reason: string): Promise<InvoiceDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const inv = await this.repo.get(ctx, id, tx);
      if (inv.kind !== "invoice" || !OPEN.includes(inv.status as never)) throw new BadRequestException("Only open invoices can be written off");
      const settings = await this.ledger.settings(ctx, tx);
      const base = toBase(inv.balanceDue, inv.rate, inv.currency, settings?.baseCurrency ?? "LKR");
      const plan = await this.ledger.prepare(tx, ctx, {
        date: today(), source: "system", memo: `Write-off ${inv.number}: ${reason}`, reference: { entityType: this.entityType, entityId: id, label: inv.number },
        lines: [
          { accountId, debit: base, description: reason },
          { accountId: this.ledger.account(settings, "receivable"), credit: base, partyType: "customer", partyId: inv.customerId, description: `Write-off ${inv.number}` },
        ],
      }, { withNumber: true });
      plan.commitNew();
      const { after } = this.repo.applyUpdate(ctx, tx, inv, { ...settle(inv, inv.balanceDue, {}), status: "written_off" });
      this.audit.record(ctx, { module: "finance", action: "written_off", entity: this.entityType, entityId: id, reason }, tx);
      return after;
    });
  }

  protected searchEntry(doc: InvoiceDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: `${fromMinor(doc.totals.total, doc.currency)} ${doc.currency}`, keywords: [doc.customerReference] };
  }
}

/** Patch for settling `amount` of a document's balance. */
function settle(doc: InvoiceDoc, amount: number, extra: Partial<InvoiceDoc>): Patch<InvoiceDoc> {
  const amountPaid = doc.amountPaid + amount;
  const balanceDue = doc.totals.total - amountPaid;
  return { ...extra, amountPaid, balanceDue, status: balanceDue <= 0 ? "paid" : "partially_paid" } as Patch<InvoiceDoc>;
}

// ─── Customer receipts ────────────────────────────────────────────────────────

@Injectable()
export class ReceiptService extends MasterDataService<ReceiptDoc, CreateReceiptDto, UpdateReceiptDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly ledger: GeneralLedger,
    private readonly invoices: InvoiceService,
    private readonly events: EventBusService,
  ) {
    super(fs, audit, unique, {
      module: "finance",
      entity: "receipt",
      label: "Customer receipt",
      collection: AR_COLLECTIONS.receipts,
      route: "/finance/receipts",
      filterFields: ["customerId", "status"],
      large: AR_LISTS.receipts,
      numbering: { field: "number", key: "customerReceipt", prefix: "RCT", yearly: true },
      customFields: false,
    });
  }

  /**
   * Records money received and posts it: the bank is debited at today's rate,
   * each settled invoice is credited off receivables at its own rate (the
   * difference goes to exchange gains and losses), and anything unallocated
   * stays on the customer's account as a credit.
   */
  async create(ctx: RequestContext, dto: CreateReceiptDto): Promise<ReceiptDoc> {
    const c = await customer(this.firestore, ctx, dto.customerId);
    const currency = dto.currency ?? c.currency;
    const date = dto.date?.slice(0, 10) ?? today();
    const amount = toMinor(dto.amount, currency);
    if (amount <= 0) throw new BadRequestException("The amount must be positive");
    const settings0 = await this.ledger.settings(ctx);
    const bankAccountId = dto.bankAccountId ?? this.ledger.account(settings0, "bank");
    const rate = await this.invoices.rateFor(ctx, currency, date);
    const openIds = (await this.invoices.repo.collection.where("companyId", "==", ctx.companyId).where("customerId", "==", c.id).where("kind", "==", "invoice").get()).docs
      .map((d) => d.data())
      .filter((d) => OPEN.includes(d.status as never) && d.currency === currency)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number))
      .map((d) => d.id);

    return this.firestore.runTransaction(async (tx) => {
      const settings = await this.ledger.settings(ctx, tx);
      const base = settings?.baseCurrency ?? "LKR";
      const wanted = dto.allocations?.map((a) => ({ invoiceId: a.invoiceId, amount: toMinor(a.amount, currency) }));
      const ids = wanted ? [...new Set(wanted.map((a) => a.invoiceId))] : openIds;
      const invoices = new Map((await this.invoices.repo.getMany(ctx, ids, tx)).map((i) => [i.id, i]));
      const allocations: { invoiceId: string; amount: number }[] = [];
      let left = amount;
      if (wanted) {
        for (const a of wanted) {
          const inv = invoices.get(a.invoiceId);
          if (!inv || inv.customerId !== c.id || inv.kind !== "invoice" || !OPEN.includes(inv.status as never)) throw new BadRequestException("Allocate only to this customer's open invoices");
          if (inv.currency !== currency) throw new BadRequestException(`${inv.number} is in ${inv.currency}`);
          if (a.amount <= 0 || a.amount > inv.balanceDue) throw new BadRequestException(`At most ${fromMinor(inv.balanceDue, currency)} is due on ${inv.number}`);
          left -= a.amount;
          allocations.push(a);
        }
        if (left < 0) throw new BadRequestException("Allocations exceed the amount received");
      } else {
        for (const id of ids) {
          const inv = invoices.get(id);
          if (!inv || left <= 0 || !OPEN.includes(inv.status as never)) continue;
          const take = Math.min(left, inv.balanceDue);
          allocations.push({ invoiceId: id, amount: take });
          left -= take;
        }
      }

      const bankBase = toBase(amount, rate, currency, base);
      const party = { partyType: "customer" as const, partyId: c.id };
      const lines: LineInput[] = [{ accountId: bankAccountId, debit: bankBase, description: `Receipt from ${c.name}` }];
      let creditedBase = 0;
      for (const a of allocations) {
        const inv = invoices.get(a.invoiceId)!;
        const b = toBase(a.amount, inv.rate, currency, base);
        creditedBase += b;
        lines.push({ accountId: this.ledger.account(settings, "receivable"), credit: b, description: inv.number, ...party });
      }
      if (left > 0) {
        const b = toBase(left, rate, currency, base);
        creditedBase += b;
        lines.push({ accountId: this.ledger.account(settings, "receivable"), credit: b, description: "On account", ...party });
      }
      // Exchange difference: bank received more (gain) or less (loss) than receivables carried.
      if (bankBase !== creditedBase) lines.push({ accountId: this.ledger.account(settings, "fx"), credit: bankBase - creditedBase, description: "Exchange difference" });

      const number = await this.reserveNumber(tx, ctx);
      const id = this.repo.newId();
      const plan = await this.ledger.prepare(tx, ctx, { date, lines, source: "system", memo: `Receipt ${number.number} from ${c.name}`, reference: { entityType: this.entityType, entityId: id, label: number.number } }, { withNumber: true });

      // Writes.
      number.commit();
      const journal = plan.commitNew();
      const doc = this.repo.build(ctx, {
        id, number: number.number, customerId: c.id, date, currency, rate, amount, bankAccountId, method: dto.method ?? "bank_transfer", reference: dto.reference ?? null,
        allocations, unallocated: left, status: "posted", journalId: journal.id, notes: dto.notes ?? null,
      } as NewDoc<ReceiptDoc>);
      tx.create(this.repo.ref(id), doc);
      for (const a of allocations) {
        const inv = invoices.get(a.invoiceId)!;
        this.invoices.repo.applyUpdate(ctx, tx, inv, settle(inv, a.amount, { applications: [...inv.applications, { documentId: id, amount: a.amount, date }] }));
      }
      this.audit.record(ctx, { module: "finance", action: "created", entity: this.entityType, entityId: id, after: doc }, tx);
      this.events.publish(tx, ctx, "PaymentReceived", { entity: this.entityType, entityId: id }, { receiptId: id, customerId: c.id, amount, currency, allocations });
      return doc;
    });
  }

  protected toPatch(dto: UpdateReceiptDto): Patch<ReceiptDoc> {
    return { ...dto } as Patch<ReceiptDoc>;
  }

  protected searchEntry(doc: ReceiptDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: `${fromMinor(doc.amount, doc.currency)} ${doc.currency}`, keywords: [doc.reference] };
  }
}

// ─── Receivables reports ──────────────────────────────────────────────────────

const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;

@Injectable()
export class ReceivablesService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly invoices: InvoiceService,
    private readonly receipts: ReceiptService,
  ) {}

  /** Open balances by customer in overdue buckets as at a date (base currency). */
  async ageing(ctx: RequestContext, asOf = today()) {
    const open = (await this.invoices.repo.collection.where("companyId", "==", ctx.companyId).where("status", "in", [...OPEN]).get()).docs.map((d) => d.data()).filter((d) => !d.archivedAt);
    const unapplied = (await this.receipts.repo.collection.where("companyId", "==", ctx.companyId).where("status", "==", "posted").get()).docs.map((d) => d.data()).filter((r) => r.unallocated > 0);
    const rows = new Map<string, { customerId: string; buckets: Record<(typeof BUCKETS)[number], number>; credits: number; total: number }>();
    const row = (id: string) => rows.get(id) ?? rows.set(id, { customerId: id, buckets: { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 }, credits: 0, total: 0 }).get(id)!;
    const ratio = (d: { baseTotal?: number; totals?: { total: number } }) => (d.totals?.total ? (d.baseTotal ?? 0) / d.totals.total : 1);
    for (const d of open) {
      const amount = Math.round(d.balanceDue * ratio(d));
      const r = row(d.customerId);
      if (d.kind === "credit_note") {
        r.credits += amount;
        r.total -= amount;
        continue;
      }
      const late = Math.floor((Date.parse(asOf) - Date.parse(d.dueDate)) / 86_400_000);
      const bucket = late <= 0 ? "current" : late <= 30 ? "1-30" : late <= 60 ? "31-60" : late <= 90 ? "61-90" : "90+";
      r.buckets[bucket] += amount;
      r.total += amount;
    }
    for (const rc of unapplied) {
      const r = row(rc.customerId);
      r.credits += rc.unallocated;
      r.total -= rc.unallocated;
    }
    const lines = [...rows.values()].sort((a, b) => b.total - a.total);
    const totals = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as Record<(typeof BUCKETS)[number], number>;
    for (const l of lines) for (const b of BUCKETS) totals[b] += l.buckets[b];
    return { asOf, buckets: BUCKETS, lines, totals, total: lines.reduce((a, l) => a + l.total, 0) };
  }

  /** A customer's invoices, credit notes and receipts with a running balance (document currency). */
  async statement(ctx: RequestContext, customerId: string) {
    const c = await customer(this.firestore, ctx, customerId);
    const docs = (await this.invoices.repo.collection.where("companyId", "==", ctx.companyId).where("customerId", "==", customerId).get()).docs.map((d) => d.data())
      .filter((d) => !["draft", "cancelled"].includes(d.status));
    const receipts = (await this.receipts.repo.collection.where("companyId", "==", ctx.companyId).where("customerId", "==", customerId).get()).docs.map((d) => d.data())
      .filter((r) => r.status === "posted");
    const rows = [
      ...docs.map((d) => ({ date: d.date, type: d.kind, documentId: d.id, number: d.number, currency: d.currency, debit: d.kind === "invoice" ? d.totals.total : 0, credit: d.kind === "credit_note" ? d.totals.total : 0, dueDate: d.kind === "invoice" ? d.dueDate : null })),
      ...docs.filter((d) => d.status === "written_off").map((d) => ({ date: d.updatedAt.slice(0, 10), type: "write_off", documentId: d.id, number: d.number, currency: d.currency, debit: 0, credit: d.applications.reduce((a, x) => a - x.amount, d.amountPaid), dueDate: null })),
      ...receipts.map((r) => ({ date: r.date, type: "receipt", documentId: r.id, number: r.number, currency: r.currency, debit: 0, credit: r.amount, dueDate: null })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
    let balance = 0;
    const lines = rows.map((r) => {
      balance += r.debit - r.credit;
      return { ...r, balance };
    });
    return { customer: { id: c.id, name: c.name, code: c.code, currency: c.currency }, lines, balance };
  }
}
