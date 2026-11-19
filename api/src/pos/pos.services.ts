import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, Scope } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { toMinor, toQty } from "../platform/data/money.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { PRODUCT_COLLECTIONS, ProductDoc } from "../products/products.models.js";
import { InventoryLedger } from "../inventory/inventory.ledger.js";
import { computeLine, SalesSettingsService, taxRateOn, totalsOf } from "../sales/sales.services.js";
import { SalesLine } from "../sales/sales.models.js";
import { GeneralLedger } from "../finance/ledger.service.js";
import { CloseShiftDto, CreatePosSaleDto, CreateTerminalDto, OpenShiftDto, PosSaleLineDto, RefundSaleDto, UpdateTerminalDto } from "./pos.dto.js";
import { CashierShiftDoc, LoyaltyAccountDoc, PosPayment, PosSaleDoc, POS_COLLECTIONS, POS_LISTS, TerminalDoc } from "./pos.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const pct = (v: string | undefined) => Math.round(Number(v ?? "0") * 100);
/** 1 point per 100 major currency units of value — a hard-coded starter rate, not configurable yet. */
const POINTS_RATE_MINOR = 10_000;

@Injectable()
export class TerminalService extends MasterDataService<TerminalDoc, CreateTerminalDto, UpdateTerminalDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "pos", entity: "terminal", label: "Terminal", collection: POS_COLLECTIONS.terminals, route: "/pos/terminals",
      uniqueFields: ["code"], filterFields: ["warehouseId", "isActive"], customFields: false,
    });
  }

  protected toNew(dto: CreateTerminalDto): NewDoc<TerminalDoc> {
    return { code: dto.code, name: dto.name, warehouseId: dto.warehouseId, branchId: orNull(dto.branchId), isActive: true };
  }

  protected searchEntry(doc: TerminalDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code };
  }
}

@Injectable()
export class CashierShiftService extends MasterDataService<CashierShiftDoc, OpenShiftDto, Record<string, never>> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "pos", entity: "cashierShift", label: "Cashier shift", collection: POS_COLLECTIONS.shifts, route: "/pos/shifts",
      filterFields: ["terminalId", "cashierId", "status"], customFields: false,
    });
  }

  /** Opens a new shift; one terminal can have at most one open shift at a time. */
  async create(ctx: RequestContext, dto: OpenShiftDto): Promise<CashierShiftDoc> {
    const open = await this.loadAll(ctx);
    if (open.some((s) => s.terminalId === dto.terminalId && s.status === "open")) throw new BadRequestException("This terminal already has an open shift");
    return super.create(ctx, dto);
  }

  protected toNew(dto: OpenShiftDto, ctx: RequestContext): NewDoc<CashierShiftDoc> {
    return {
      terminalId: dto.terminalId, cashierId: ctx.userId, status: "open", openedAt: new Date().toISOString(), openingCash: toMinor(dto.openingCash, "LKR"),
      closedAt: null, closingCash: null, expectedCash: null, variance: null, notes: null,
    };
  }

  /**
   * Closes a shift, reconciling counted cash against the opening float plus
   * this shift's cash sales. Voided sales (same-shift, immediate corrections)
   * are excluded, but a refund's cash paid back out is **not** automatically
   * subtracted — there is no per-payment-method breakdown of a refund kept
   * on the original sale to derive it from, so a cash refund mid-shift is a
   * manual reconciliation item for the cashier, documented here rather than
   * silently wrong.
   */
  async close(ctx: RequestContext, id: string, dto: CloseShiftDto, sales: PosSaleDoc[]): Promise<CashierShiftDoc> {
    const shift = await this.repo.get(ctx, id);
    if (shift.status !== "open") throw new BadRequestException("This shift is already closed");
    const netCash = sales
      .filter((s) => s.status !== "voided")
      .reduce((a, s) => a + s.payments.filter((p) => p.method === "cash").reduce((b, p) => b + p.amount, 0), 0);
    const expectedCash = shift.openingCash + netCash;
    const closingCash = toMinor(dto.closingCash, "LKR");
    return (
      await this.repo.update(ctx, id, {
        status: "closed", closedAt: new Date().toISOString(), closingCash, expectedCash, variance: closingCash - expectedCash, notes: orNull(dto.notes),
      } as Patch<CashierShiftDoc>)
    ).after;
  }

  protected searchEntry(doc: CashierShiftDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `Shift ${doc.id}`, subtitle: doc.status };
  }
}

@Injectable()
export class LoyaltyService {
  constructor(private readonly firestore: FirestoreService) {}

  private ref(accountId: string) {
    return this.firestore.collection<LoyaltyAccountDoc>(POS_COLLECTIONS.loyalty).doc(accountId);
  }

  private blank(scope: Scope, accountId: string): LoyaltyAccountDoc {
    return { id: accountId, tenantId: scope.tenantId, companyId: scope.companyId, accountId, pointsBalance: 0, updatedAt: new Date(0).toISOString() };
  }

  async get(ctx: RequestContext, accountId: string): Promise<LoyaltyAccountDoc> {
    return (await this.ref(accountId).get()).data() ?? this.blank(ctx, accountId);
  }

  /** Reads the balance within a transaction, creating a blank one on demand; must be called before any write in that transaction. */
  async getForWrite(ctx: RequestContext, tx: Transaction, accountId: string): Promise<LoyaltyAccountDoc> {
    return (await tx.get(this.ref(accountId))).data() ?? this.blank(ctx, accountId);
  }

  apply(tx: Transaction, balance: LoyaltyAccountDoc, pointsDelta: number): void {
    tx.set(this.ref(balance.accountId), { ...balance, pointsBalance: balance.pointsBalance + pointsDelta, updatedAt: new Date().toISOString() });
  }
}

@Injectable()
export class PosSaleService extends MasterDataService<PosSaleDoc, CreatePosSaleDto, Record<string, never>> {
  constructor(
    fs: FirestoreService, audit: AuditService, unique: UniqueService,
    private readonly shifts: CashierShiftService,
    private readonly terminals: TerminalService,
    private readonly salesSettings: SalesSettingsService,
    private readonly inventoryLedger: InventoryLedger,
    private readonly generalLedger: GeneralLedger,
    private readonly loyalty: LoyaltyService,
  ) {
    super(fs, audit, unique, {
      module: "pos", entity: "sale", label: "Sale", collection: POS_COLLECTIONS.sales, route: "/pos/sales",
      large: POS_LISTS.sales, filterFields: ["status", "shiftId", "terminalId", "accountId"],
      numbering: { field: "number", key: "posSale", prefix: "POS", yearly: true }, customFields: false,
    });
  }

  private async priceLines(ctx: RequestContext, tx: Transaction, inputs: PosSaleLineDto[], currency: string, date: string): Promise<SalesLine[]> {
    const settings = await this.salesSettings.get(ctx);
    const ids = [...new Set(inputs.map((l) => l.productId))];
    const snaps = await tx.getAll(...ids.map((id) => this.firestore.collection(PRODUCT_COLLECTIONS.products).doc(id)));
    const products = new Map<string, ProductDoc>();
    for (const snap of snaps) {
      const p = snap.data() as ProductDoc | undefined;
      if (p && p.companyId === ctx.companyId) products.set(snap.id, p);
    }
    return inputs.map((input) => {
      const product = products.get(input.productId);
      if (!product) throw new BadRequestException("Product not found");
      if (!product.isSellable || product.status !== "active") throw new BadRequestException(`${product.sku} cannot be sold`);
      const qty = toQty(input.qty);
      if (qty <= 0) throw new BadRequestException("Quantities must be positive");
      const taxCode = input.taxCode ?? product.taxCategory ?? settings.defaultTaxCode;
      const tax = taxCode ? settings.taxRates.find((t) => t.code === taxCode) : undefined;
      const taxRate = tax ? taxRateOn(tax, date) : 0;
      const unitPrice = input.unitPrice !== undefined ? toMinor(input.unitPrice, currency) : product.salesPrice;
      return computeLine({ lineId: randomUUID().slice(0, 8), productId: product.id, description: product.name, qty, unitPrice, discountPct: pct(input.discountPct), taxCode: tax?.code ?? null, taxRate });
    });
  }

  /**
   * One register sale: prices the cart, issues stock immediately (type
   * `"sale"`, which posts inventory/COGS automatically through
   * `AutoPostingService`'s `StockMoved` subscriber) and posts revenue/tax
   * against the tender in the same transaction. See `CLAUDE.md` §9's POS
   * note for the loyalty-as-a-revenue-reduction bookkeeping and the other
   * documented scope cuts.
   */
  async create(ctx: RequestContext, dto: CreatePosSaleDto): Promise<PosSaleDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const shift = await this.shifts.repo.get(ctx, dto.shiftId, tx);
      if (shift.status !== "open") throw new BadRequestException("This shift is not open");
      const terminal = await this.terminals.repo.get(ctx, shift.terminalId, tx);
      const glSettings = await this.generalLedger.settings(ctx, tx);
      const currency = glSettings?.baseCurrency ?? "LKR";
      const date = new Date().toISOString().slice(0, 10);

      const lines = await this.priceLines(ctx, tx, dto.lines, currency, date);
      const totals = totalsOf(lines);
      const net = totals.total - totals.tax;

      const redeemPoints = dto.redeemPoints ?? 0;
      if (redeemPoints > 0 && !dto.accountId) throw new BadRequestException("Redeeming points needs a customer");
      const loyaltyBalance = dto.accountId ? await this.loyalty.getForWrite(ctx, tx, dto.accountId) : null;
      if (loyaltyBalance && redeemPoints > loyaltyBalance.pointsBalance) throw new BadRequestException("Not enough loyalty points");
      const redeemValue = redeemPoints; // 1 point = 1 minor unit
      const amountDue = totals.total - redeemValue;
      const payments: PosPayment[] = dto.payments.map((p) => ({ method: p.method, amount: toMinor(p.amount, currency) }));
      const paid = payments.reduce((a, p) => a + p.amount, 0);
      if (paid !== amountDue) throw new BadRequestException(`Payments total ${paid} but ${amountDue} is due`);

      const reserved = await this.reserveNumber(tx, ctx);
      const id = this.repo.newId();
      const earnedPoints = Math.floor(amountDue / POINTS_RATE_MINOR);

      const invPlan = await this.inventoryLedger.prepare(
        tx, ctx,
        lines.map((l) => ({ type: "sale" as const, productId: l.productId, warehouseId: terminal.warehouseId, qty: -l.qty, reference: { entityType: this.entityType, entityId: id, label: reserved.number } })),
      );
      const glPrepared = await this.generalLedger.prepare(tx, ctx, {
        date, source: "system", reference: { entityType: this.entityType, entityId: id, label: reserved.number }, memo: `POS sale ${reserved.number}`,
        lines: [
          ...payments.map((p) => ({ accountId: this.generalLedger.account(glSettings, p.method === "cash" ? "cash" : "bank"), debit: p.amount, description: `${p.method} tender` })),
          ...(redeemValue > 0 ? [{ accountId: this.generalLedger.account(glSettings, "revenue"), debit: redeemValue, description: "Loyalty points redeemed" }] : []),
          { accountId: this.generalLedger.account(glSettings, "revenue"), credit: net, description: "Sales revenue" },
          ...(totals.tax ? [{ accountId: this.generalLedger.account(glSettings, "taxOutput"), credit: totals.tax, description: "Sales tax" }] : []),
        ],
      }, { withNumber: true });

      reserved.commit();
      const doc = this.repo.build(ctx, {
        id, number: reserved.number, shiftId: dto.shiftId, terminalId: terminal.id, warehouseId: terminal.warehouseId, accountId: orNull(dto.accountId),
        currency, lines, totals, payments, status: "completed", loyaltyPointsEarned: dto.accountId ? earnedPoints : 0,
        loyaltyPointsRedeemed: redeemPoints, notes: orNull(dto.notes),
      } as NewDoc<PosSaleDoc> & { id: string });
      tx.create(this.repo.ref(id), doc);
      invPlan.commit();
      glPrepared.commitNew();
      if (loyaltyBalance && dto.accountId) this.loyalty.apply(tx, loyaltyBalance, earnedPoints - redeemPoints);
      this.indexInTx(tx, ctx, doc);
      this.audit.record(ctx, { module: "pos", action: "created", entity: this.entityType, entityId: id, after: { number: doc.number, total: totals.total } }, tx);
      return doc;
    });
  }

  /**
   * Reverses a whole sale or a caller-chosen subset of its lines: stock goes
   * back in (`customer_return`), revenue/tax are reversed to `salesReturns`,
   * and cash/bank is credited back. A sale can only be refunded once in this
   * pass — there is no running per-line refunded-quantity ledger, so a
   * second partial refund on the same sale is not supported; refund the
   * whole sale, or treat a further return as a manual follow-up.
   */
  async refund(ctx: RequestContext, id: string, dto: RefundSaleDto): Promise<PosSaleDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const sale = await this.repo.get(ctx, id, tx);
      if (sale.status !== "completed") throw new BadRequestException(`A ${sale.status} sale cannot be refunded`);
      const glSettings = await this.generalLedger.settings(ctx, tx);
      const refundLines = dto.lines.map((rl) => {
        const original = sale.lines.find((l) => l.lineId === rl.lineId);
        if (!original) throw new BadRequestException(`No line ${rl.lineId} on this sale`);
        const qty = toQty(rl.qty);
        if (qty <= 0 || qty > original.qty) throw new BadRequestException(`Cannot refund more than was sold for ${original.description}`);
        return computeLine({ ...original, qty });
      });
      const refundTotals = totalsOf(refundLines);
      const refundNet = refundTotals.total - refundTotals.tax;
      const fullyRefunded = refundLines.every((rl) => sale.lines.find((l) => l.lineId === rl.lineId)!.qty === rl.qty) && refundLines.length === sale.lines.length;

      const invPlan = await this.inventoryLedger.prepare(
        tx, ctx,
        refundLines.map((l) => ({ type: "customer_return" as const, productId: l.productId, warehouseId: sale.warehouseId, qty: l.qty, reference: { entityType: this.entityType, entityId: id, label: `${sale.number} refund` }, reason: dto.reason ?? null })),
      );
      const glPrepared = await this.generalLedger.prepare(tx, ctx, {
        date: new Date().toISOString().slice(0, 10), source: "system", reference: { entityType: this.entityType, entityId: id, label: `${sale.number} refund` }, memo: `Refund of ${sale.number}`,
        lines: [
          { accountId: this.generalLedger.account(glSettings, "salesReturns"), debit: refundNet, description: "Sales return" },
          ...(refundTotals.tax ? [{ accountId: this.generalLedger.account(glSettings, "taxOutput"), debit: refundTotals.tax, description: "Sales tax reversed" }] : []),
          { accountId: this.generalLedger.account(glSettings, dto.method === "cash" ? "cash" : "bank"), credit: refundTotals.total, description: `${dto.method} refund` },
        ],
      }, { withNumber: true });

      invPlan.commit();
      glPrepared.commitNew();
      const { after } = this.repo.applyUpdate(ctx, tx, sale, { status: fullyRefunded ? "refunded" : "partially_refunded" } as Patch<PosSaleDoc>);
      return after;
    });
  }

  /** Fully reverses a sale within its own still-open shift — stock, revenue and loyalty points all undone, as if it never happened. */
  async void(ctx: RequestContext, id: string): Promise<PosSaleDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const sale = await this.repo.get(ctx, id, tx);
      if (sale.status !== "completed") throw new BadRequestException(`A ${sale.status} sale cannot be voided`);
      const shift = await this.shifts.repo.get(ctx, sale.shiftId, tx);
      if (shift.status !== "open") throw new BadRequestException("Only a sale in the current open shift can be voided");
      const glSettings = await this.generalLedger.settings(ctx, tx);
      const totals = sale.totals;
      const net = totals.total - totals.tax;

      const invPlan = await this.inventoryLedger.prepare(
        tx, ctx,
        sale.lines.map((l) => ({ type: "customer_return" as const, productId: l.productId, warehouseId: sale.warehouseId, qty: l.qty, reference: { entityType: this.entityType, entityId: id, label: `${sale.number} void` } })),
      );
      const glPrepared = await this.generalLedger.prepare(tx, ctx, {
        date: new Date().toISOString().slice(0, 10), source: "system", reference: { entityType: this.entityType, entityId: id, label: `${sale.number} void` }, memo: `Void of ${sale.number}`,
        lines: [
          { accountId: this.generalLedger.account(glSettings, "salesReturns"), debit: net, description: "Sale voided" },
          ...(totals.tax ? [{ accountId: this.generalLedger.account(glSettings, "taxOutput"), debit: totals.tax, description: "Sales tax reversed" }] : []),
          ...sale.payments.map((p) => ({ accountId: this.generalLedger.account(glSettings, p.method === "cash" ? "cash" : "bank"), credit: p.amount, description: `${p.method} refunded` })),
          ...(sale.loyaltyPointsRedeemed > 0 ? [{ accountId: this.generalLedger.account(glSettings, "revenue"), credit: sale.loyaltyPointsRedeemed, description: "Loyalty points restored" }] : []),
        ],
      }, { withNumber: true });

      invPlan.commit();
      glPrepared.commitNew();
      if (sale.accountId) {
        const balance = await this.loyalty.getForWrite(ctx, tx, sale.accountId);
        this.loyalty.apply(tx, balance, sale.loyaltyPointsRedeemed - sale.loyaltyPointsEarned);
      }
      const { after } = this.repo.applyUpdate(ctx, tx, sale, { status: "voided" } as Patch<PosSaleDoc>);
      return after;
    });
  }

  protected searchEntry(doc: PosSaleDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: doc.status };
  }
}
