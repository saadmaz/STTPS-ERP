import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, systemContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { extend, toMinor, toQty } from "../platform/data/money.js";
import { NewDoc, Page, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { ApprovalsService } from "../platform/approvals/approvals.service.js";
import { APPROVAL_COMPLETED, ApprovalCompletedPayload } from "../platform/approvals/approvals.models.js";
import { NotificationsService } from "../platform/notifications/notifications.service.js";
import { PRODUCT_COLLECTIONS, ProductDoc } from "../products/products.models.js";
import { InventoryLedger, MovementInput } from "./inventory.ledger.js";
import {
  AdjustmentDoc,
  CostLayerDoc,
  CountDoc,
  DocLine,
  INVENTORY_COLLECTIONS,
  INVENTORY_LISTS,
  InventorySettingsDoc,
  LocationDoc,
  StockBalanceDoc,
  StockMovementDoc,
  StockSummaryDoc,
  summaryId,
  TransferDoc,
  WarehouseDoc,
} from "./inventory.models.js";
import {
  CreateAdjustmentDto,
  CreateLocationDto,
  CreateTransferDto,
  CreateWarehouseDto,
  InventorySettingsDto,
  LineDto,
  RecordCountDto,
  ReorderDto,
  StartCountDto,
  UpdateAdjustmentDto,
  UpdateLocationDto,
  UpdateTransferDto,
  UpdateWarehouseDto,
} from "./inventory.dto.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);

export function toLines(lines: LineDto[], signed: boolean): DocLine[] {
  return lines.map((l) => {
    const qty = toQty(l.qty);
    if (qty === 0 || (!signed && qty < 0)) throw new BadRequestException("Quantities must be positive");
    return { productId: l.productId, qty, lotNo: l.lotNo?.trim() || null, expiryDate: l.expiryDate?.slice(0, 10) ?? null, serialNos: l.serialNos ?? [], unitCost: l.unitCost ? toMinor(l.unitCost, "LKR") : null };
  });
}

@Injectable()
export class WarehouseService extends MasterDataService<WarehouseDoc, CreateWarehouseDto, UpdateWarehouseDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "inventory",
      entity: "warehouse",
      label: "Warehouse",
      collection: INVENTORY_COLLECTIONS.warehouses,
      route: "/inventory/warehouses",
      uniqueFields: ["code"],
      references: [{ field: "branchId", collection: "orgBranches", label: "Branch" }],
      filterFields: ["type", "isActive", "branchId"],
    });
  }

  protected toNew(dto: CreateWarehouseDto): NewDoc<WarehouseDoc> {
    return { code: dto.code, name: dto.name, type: dto.type ?? "main", branchId: orNull(dto.branchId), allowNegative: dto.allowNegative ?? null, isActive: dto.isActive ?? true };
  }
}

@Injectable()
export class LocationService extends MasterDataService<LocationDoc, CreateLocationDto, UpdateLocationDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "inventory",
      entity: "location",
      label: "Bin location",
      collection: INVENTORY_COLLECTIONS.locations,
      permission: "inventory.warehouse",
      route: "/inventory/locations",
      references: [{ field: "warehouseId", collection: INVENTORY_COLLECTIONS.warehouses, label: "Warehouse" }],
      filterFields: ["warehouseId", "zone", "isActive"],
      customFields: false,
    });
  }

  protected toNew(dto: CreateLocationDto): NewDoc<LocationDoc> {
    return { warehouseId: dto.warehouseId, code: dto.code, zone: orNull(dto.zone), isActive: dto.isActive ?? true };
  }

  protected async validate(tx: Transaction, ctx: RequestContext, next: LocationDoc): Promise<void> {
    const clash = (await this.loadAll(ctx, tx)).find((l) => l.id !== next.id && l.warehouseId === next.warehouseId && l.code.toLowerCase() === next.code.toLowerCase());
    if (clash) throw new BadRequestException(`Location ${next.code} already exists in this warehouse`);
  }
}

@Injectable()
export class InventorySettingsService {
  constructor(private readonly firestore: FirestoreService, private readonly ledger: InventoryLedger) {}

  get(ctx: RequestContext) {
    return this.ledger.settings(ctx);
  }

  async update(ctx: RequestContext, dto: InventorySettingsDto): Promise<InventorySettingsDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const current = await this.ledger.settings(ctx, tx);
      const next = { ...current, allowNegative: dto.allowNegative ?? current.allowNegative, adjustmentReasons: dto.adjustmentReasons ?? current.adjustmentReasons, updatedAt: new Date().toISOString() };
      tx.set(this.firestore.collection(INVENTORY_COLLECTIONS.settings).doc(ctx.companyId), next);
      return next;
    });
  }
}

// ─── Adjustments ────────────────────────────────────────────────────────────

@Injectable()
export class AdjustmentService extends MasterDataService<AdjustmentDoc, CreateAdjustmentDto, UpdateAdjustmentDto> implements OnModuleInit {
  private readonly logger = new Logger("Adjustments");

  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly ledger: InventoryLedger,
    private readonly approvals: ApprovalsService,
    private readonly events: EventBusService,
    private readonly notifications: NotificationsService,
  ) {
    super(fs, audit, unique, {
      module: "inventory",
      entity: "adjustment",
      label: "Stock adjustment",
      collection: INVENTORY_COLLECTIONS.adjustments,
      route: "/inventory/adjustments",
      references: [{ field: "warehouseId", collection: INVENTORY_COLLECTIONS.warehouses, label: "Warehouse" }],
      filterFields: ["status", "warehouseId", "reason"],
      large: INVENTORY_LISTS.adjustments,
      numbering: { field: "number", key: "adjustment", prefix: "ADJ", yearly: true },
      customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "inventory.adjustmentApproval", async (event) => {
      if (event.payload.entityType !== this.entityType) return;
      const ctx = systemContext(event, event.payload.decidedBy);
      if (event.payload.outcome === "approved") {
        try {
          await this.post(ctx, event.payload.entityId);
        } catch (error) {
          if (!(error instanceof BadRequestException)) throw error;
          // Stock changed while waiting: back to draft so the requester can fix it.
          const doc = await this.repo.find(ctx, event.payload.entityId);
          if (doc) {
            await this.repo.update(ctx, doc.id, { status: "draft" });
            this.notifications.notify({
              tenantId: ctx.tenantId, companyId: ctx.companyId, userIds: [doc.createdBy ?? ""], category: "inventory.adjustment",
              title: `${doc.number} was approved but could not be posted`, body: error.message, link: `/inventory/adjustments/${doc.id}`, priority: "high",
            });
          }
          this.logger.warn(`Approved adjustment ${event.payload.entityId} could not post: ${error.message}`);
        }
      } else {
        const doc = await this.repo.find(ctx, event.payload.entityId);
        if (doc?.status === "pending_approval") await this.repo.update(ctx, doc.id, { status: event.payload.outcome === "rejected" ? "rejected" : "draft" });
      }
    });
  }

  protected toNew(dto: CreateAdjustmentDto): NewDoc<AdjustmentDoc> {
    return { number: "", warehouseId: dto.warehouseId, reason: dto.reason, note: orNull(dto.note), date: dto.date?.slice(0, 10) ?? today(), lines: toLines(dto.lines, true), status: "draft", estimatedValue: 0, postedAt: null };
  }

  protected toPatch(dto: UpdateAdjustmentDto, before: AdjustmentDoc): Patch<AdjustmentDoc> {
    if (before.status !== "draft" && before.status !== "rejected") throw new BadRequestException(`A ${before.status.replace("_", " ")} adjustment cannot be changed`);
    const { lines, date, ...rest } = dto;
    return { ...rest, ...(lines ? { lines: toLines(lines, true) } : {}), ...(date ? { date: date.slice(0, 10) } : {}), status: "draft" } as Patch<AdjustmentDoc>;
  }

  protected async validate(tx: Transaction, ctx: RequestContext, next: AdjustmentDoc): Promise<void> {
    const settings = await this.ledger.settings(ctx, tx);
    if (!settings.adjustmentReasons.includes(next.reason)) throw new BadRequestException(`Reason must be one of: ${settings.adjustmentReasons.join(", ")}`);
  }

  private inputs(doc: AdjustmentDoc): MovementInput[] {
    return doc.lines.map((l) => ({
      type: "adjustment", productId: l.productId, warehouseId: doc.warehouseId, lotNo: l.lotNo, expiryDate: l.expiryDate, serialNos: l.serialNos, qty: l.qty, unitCost: l.unitCost,
      reference: { entityType: this.entityType, entityId: doc.id, label: doc.number }, reason: doc.reason, date: doc.date,
    }));
  }

  /** Submits for approval (when a workflow applies) or posts straight away. */
  async submit(ctx: RequestContext, id: string): Promise<AdjustmentDoc> {
    const draft = await this.repo.get(ctx, id);
    if (draft.status !== "draft" && draft.status !== "rejected") throw new BadRequestException(`This adjustment is ${draft.status.replace("_", " ")}`);
    const summaries = await this.firestore.db.getAll(...[...new Set(draft.lines.map((l) => l.productId))].map((p) => this.firestore.collection(INVENTORY_COLLECTIONS.summaries).doc(summaryId(ctx.companyId, p))));
    const avg = new Map(summaries.map((s) => [(s.data() as StockSummaryDoc | undefined)?.productId, (s.data() as StockSummaryDoc | undefined)?.avgCost ?? 0]));
    const estimatedValue = draft.lines.reduce((a, l) => a + extend(Math.abs(l.qty), l.unitCost ?? avg.get(l.productId) ?? 0), 0);
    const prepared = await this.approvals.prepare(ctx, {
      entityType: this.entityType,
      entityId: id,
      entityLabel: `${draft.number} · ${draft.reason}`,
      link: `/inventory/adjustments/${id}`,
      facts: { estimatedValue, reason: draft.reason, warehouseId: draft.warehouseId, amount: estimatedValue },
    });
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const plan = await this.ledger.prepare(tx, ctx, this.inputs(before));
      const request = await this.approvals.open(tx, ctx, prepared);
      if (request.status === "approved") {
        const movements = plan.commit();
        this.ledger.auditPosting(tx, ctx, this.entityType, id, movements);
        return this.repo.applyUpdate(ctx, tx, before, { status: "posted", postedAt: new Date().toISOString(), estimatedValue }).after;
      }
      return this.repo.applyUpdate(ctx, tx, before, { status: "pending_approval", estimatedValue }).after;
    });
  }

  async post(ctx: RequestContext, id: string): Promise<AdjustmentDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status === "posted") return before;
      const plan = await this.ledger.prepare(tx, ctx, this.inputs(before));
      const movements = plan.commit();
      this.ledger.auditPosting(tx, ctx, this.entityType, id, movements);
      return this.repo.applyUpdate(ctx, tx, before, { status: "posted", postedAt: new Date().toISOString() }).after;
    });
  }

  async cancel(ctx: RequestContext, id: string): Promise<AdjustmentDoc> {
    const doc = await this.repo.get(ctx, id);
    if (doc.status === "posted") throw new BadRequestException("Posted adjustments cannot be cancelled; post a reversing adjustment");
    if (doc.status === "pending_approval") throw new BadRequestException("Withdraw the approval request first");
    return (await this.repo.update(ctx, id, { status: "cancelled" })).after;
  }
}

// ─── Transfers ──────────────────────────────────────────────────────────────

@Injectable()
export class TransferService extends MasterDataService<TransferDoc, CreateTransferDto, UpdateTransferDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly ledger: InventoryLedger) {
    super(fs, audit, unique, {
      module: "inventory",
      entity: "transfer",
      label: "Stock transfer",
      collection: INVENTORY_COLLECTIONS.transfers,
      route: "/inventory/transfers",
      references: [
        { field: "fromWarehouseId", collection: INVENTORY_COLLECTIONS.warehouses, label: "Source warehouse" },
        { field: "toWarehouseId", collection: INVENTORY_COLLECTIONS.warehouses, label: "Destination warehouse" },
      ],
      filterFields: ["status", "fromWarehouseId", "toWarehouseId"],
      large: INVENTORY_LISTS.transfers,
      numbering: { field: "number", key: "transfer", prefix: "TRF", yearly: true },
      customFields: false,
    });
  }

  protected toNew(dto: CreateTransferDto): NewDoc<TransferDoc> {
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException("Choose two different warehouses");
    return { number: "", fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, date: dto.date?.slice(0, 10) ?? today(), note: orNull(dto.note), lines: toLines(dto.lines, false), status: "draft", shippedAt: null, receivedAt: null };
  }

  protected toPatch(dto: UpdateTransferDto, before: TransferDoc): Patch<TransferDoc> {
    if (before.status !== "draft") throw new BadRequestException("Only draft transfers can be changed");
    const { lines, ...rest } = dto;
    return { ...rest, ...(lines ? { lines: toLines(lines, false) } : {}) } as Patch<TransferDoc>;
  }

  private ref(doc: TransferDoc) {
    return { entityType: this.entityType, entityId: doc.id, label: doc.number };
  }

  /** Takes the stock out of the source warehouse; it is in transit until received. */
  async ship(ctx: RequestContext, id: string): Promise<TransferDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "draft") throw new BadRequestException("Only draft transfers can be shipped");
      const plan = await this.ledger.prepare(tx, ctx, before.lines.map((l) => ({
        type: "transfer_out", productId: l.productId, warehouseId: before.fromWarehouseId, lotNo: l.lotNo, expiryDate: l.expiryDate, serialNos: l.serialNos, qty: -l.qty, reference: this.ref(before), date: before.date,
      })));
      const movements = plan.commit();
      this.ledger.auditPosting(tx, ctx, this.entityType, id, movements);
      // Keep each line's cost so the receipt values the stock the same way.
      const lines = before.lines.map((l, i) => ({ ...l, unitCost: movements[i]!.unitCost }));
      return this.repo.applyUpdate(ctx, tx, before, { status: "in_transit", shippedAt: new Date().toISOString(), lines }).after;
    });
  }

  async receive(ctx: RequestContext, id: string): Promise<TransferDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "in_transit") throw new BadRequestException("Only transfers in transit can be received");
      const plan = await this.ledger.prepare(tx, ctx, before.lines.map((l) => ({
        type: "transfer_in", productId: l.productId, warehouseId: before.toWarehouseId, lotNo: l.lotNo, expiryDate: l.expiryDate, serialNos: l.serialNos, qty: l.qty, unitCost: l.unitCost, reference: this.ref(before), date: today(),
      })));
      const movements = plan.commit();
      this.ledger.auditPosting(tx, ctx, this.entityType, id, movements);
      return this.repo.applyUpdate(ctx, tx, before, { status: "received", receivedAt: new Date().toISOString() }).after;
    });
  }

  async cancel(ctx: RequestContext, id: string): Promise<TransferDoc> {
    const doc = await this.repo.get(ctx, id);
    if (doc.status !== "draft") throw new BadRequestException("Only draft transfers can be cancelled");
    return (await this.repo.update(ctx, id, { status: "cancelled" })).after;
  }
}

// ─── Counts ─────────────────────────────────────────────────────────────────

@Injectable()
export class CountService extends MasterDataService<CountDoc, StartCountDto, Record<string, never>> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly ledger: InventoryLedger) {
    super(fs, audit, unique, {
      module: "inventory",
      entity: "count",
      label: "Stock count",
      collection: INVENTORY_COLLECTIONS.counts,
      route: "/inventory/counts",
      filterFields: ["status", "warehouseId"],
      large: INVENTORY_LISTS.counts,
      customFields: false,
      searchable: false,
    });
  }

  private settingsRef(ctx: RequestContext) {
    return this.firestore.collection<InventorySettingsDoc>(INVENTORY_COLLECTIONS.settings).doc(ctx.companyId);
  }

  /** Snapshots expected quantities and locks the warehouse until the count is posted or cancelled. */
  async start(ctx: RequestContext, dto: StartCountDto): Promise<CountDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const settings = await this.ledger.settings(ctx, tx);
      if (settings.lockedWarehouses[dto.warehouseId]) throw new BadRequestException("A count is already in progress in this warehouse");
      const warehouse = (await tx.get(this.firestore.collection<WarehouseDoc>(INVENTORY_COLLECTIONS.warehouses).doc(dto.warehouseId))).data();
      if (!warehouse || warehouse.companyId !== ctx.companyId) throw new NotFoundException("Warehouse not found");
      const balances = await tx.get(this.firestore.collection<StockBalanceDoc>(INVENTORY_COLLECTIONS.balances).where("companyId", "==", ctx.companyId).where("warehouseId", "==", dto.warehouseId));
      const only = dto.productIds?.length ? new Set(dto.productIds) : null;
      const lines = balances.docs
        .map((d) => d.data())
        .filter((b) => (!only || only.has(b.productId)) && (b.onHand !== 0 || only))
        .map((b) => ({ productId: b.productId, lotNo: b.lotNo, expected: b.onHand, counted: null }));
      for (const p of only ?? []) if (!lines.some((l) => l.productId === p)) lines.push({ productId: p, lotNo: null, expected: 0, counted: null });
      const number = await this.reserveCountNumber(tx, ctx);
      const doc = this.repo.build(ctx, { number: number.number, warehouseId: dto.warehouseId, status: "counting", lines, startedAt: new Date().toISOString(), postedAt: null, note: dto.note ?? null });
      number.commit();
      tx.create(this.repo.ref(doc.id), doc);
      tx.set(this.settingsRef(ctx), { ...settings, lockedWarehouses: { ...settings.lockedWarehouses, [dto.warehouseId]: doc.id }, updatedAt: new Date().toISOString() });
      this.audit.record(ctx, { module: "inventory", action: "count_started", entity: this.entityType, entityId: doc.id, after: { warehouseId: dto.warehouseId, lines: lines.length } }, tx);
      return doc;
    });
  }

  private reserveCountNumber(tx: Transaction, ctx: RequestContext) {
    return this.sequences.reserve(tx, ctx, "stockCount", { prefix: "CNT", yearly: true });
  }

  async record(ctx: RequestContext, id: string, dto: RecordCountDto): Promise<CountDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "counting") throw new BadRequestException("This count is closed");
      const lines = [...before.lines];
      for (const e of dto.entries) {
        const lotNo = e.lotNo?.trim() || null;
        const i = lines.findIndex((l) => l.productId === e.productId && l.lotNo === lotNo);
        if (i >= 0) lines[i] = { ...lines[i]!, counted: toQty(e.counted) };
        else lines.push({ productId: e.productId, lotNo, expected: 0, counted: toQty(e.counted) });
      }
      return this.repo.applyUpdate(ctx, tx, before, { lines }).after;
    });
  }

  /** Posts the differences between counted and expected quantities, then unlocks the warehouse. */
  async post(ctx: RequestContext, id: string): Promise<CountDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "counting") throw new BadRequestException("This count is closed");
      const settings = await this.ledger.settings(ctx, tx);
      const variances = before.lines.filter((l) => l.counted !== null && l.counted !== l.expected);
      const products = variances.length ? await tx.getAll(...variances.map((v) => this.firestore.collection(PRODUCT_COLLECTIONS.products).doc(v.productId))) : [];
      const serialTracked = products.map((p) => p.data() as ProductDoc | undefined).find((p) => p?.trackSerials);
      if (serialTracked) throw new BadRequestException(`${serialTracked.sku} tracks serial numbers: correct it with an adjustment that names the serials`);
      const plan = variances.length
        ? await this.ledger.prepare(tx, ctx, variances.map((v) => ({
            type: "count", productId: v.productId, warehouseId: before.warehouseId, lotNo: v.lotNo, qty: v.counted! - v.expected,
            reference: { entityType: this.entityType, entityId: id, label: before.number }, reason: "stock count",
          })), { countId: id })
        : null;
      const movements = plan?.commit() ?? [];
      const { [before.warehouseId]: _released, ...stillLocked } = settings.lockedWarehouses;
      tx.set(this.settingsRef(ctx), { ...settings, lockedWarehouses: stillLocked, updatedAt: new Date().toISOString() });
      this.ledger.auditPosting(tx, ctx, this.entityType, id, movements);
      return this.repo.applyUpdate(ctx, tx, before, { status: "posted", postedAt: new Date().toISOString() }).after;
    });
  }

  async cancel(ctx: RequestContext, id: string): Promise<CountDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "counting") throw new BadRequestException("This count is closed");
      const settings = await this.ledger.settings(ctx, tx);
      const { [before.warehouseId]: _released, ...stillLocked } = settings.lockedWarehouses;
      tx.set(this.settingsRef(ctx), { ...settings, lockedWarehouses: stillLocked, updatedAt: new Date().toISOString() });
      return this.repo.applyUpdate(ctx, tx, before, { status: "cancelled" }).after;
    });
  }
}

// ─── Reports ────────────────────────────────────────────────────────────────

@Injectable()
export class InventoryReports {
  constructor(private readonly firestore: FirestoreService, private readonly ledger: InventoryLedger) {}

  private col<T>(name: string) {
    return this.firestore.collection<T>(name);
  }

  /** Quantities by warehouse and lot; optionally for one product or warehouse. */
  async onHand(ctx: RequestContext, filter: { productId?: string; warehouseId?: string; includeZero?: boolean }) {
    let q = this.col<StockBalanceDoc>(INVENTORY_COLLECTIONS.balances).where("companyId", "==", ctx.companyId);
    if (filter.productId) q = q.where("productId", "==", filter.productId);
    if (filter.warehouseId) q = q.where("warehouseId", "==", filter.warehouseId);
    const rows = (await q.limit(5000).get()).docs.map((d) => d.data());
    return rows.filter((b) => filter.includeZero || b.onHand !== 0 || b.reserved !== 0).map((b) => ({ ...b, available: b.onHand - b.reserved }));
  }

  /** Every product's position and value. */
  async valuation(ctx: RequestContext) {
    const rows = (await this.col<StockSummaryDoc>(INVENTORY_COLLECTIONS.summaries).where("companyId", "==", ctx.companyId).limit(10_000).get()).docs.map((d) => d.data());
    const items = rows.filter((s) => s.onHand !== 0 || s.inTransit !== 0 || s.value !== 0).map((s) => ({ ...s, available: s.onHand - s.reserved }));
    return { items, totalValue: items.reduce((a, s) => a + s.value, 0) };
  }

  async summary(ctx: RequestContext, productId: string) {
    const s = (await this.col<StockSummaryDoc>(INVENTORY_COLLECTIONS.summaries).doc(summaryId(ctx.companyId, productId)).get()).data();
    return s ? { ...s, available: s.onHand - s.reserved } : null;
  }

  /** Products at or below their reorder point. */
  async reorder(ctx: RequestContext) {
    const rows = await this.col<StockSummaryDoc>(INVENTORY_COLLECTIONS.summaries).where("companyId", "==", ctx.companyId).where("lowStock", "==", true).get();
    return rows.docs.map((d) => d.data()).map((s) => ({ ...s, available: s.onHand - s.reserved, suggestedQty: Math.max(s.reorderQty, s.reorderPoint + s.safetyStock - (s.onHand - s.reserved)) }));
  }

  /** Lots expiring within `days` (already expired included). */
  async expiring(ctx: RequestContext, days: number) {
    const cutoff = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    return (await this.onHand(ctx, {})).filter((b) => b.expiryDate && b.expiryDate <= cutoff && b.onHand > 0).sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!));
  }

  /** Stocked products with no issue for `days`. */
  async slowMoving(ctx: RequestContext, days: number) {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    return (await this.valuation(ctx)).items.filter((s) => s.onHand > 0 && (!s.lastIssueAt || s.lastIssueAt < cutoff)).sort((a, b) => b.value - a.value);
  }

  /** FIFO stock by age bucket (0-30, 31-60, 61-90, 91-180, 180+ days). */
  async ageing(ctx: RequestContext) {
    const layers = (await this.col<CostLayerDoc>(INVENTORY_COLLECTIONS.layers).where("companyId", "==", ctx.companyId).where("open", "==", true).limit(10_000).get()).docs.map((d) => d.data());
    const buckets = [30, 60, 90, 180, Infinity];
    const result = new Map<string, number[]>();
    for (const l of layers) {
      const age = (Date.now() - new Date(l.receivedAt).getTime()) / 86_400_000;
      const i = buckets.findIndex((b) => age <= b);
      const row = result.get(l.productId) ?? [0, 0, 0, 0, 0];
      row[i]! += extend(l.qtyRemaining, l.unitCost);
      result.set(l.productId, row);
    }
    return { buckets: ["0-30", "31-60", "61-90", "91-180", "180+"], products: [...result.entries()].map(([productId, values]) => ({ productId, values })) };
  }

  /** The stock ledger, newest first, by product, warehouse or type. */
  async movements(ctx: RequestContext, filter: { productId?: string; warehouseId?: string; type?: string; limit?: number; cursor?: string }): Promise<Page<StockMovementDoc>> {
    const limit = Math.min(filter.limit ?? 50, 200);
    let q = this.col<StockMovementDoc>(INVENTORY_COLLECTIONS.movements).where("companyId", "==", ctx.companyId).where("archived", "==", false);
    const extra: [keyof StockMovementDoc, string][] = [];
    const indexed = (["productId", "warehouseId", "type"] as const).filter((f) => filter[f]);
    if (indexed[0]) q = q.where(indexed[0], "==", filter[indexed[0]]);
    for (const f of indexed.slice(1)) extra.push([f, filter[f]!]);
    q = q.orderBy("postedAt", "desc").orderBy("__name__", "desc");
    if (filter.cursor) {
      const snap = await this.col(INVENTORY_COLLECTIONS.movements).doc(filter.cursor).get();
      if (snap.exists) q = q.startAfter(snap);
    }
    const docs = (await q.limit(extra.length ? limit * 4 : limit + 1).get()).docs.map((d) => d.data()).filter((m) => extra.every(([k, v]) => m[k] === v));
    const items = docs.slice(0, limit);
    return { items, nextCursor: docs.length > limit ? items[items.length - 1]!.id : null };
  }

  /** Reorder settings live on the product's stock summary. */
  async setReorder(ctx: RequestContext, productId: string, dto: ReorderDto) {
    return this.firestore.runTransaction(async (tx) => {
      const product = (await tx.get(this.col<ProductDoc>(PRODUCT_COLLECTIONS.products).doc(productId))).data();
      if (!product || product.companyId !== ctx.companyId) throw new NotFoundException("Product not found");
      const ref = this.col<StockSummaryDoc>(INVENTORY_COLLECTIONS.summaries).doc(summaryId(ctx.companyId, productId));
      const now = new Date().toISOString();
      const current = (await tx.get(ref)).data() ?? {
        id: ref.id, tenantId: ctx.tenantId, companyId: ctx.companyId, productId, onHand: 0, reserved: 0, inTransit: 0, onOrder: 0, value: 0,
        avgCost: product.costingMethod === "standard" ? product.standardCost : 0, reorderPoint: 0, safetyStock: 0, reorderQty: 0, lowStock: false,
        lastReceiptAt: null, lastIssueAt: null, updatedAt: now,
      };
      const next = {
        ...current,
        reorderPoint: toQty(dto.reorderPoint),
        safetyStock: dto.safetyStock ? toQty(dto.safetyStock) : current.safetyStock,
        reorderQty: dto.reorderQty ? toQty(dto.reorderQty) : current.reorderQty,
        updatedAt: now,
      };
      next.lowStock = next.reorderPoint > 0 && next.onHand - next.reserved <= next.reorderPoint;
      tx.set(ref, next);
      return next;
    });
  }
}
