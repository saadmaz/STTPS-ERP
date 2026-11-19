import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { hasPermission, RequestContext, Scope } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { applyRate, extend, fromMinor, toMinor, toQty } from "../platform/data/money.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { SalesSettingsService } from "../sales/sales.services.js";
import { GoodsReceiptDoc, PROCUREMENT_COLLECTIONS, PurchaseOrderDoc } from "../procurement/procurement.models.js";
import { AP_COLLECTIONS, AP_LISTS, BillDoc, BillLine, MatchResult, PaymentDoc } from "./ap.models.js";
import { BillLineDto, CreateBillDto, CreatePaymentDto, PaymentRunDto, UpdateBillDto, UpdatePaymentDto } from "./ap.dto.js";
import { InvoiceService, toBase } from "./ar.services.js";
import { GeneralLedger, LineInput } from "./ledger.service.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const OPEN = ["posted", "partially_paid"] as const;
const isOpen = (s: string) => (OPEN as readonly string[]).includes(s);

interface Supplier {
  id: string;
  companyId: string;
  name: string;
  code: string;
  currency: string;
  paymentTermsDays: number;
  archivedAt: string | null;
}

async function supplier(fs: FirestoreService, scope: Scope, id: string): Promise<Supplier> {
  const s = (await fs.collection(PROCUREMENT_COLLECTIONS.suppliers).doc(id).get()).data() as Supplier | undefined;
  if (!s || s.companyId !== scope.companyId || s.archivedAt) throw new BadRequestException("Supplier not found");
  return { ...s, id };
}

const billLine = (l: Omit<BillLine, "net" | "tax" | "total">): BillLine => {
  const net = extend(l.qty, l.unitPrice);
  const tax = applyRate(net, l.taxRate, 4);
  return { ...l, net, tax, total: net + tax };
};

const totalsOf = (lines: BillLine[]) => ({
  subtotal: lines.reduce((a, l) => a + l.net, 0),
  tax: lines.reduce((a, l) => a + l.tax, 0),
  total: lines.reduce((a, l) => a + l.total, 0),
});

/**
 * Three-way match: each order line may be billed up to what was accepted into
 * stock (less returns), at the order price. Lines that are not on the order
 * are flagged too.
 */
export function matchBill(lines: BillLine[], order: PurchaseOrderDoc | null, priorBilled: Map<string, number>): MatchResult {
  if (!order) return { status: "not_applicable", issues: [] };
  const issues: string[] = [];
  const thisBill = new Map<string, number>();
  for (const l of lines) {
    if (!l.orderLineId) {
      issues.push(`${l.description} is not on order ${order.number}`);
      continue;
    }
    thisBill.set(l.orderLineId, (thisBill.get(l.orderLineId) ?? 0) + l.qty);
    const ol = order.lines.find((x) => x.lineId === l.orderLineId);
    if (!ol) {
      issues.push(`${l.description} is not on order ${order.number}`);
      continue;
    }
    if (l.unitPrice !== ol.unitPrice) issues.push(`${ol.description}: billed at ${fromMinor(l.unitPrice, order.currency)}, ordered at ${fromMinor(ol.unitPrice, order.currency)}`);
  }
  for (const [lineId, qty] of thisBill) {
    const ol = order.lines.find((x) => x.lineId === lineId);
    if (!ol) continue;
    const received = ol.received - ol.rejected - ol.returned;
    const billed = (priorBilled.get(lineId) ?? 0) + qty;
    if (billed > received) issues.push(`${ol.description}: ${billed / 1000} billed but ${received / 1000} received`);
  }
  return { status: issues.length ? "variance" : "matched", issues };
}

// ─── Bills and debit notes ────────────────────────────────────────────────────

type BillInput = CreateBillDto & { built?: { lines: BillLine[]; supplier: Supplier; currency: string; rate: string; order: PurchaseOrderDoc | null; receiptId?: string | null } };

@Injectable()
export class BillService extends MasterDataService<BillDoc, BillInput, UpdateBillDto & { built?: { lines: BillLine[] } }> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly ledger: GeneralLedger,
    private readonly taxes: SalesSettingsService,
    private readonly invoices: InvoiceService,
    private readonly events: EventBusService,
  ) {
    super(fs, audit, unique, {
      module: "finance",
      entity: "bill",
      label: "Supplier bill",
      collection: AP_COLLECTIONS.bills,
      route: "/finance/bills",
      uniqueFields: ["supplierInvoiceKey"],
      filterFields: ["status", "supplierId", "kind", "orderId"],
      large: AP_LISTS.bills,
      numbering: { field: "number", key: "bill", prefix: "BILL", yearly: true },
      customFields: false,
    });
  }

  private async order(ctx: RequestContext, id: string | undefined | null, tx?: Transaction): Promise<PurchaseOrderDoc | null> {
    if (!id) return null;
    const ref = this.firestore.collection<PurchaseOrderDoc>(PROCUREMENT_COLLECTIONS.orders).doc(id);
    const o = (tx ? await tx.get(ref) : await ref.get()).data();
    if (!o || o.companyId !== ctx.companyId) throw new BadRequestException("Purchase order not found");
    return o;
  }

  async buildLines(ctx: RequestContext, input: BillLineDto[], currency: string, order: PurchaseOrderDoc | null): Promise<BillLine[]> {
    const settings = await this.taxes.get(ctx);
    return input.map((l) => {
      const ol = l.orderLineId ? order?.lines.find((x) => x.lineId === l.orderLineId) : undefined;
      if (l.orderLineId && !ol) throw new BadRequestException("Order line not found");
      const description = l.description?.trim() || ol?.description;
      if (!description) throw new BadRequestException("Describe each line");
      const taxCode = l.taxCode ?? ol?.taxCode ?? null;
      const tax = taxCode ? settings.taxRates.find((t) => t.code === taxCode) : undefined;
      if (taxCode && !tax) throw new BadRequestException(`Unknown tax code ${taxCode}`);
      const stocked = ol?.stocked ?? false;
      if (!stocked && !l.accountId) throw new BadRequestException(`Choose an expense account for ${description}`);
      const qty = toQty(l.qty);
      if (qty <= 0) throw new BadRequestException("Quantities must be positive");
      return billLine({
        lineId: randomUUID().slice(0, 8), productId: ol?.productId ?? l.productId ?? null, orderLineId: ol?.lineId ?? null, description, qty,
        unitPrice: toMinor(l.unitPrice, currency), taxCode: tax?.code ?? null, taxRate: tax?.rate ?? 0, accountId: l.accountId ?? null, stocked, orderPrice: ol?.unitPrice ?? null,
      });
    });
  }

  async create(ctx: RequestContext, dto: BillInput): Promise<BillDoc> {
    if (dto.built) return super.create(ctx, dto);
    const s = await supplier(this.firestore, ctx, dto.supplierId);
    const order = await this.order(ctx, dto.orderId);
    if (order && order.supplierId !== s.id) throw new BadRequestException("The order is for another supplier");
    const currency = order?.currency ?? dto.currency ?? s.currency;
    const date = dto.date?.slice(0, 10) ?? today();
    const lines = await this.buildLines(ctx, dto.lines, currency, order);
    return super.create(ctx, { ...dto, built: { lines, supplier: s, currency, rate: await this.invoices.rateFor(ctx, currency, date), order } });
  }

  async update(ctx: RequestContext, id: string, dto: UpdateBillDto & { built?: { lines: BillLine[] } }, expectedVersion?: number): Promise<BillDoc> {
    if (!dto.lines) return super.update(ctx, id, dto, expectedVersion);
    const before = await this.repo.get(ctx, id);
    return super.update(ctx, id, { ...dto, built: { lines: await this.buildLines(ctx, dto.lines, before.currency, await this.order(ctx, before.orderId)) } }, expectedVersion);
  }

  protected toNew(dto: BillInput): NewDoc<BillDoc> {
    const b = dto.built!;
    const kind = dto.kind ?? "bill";
    const date = dto.date?.slice(0, 10) ?? today();
    const totals = totalsOf(b.lines);
    const no = dto.supplierInvoiceNo.trim();
    return {
      number: "", kind, supplierId: b.supplier.id, supplierInvoiceNo: no, supplierInvoiceKey: `${b.supplier.id}|${kind}|${no.toLowerCase()}`,
      orderId: b.order?.id ?? null, receiptId: b.receiptId ?? null, creditedBillId: orNull(dto.creditedBillId), date,
      dueDate: dto.dueDate?.slice(0, 10) ?? (kind === "bill" ? addDays(date, b.supplier.paymentTermsDays) : date), currency: b.currency, rate: b.rate,
      lines: b.lines, totals, baseTotal: 0, match: { status: "not_applicable", issues: [] }, overrideReason: null, amountPaid: 0, balanceDue: totals.total,
      status: "draft", journalId: null, postedAt: null, applications: [], notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateBillDto & { built?: { lines: BillLine[] } }, before: BillDoc): Patch<BillDoc> {
    if (before.status !== "draft") throw new BadRequestException("Only draft bills can be changed");
    const { lines: _l, built, date, dueDate, ...rest } = dto;
    const patch = { ...rest } as Patch<BillDoc>;
    if (date) Object.assign(patch, { date: date.slice(0, 10) });
    if (dueDate) Object.assign(patch, { dueDate: dueDate.slice(0, 10) });
    if (built) {
      const totals = totalsOf(built.lines);
      Object.assign(patch, { lines: built.lines, totals, balanceDue: totals.total });
    }
    return patch;
  }

  /** Re-checks the match whenever the bill is saved, so the list shows variances before posting. */
  protected async derive(tx: Transaction, ctx: RequestContext, next: BillDoc): Promise<Partial<BillDoc>> {
    if (next.kind === "debit_note" && next.number.startsWith("BILL-")) next.number = next.number.replace(/^BILL-/, "DN-");
    const base = (await this.ledger.settings(ctx, tx))?.baseCurrency ?? "LKR";
    const order = next.kind === "bill" ? await this.order(ctx, next.orderId, tx) : null;
    return { baseTotal: toBase(next.totals.total, next.rate, next.currency, base), match: matchBill(next.lines, order, await this.priorBilled(ctx, next, tx)) };
  }

  private async priorBilled(ctx: RequestContext, bill: BillDoc, tx?: Transaction): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!bill.orderId) return out;
    const q = this.repo.collection.where("companyId", "==", ctx.companyId).where("orderId", "==", bill.orderId);
    for (const d of (tx ? await tx.get(q) : await q.get()).docs.map((x) => x.data())) {
      if (d.id === bill.id || ["draft", "cancelled"].includes(d.status)) continue;
      for (const l of d.lines) if (l.orderLineId) out.set(l.orderLineId, (out.get(l.orderLineId) ?? 0) + (d.kind === "bill" ? l.qty : -l.qty));
    }
    return out;
  }

  private async journalLines(tx: Transaction, ctx: RequestContext, bill: BillDoc): Promise<LineInput[]> {
    const settings = await this.ledger.settings(ctx, tx);
    const base = settings?.baseCurrency ?? "LKR";
    const debit = bill.kind === "bill";
    const side = (amount: number) => (debit ? { debit: amount } : { credit: amount });
    const conv = (amount: number) => toBase(amount, bill.rate, bill.currency, base);
    const lines: LineInput[] = [];
    let sum = 0;
    const push = (accountId: string, amount: number, description: string) => {
      if (!amount) return;
      lines.push({ accountId, ...side(amount), description });
      sum += amount;
    };
    for (const l of bill.lines) {
      if (l.stocked && l.orderPrice !== null) {
        const atOrder = conv(extend(l.qty, l.orderPrice));
        push(this.ledger.account(settings, "grni"), atOrder, l.description);
        push(this.ledger.account(settings, "priceVariance"), conv(l.net) - atOrder, `${l.description} price variance`);
      } else {
        push(l.accountId ?? this.ledger.account(settings, "grni"), conv(l.net), l.description);
      }
    }
    push(this.ledger.account(settings, "taxInput"), conv(bill.totals.tax), `${bill.number} tax`);
    lines.push({ accountId: this.ledger.account(settings, "payable"), ...(debit ? { credit: sum } : { debit: sum }), partyType: "supplier", partyId: bill.supplierId, description: `${bill.number} · ${bill.supplierInvoiceNo}` });
    return lines;
  }

  /** Posts the bill to payables. A bill that does not match needs an override reason and permission. */
  async post(ctx: RequestContext, id: string, overrideReason?: string): Promise<BillDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "draft") throw new BadRequestException("Only draft bills can be posted");
      const order = before.kind === "bill" ? await this.order(ctx, before.orderId, tx) : null;
      const match = matchBill(before.lines, order, await this.priorBilled(ctx, before, tx));
      if (match.status === "variance") {
        if (!overrideReason?.trim()) throw new BadRequestException(`The bill does not match: ${match.issues.join("; ")}`);
        if (!hasPermission(ctx, "finance.bill.override")) throw new ForbiddenException("Posting a bill that does not match needs override permission");
      }
      const lines = await this.journalLines(tx, ctx, before);
      const plan = await this.ledger.prepare(tx, ctx, {
        date: before.date, lines, source: "system", memo: `${before.kind === "bill" ? "Bill" : "Debit note"} ${before.number} (${before.supplierInvoiceNo})`,
        reference: { entityType: this.entityType, entityId: id, label: before.number },
      }, { withNumber: true });
      const journal = plan.commitNew();
      const { after } = this.repo.applyUpdate(ctx, tx, before, { status: "posted", match, overrideReason: match.status === "variance" ? overrideReason! : null, journalId: journal.id, postedAt: new Date().toISOString() });
      if (match.status === "variance") this.audit.record(ctx, { module: "finance", action: "match.overridden", entity: this.entityType, entityId: id, reason: overrideReason, after: { issues: match.issues } }, tx);
      this.events.publish(tx, ctx, before.kind === "bill" ? "BillPosted" : "DebitNotePosted", { entity: this.entityType, entityId: id }, {
        billId: id, supplierId: before.supplierId, total: before.totals.total, currency: before.currency, dueDate: before.dueDate,
      });
      return after;
    });
  }

  async cancel(ctx: RequestContext, id: string): Promise<BillDoc> {
    const bill = await this.repo.get(ctx, id);
    if (bill.status !== "draft") throw new BadRequestException("Posted bills cannot be cancelled; raise a debit note");
    // Free the supplier invoice number so it can be entered again.
    return (await this.repo.update(ctx, id, { status: "cancelled", supplierInvoiceKey: `${bill.supplierInvoiceKey}#cancelled-${id}` })).after;
  }

  /** Drafts a bill for a posted goods receipt at the order prices. */
  async fromReceipt(ctx: RequestContext, receiptId: string, supplierInvoiceNo: string, date?: string): Promise<BillDoc> {
    const receipt = (await this.firestore.collection<GoodsReceiptDoc>(PROCUREMENT_COLLECTIONS.receipts).doc(receiptId).get()).data();
    if (!receipt || receipt.companyId !== ctx.companyId) throw new BadRequestException("Goods receipt not found");
    if (receipt.status !== "posted") throw new BadRequestException("Only posted receipts can be billed");
    const order = (await this.order(ctx, receipt.orderId))!;
    const s = await supplier(this.firestore, ctx, order.supplierId);
    const d = date?.slice(0, 10) ?? today();
    const lines = receipt.lines.filter((l) => l.accepted > 0).map((rl) => {
      const ol = order.lines.find((x) => x.lineId === rl.orderLineId)!;
      return billLine({
        lineId: randomUUID().slice(0, 8), productId: ol.productId, orderLineId: ol.lineId, description: ol.description, qty: rl.accepted, unitPrice: ol.unitPrice,
        taxCode: ol.taxCode, taxRate: ol.taxRate, accountId: null, stocked: ol.stocked, orderPrice: ol.unitPrice,
      });
    });
    if (lines.some((l) => !l.stocked)) throw new BadRequestException("This receipt has non-stock lines; enter the bill manually with expense accounts");
    return this.create(ctx, {
      supplierId: s.id, supplierInvoiceNo, orderId: order.id, date: d, lines: [],
      built: { lines, supplier: s, currency: order.currency, rate: await this.invoices.rateFor(ctx, order.currency, d), order, receiptId },
    });
  }

  /** Uses a posted debit note to reduce what is owed on a bill. */
  async applyDebit(ctx: RequestContext, debitNoteId: string, billId: string, amountText: string): Promise<{ debitNote: BillDoc; bill: BillDoc }> {
    return this.firestore.runTransaction(async (tx) => {
      const dn = await this.repo.get(ctx, debitNoteId, tx);
      const bill = await this.repo.get(ctx, billId, tx);
      if (dn.kind !== "debit_note" || !isOpen(dn.status)) throw new BadRequestException("Choose a posted debit note with credit left");
      if (bill.kind !== "bill" || !isOpen(bill.status)) throw new BadRequestException("Choose an open bill");
      if (dn.supplierId !== bill.supplierId || dn.currency !== bill.currency) throw new BadRequestException("Same supplier and currency only");
      const amount = toMinor(amountText, bill.currency);
      if (amount <= 0 || amount > dn.balanceDue || amount > bill.balanceDue) throw new BadRequestException(`At most ${fromMinor(Math.min(dn.balanceDue, bill.balanceDue), bill.currency)} can be applied`);
      const date = today();
      const after = (d: BillDoc, other: string) => this.repo.applyUpdate(ctx, tx, d, settle(d, amount, { applications: [...d.applications, { documentId: other, amount, date }] })).after;
      return { debitNote: after(dn, bill.id), bill: after(bill, dn.id) };
    });
  }

  protected searchEntry(doc: BillDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: `${doc.supplierInvoiceNo} · ${fromMinor(doc.totals.total, doc.currency)} ${doc.currency}`, keywords: [doc.supplierInvoiceNo] };
  }
}

function settle(doc: BillDoc, amount: number, extra: Partial<BillDoc>): Patch<BillDoc> {
  const amountPaid = doc.amountPaid + amount;
  const balanceDue = doc.totals.total - amountPaid;
  return { ...extra, amountPaid, balanceDue, status: balanceDue <= 0 ? "paid" : "partially_paid" } as Patch<BillDoc>;
}

// ─── Supplier payments ────────────────────────────────────────────────────────

@Injectable()
export class PaymentService extends MasterDataService<PaymentDoc, CreatePaymentDto, UpdatePaymentDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly ledger: GeneralLedger,
    private readonly bills: BillService,
    private readonly invoices: InvoiceService,
    private readonly events: EventBusService,
  ) {
    super(fs, audit, unique, {
      module: "finance",
      entity: "payment",
      label: "Supplier payment",
      collection: AP_COLLECTIONS.payments,
      route: "/finance/payments",
      filterFields: ["supplierId", "runId"],
      large: AP_LISTS.payments,
      numbering: { field: "number", key: "supplierPayment", prefix: "PAY", yearly: true },
      customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: CreatePaymentDto & { runId?: string }): Promise<PaymentDoc> {
    const s = await supplier(this.firestore, ctx, dto.supplierId);
    const currency = dto.currency ?? s.currency;
    const date = dto.date?.slice(0, 10) ?? today();
    const amount = toMinor(dto.amount, currency);
    if (amount <= 0) throw new BadRequestException("The amount must be positive");
    const bankAccountId = dto.bankAccountId ?? this.ledger.account(await this.ledger.settings(ctx), "bank");
    const rate = await this.invoices.rateFor(ctx, currency, date);
    const openIds = (await this.bills.repo.collection.where("companyId", "==", ctx.companyId).where("supplierId", "==", s.id).where("kind", "==", "bill").get()).docs
      .map((d) => d.data())
      .filter((d) => isOpen(d.status) && d.currency === currency)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number))
      .map((d) => d.id);

    return this.firestore.runTransaction(async (tx) => {
      const settings = await this.ledger.settings(ctx, tx);
      const base = settings?.baseCurrency ?? "LKR";
      const wanted = dto.allocations?.map((a) => ({ billId: a.billId, amount: toMinor(a.amount, currency) }));
      const ids = wanted ? [...new Set(wanted.map((a) => a.billId))] : openIds;
      const bills = new Map((await this.bills.repo.getMany(ctx, ids, tx)).map((b) => [b.id, b]));
      const allocations: { billId: string; amount: number }[] = [];
      let left = amount;
      if (wanted) {
        for (const a of wanted) {
          const b = bills.get(a.billId);
          if (!b || b.supplierId !== s.id || b.kind !== "bill" || !isOpen(b.status)) throw new BadRequestException("Allocate only to this supplier's open bills");
          if (b.currency !== currency) throw new BadRequestException(`${b.number} is in ${b.currency}`);
          if (a.amount <= 0 || a.amount > b.balanceDue) throw new BadRequestException(`At most ${fromMinor(b.balanceDue, currency)} is due on ${b.number}`);
          left -= a.amount;
          allocations.push(a);
        }
        if (left < 0) throw new BadRequestException("Allocations exceed the amount paid");
      } else {
        for (const id of ids) {
          const b = bills.get(id);
          if (!b || left <= 0 || !isOpen(b.status)) continue;
          const take = Math.min(left, b.balanceDue);
          allocations.push({ billId: id, amount: take });
          left -= take;
        }
      }

      const bankBase = toBase(amount, rate, currency, base);
      const party = { partyType: "supplier" as const, partyId: s.id };
      const lines: LineInput[] = [{ accountId: bankAccountId, credit: bankBase, description: `Payment to ${s.name}` }];
      let debitedBase = 0;
      for (const a of allocations) {
        const b = bills.get(a.billId)!;
        const amt = toBase(a.amount, b.rate, currency, base);
        debitedBase += amt;
        lines.push({ accountId: this.ledger.account(settings, "payable"), debit: amt, description: b.number, ...party });
      }
      if (left > 0) {
        const amt = toBase(left, rate, currency, base);
        debitedBase += amt;
        lines.push({ accountId: this.ledger.account(settings, "payable"), debit: amt, description: "Advance", ...party });
      }
      // Paying less in base than the bills carried is a gain (credit), more is a loss.
      if (bankBase !== debitedBase) lines.push({ accountId: this.ledger.account(settings, "fx"), debit: bankBase - debitedBase, description: "Exchange difference" });

      const number = await this.reserveNumber(tx, ctx);
      const id = this.repo.newId();
      const plan = await this.ledger.prepare(tx, ctx, { date, lines, source: "system", memo: `Payment ${number.number} to ${s.name}`, reference: { entityType: this.entityType, entityId: id, label: number.number } }, { withNumber: true });

      number.commit();
      const journal = plan.commitNew();
      const doc = this.repo.build(ctx, {
        id, number: number.number, supplierId: s.id, date, currency, rate, amount, bankAccountId, method: dto.method ?? "bank_transfer", reference: dto.reference ?? null,
        allocations, unallocated: left, runId: dto.runId ?? null, status: "posted", journalId: journal.id, notes: dto.notes ?? null,
      } as NewDoc<PaymentDoc>);
      tx.create(this.repo.ref(id), doc);
      for (const a of allocations) {
        const b = bills.get(a.billId)!;
        this.bills.repo.applyUpdate(ctx, tx, b, settle(b, a.amount, { applications: [...b.applications, { documentId: id, amount: a.amount, date }] }));
      }
      this.audit.record(ctx, { module: "finance", action: "created", entity: this.entityType, entityId: id, after: doc }, tx);
      this.events.publish(tx, ctx, "SupplierPaymentMade", { entity: this.entityType, entityId: id }, { paymentId: id, supplierId: s.id, amount, currency, allocations });
      return doc;
    });
  }

  /** Pays the chosen bills in full: one payment per supplier and currency, sharing a run id. */
  async run(ctx: RequestContext, dto: PaymentRunDto): Promise<{ runId: string; payments: PaymentDoc[] }> {
    const bills = await this.bills.repo.getMany(ctx, [...new Set(dto.billIds)]);
    if (bills.length !== new Set(dto.billIds).size) throw new BadRequestException("Bill not found");
    const groups = new Map<string, BillDoc[]>();
    for (const b of bills) {
      if (b.kind !== "bill" || !isOpen(b.status)) throw new BadRequestException(`${b.number} is not open`);
      const key = `${b.supplierId}|${b.currency}`;
      groups.set(key, [...(groups.get(key) ?? []), b]);
    }
    const runId = randomUUID().slice(0, 12);
    const payments: PaymentDoc[] = [];
    for (const group of groups.values()) {
      const currency = group[0]!.currency;
      const total = group.reduce((a, b) => a + b.balanceDue, 0);
      payments.push(await this.create(ctx, {
        supplierId: group[0]!.supplierId, currency, date: dto.date, amount: fromMinor(total, currency), bankAccountId: dto.bankAccountId, method: dto.method, runId,
        allocations: group.map((b) => ({ billId: b.id, amount: fromMinor(b.balanceDue, currency) })),
      }));
    }
    return { runId, payments };
  }

  protected toPatch(dto: UpdatePaymentDto): Patch<PaymentDoc> {
    return { ...dto } as Patch<PaymentDoc>;
  }

  protected searchEntry(doc: PaymentDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: `${fromMinor(doc.amount, doc.currency)} ${doc.currency}`, keywords: [doc.reference] };
  }
}

// ─── Payables reports ─────────────────────────────────────────────────────────

const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;

@Injectable()
export class PayablesService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly bills: BillService,
    private readonly payments: PaymentService,
  ) {}

  /** What is owed by supplier in overdue buckets (base currency), plus bills due by a date for payment runs. */
  async ageing(ctx: RequestContext, asOf = today()) {
    const open = (await this.bills.repo.collection.where("companyId", "==", ctx.companyId).where("status", "in", [...OPEN]).get()).docs.map((d) => d.data()).filter((d) => !d.archivedAt);
    const advances = (await this.payments.repo.collection.where("companyId", "==", ctx.companyId).where("status", "==", "posted").get()).docs.map((d) => d.data()).filter((p) => p.unallocated > 0);
    const rows = new Map<string, { supplierId: string; buckets: Record<(typeof BUCKETS)[number], number>; credits: number; total: number }>();
    const row = (id: string) => rows.get(id) ?? rows.set(id, { supplierId: id, buckets: { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 }, credits: 0, total: 0 }).get(id)!;
    for (const d of open) {
      const amount = d.totals.total ? Math.round((d.balanceDue * d.baseTotal) / d.totals.total) : 0;
      const r = row(d.supplierId);
      if (d.kind === "debit_note") {
        r.credits += amount;
        r.total -= amount;
        continue;
      }
      const late = Math.floor((Date.parse(asOf) - Date.parse(d.dueDate)) / 86_400_000);
      r.buckets[late <= 0 ? "current" : late <= 30 ? "1-30" : late <= 60 ? "31-60" : late <= 90 ? "61-90" : "90+"] += amount;
      r.total += amount;
    }
    for (const p of advances) {
      const r = row(p.supplierId);
      r.credits += p.unallocated;
      r.total -= p.unallocated;
    }
    const lines = [...rows.values()].sort((a, b) => b.total - a.total);
    const totals = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as Record<(typeof BUCKETS)[number], number>;
    for (const l of lines) for (const b of BUCKETS) totals[b] += l.buckets[b];
    return { asOf, buckets: BUCKETS, lines, totals, total: lines.reduce((a, l) => a + l.total, 0) };
  }

  /** Open bills due on or before a date, oldest first: the candidates for a payment run. */
  async due(ctx: RequestContext, by = today()) {
    const open = (await this.bills.repo.collection.where("companyId", "==", ctx.companyId).where("status", "in", [...OPEN]).get()).docs.map((d) => d.data());
    return open.filter((b) => b.kind === "bill" && b.dueDate <= by).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  async statement(ctx: RequestContext, supplierId: string) {
    const s = await supplier(this.firestore, ctx, supplierId);
    const docs = (await this.bills.repo.collection.where("companyId", "==", ctx.companyId).where("supplierId", "==", supplierId).get()).docs.map((d) => d.data())
      .filter((d) => !["draft", "cancelled"].includes(d.status));
    const pays = (await this.payments.repo.collection.where("companyId", "==", ctx.companyId).where("supplierId", "==", supplierId).get()).docs.map((d) => d.data()).filter((p) => p.status === "posted");
    const rows = [
      ...docs.map((d) => ({ date: d.date, type: d.kind, documentId: d.id, number: d.number, reference: d.supplierInvoiceNo, currency: d.currency, credit: d.kind === "bill" ? d.totals.total : 0, debit: d.kind === "debit_note" ? d.totals.total : 0 })),
      ...pays.map((p) => ({ date: p.date, type: "payment", documentId: p.id, number: p.number, reference: p.reference, currency: p.currency, credit: 0, debit: p.amount })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
    let balance = 0;
    const lines = rows.map((r) => {
      balance += r.credit - r.debit;
      return { ...r, balance };
    });
    return { supplier: { id: s.id, name: s.name, code: s.code, currency: s.currency }, lines, balance };
  }
}
