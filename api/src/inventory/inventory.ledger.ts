import { BadRequestException, Injectable } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { COLLECTIONS } from "../firestore/collections.js";
import { CompanyDoc } from "../firestore/models.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { extend, QTY_SCALE } from "../platform/data/money.js";
import { TenantRepository } from "../platform/data/repository.js";
import { SequenceService } from "../platform/data/sequence.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { PRODUCT_COLLECTIONS, ProductDoc } from "../products/products.models.js";
import {
  balanceId,
  CostLayerDoc,
  DEFAULT_ADJUSTMENT_REASONS,
  INVENTORY_COLLECTIONS,
  InventorySettingsDoc,
  MovementType,
  RecordRef,
  serialId,
  SerialDoc,
  StockBalanceDoc,
  StockMovementDoc,
  StockSummaryDoc,
  summaryId,
  WarehouseDoc,
} from "./inventory.models.js";

export interface MovementInput {
  type: MovementType;
  productId: string;
  warehouseId: string;
  locationId?: string | null;
  lotNo?: string | null;
  expiryDate?: string | null;
  serialNos?: string[];
  /** Signed thousandths of the base unit. */
  qty: number;
  /** Cost for stock coming in (minor units per base unit). Ignored for stock going out. */
  unitCost?: number | null;
  reference?: RecordRef | null;
  reason?: string | null;
  date?: string;
  /** For issues: reserved quantity (positive thousandths) this movement uses up. */
  consumeReserved?: number;
  /** Change to the quantity on order from suppliers (receipts take goods off order). */
  onOrderDelta?: number;
}

export interface PostOptions {
  /** A stock count may post into its own locked warehouse. */
  countId?: string;
  /** Issues that consume their own reservation may use reserved stock. */
  fromReservation?: boolean;
}

export interface PostingPlan {
  /** Write phase: writes movements and projections; returns the movements. */
  commit(): StockMovementDoc[];
}

const STOCKED = new Set(["stock", "manufactured"]);
const TRANSFERS = new Set<MovementType>(["transfer_out", "transfer_in"]);

/**
 * The only way stock changes (blueprint §8, §40 integrity): append-only
 * movements plus balance, summary, FIFO-layer and serial projections, all in
 * one transaction. Every module (adjustments, transfers, counts, sales,
 * purchasing, production) posts through here.
 */
@Injectable()
export class InventoryLedger {
  readonly movements: TenantRepository<StockMovementDoc>;
  private readonly sequences: SequenceService;

  constructor(
    private readonly firestore: FirestoreService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
  ) {
    this.movements = new TenantRepository(firestore, INVENTORY_COLLECTIONS.movements, "Stock movement");
    this.sequences = new SequenceService(firestore);
  }

  async settings(ctx: { companyId: string }, tx?: Transaction): Promise<InventorySettingsDoc> {
    const ref = this.firestore.collection<InventorySettingsDoc>(INVENTORY_COLLECTIONS.settings).doc(ctx.companyId);
    const snap = tx ? await tx.get(ref) : await ref.get();
    return snap.data() ?? { companyId: ctx.companyId, allowNegative: false, adjustmentReasons: DEFAULT_ADJUSTMENT_REASONS, lockedWarehouses: {}, updatedAt: new Date(0).toISOString() };
  }

  /** Posts movements in their own transaction. */
  post(ctx: RequestContext, inputs: MovementInput[], options: PostOptions = {}): Promise<StockMovementDoc[]> {
    return this.firestore.runTransaction(async (tx) => (await this.prepare(tx, ctx, inputs, options)).commit());
  }

  /**
   * Read phase: loads and validates everything, and computes the result.
   * Call it before the caller's own writes, then `commit()`.
   */
  async prepare(tx: Transaction, ctx: RequestContext, inputs: MovementInput[], options: PostOptions = {}): Promise<PostingPlan> {
    if (inputs.length === 0) throw new BadRequestException("Nothing to post");
    if (inputs.length > 120) throw new BadRequestException("Post at most 120 lines at a time");
    const now = new Date().toISOString();
    const db = (name: string) => this.firestore.collection(name);

    // ---- Reads ------------------------------------------------------------
    const settings = await this.settings(ctx, tx);
    const company = (await tx.get(db(COLLECTIONS.companies).doc(ctx.companyId))).data() as CompanyDoc | undefined;
    const currency = company?.currency ?? "LKR";

    const productIds = [...new Set(inputs.map((i) => i.productId))];
    const warehouseIds = [...new Set(inputs.map((i) => i.warehouseId))];
    const productSnaps = await tx.getAll(...productIds.map((id) => db(PRODUCT_COLLECTIONS.products).doc(id)));
    const warehouseSnaps = await tx.getAll(...warehouseIds.map((id) => db(INVENTORY_COLLECTIONS.warehouses).doc(id)));
    const products = new Map(productSnaps.map((s) => [s.id, s.data() as ProductDoc | undefined]));
    const warehouses = new Map(warehouseSnaps.map((s) => [s.id, s.data() as WarehouseDoc | undefined]));

    const balanceKeys = [...new Set(inputs.map((i) => balanceId(ctx.companyId, i.productId, i.warehouseId, i.lotNo ?? null)))];
    const balanceSnaps = await tx.getAll(...balanceKeys.map((k) => db(INVENTORY_COLLECTIONS.balances).doc(k)));
    const balances = new Map(balanceSnaps.map((s) => [s.id, s.data() as StockBalanceDoc | undefined]));
    const summarySnaps = await tx.getAll(...productIds.map((id) => db(INVENTORY_COLLECTIONS.summaries).doc(summaryId(ctx.companyId, id))));
    const summaries = new Map(summarySnaps.map((s) => [s.id, s.data() as StockSummaryDoc | undefined]));

    const fifoIssued = productIds.filter((id) => products.get(id)?.costingMethod === "fifo" && inputs.some((i) => i.productId === id && i.qty < 0 && !TRANSFERS.has(i.type)));
    const layers = new Map<string, CostLayerDoc[]>();
    for (const id of fifoIssued) {
      const snap = await tx.get(db(INVENTORY_COLLECTIONS.layers).where("companyId", "==", ctx.companyId).where("productId", "==", id).where("open", "==", true).orderBy("receivedAt").limit(200));
      layers.set(id, snap.docs.map((d) => d.data() as CostLayerDoc));
    }

    const serialKeys = inputs.flatMap((i) => (i.serialNos ?? []).map((s) => serialId(ctx.companyId, i.productId, s)));
    const serialSnaps = serialKeys.length ? await tx.getAll(...serialKeys.map((k) => db(INVENTORY_COLLECTIONS.serials).doc(k))) : [];
    const serials = new Map(serialSnaps.map((s) => [s.id, s.data() as SerialDoc | undefined]));

    const numbers = await this.sequences.reserveRange(tx, ctx, "stockMovement", inputs.length, { prefix: "MV" });

    // ---- Compute ------------------------------------------------------------
    const docs: StockMovementDoc[] = [];
    const touchedBalances = new Set<string>();
    const touchedSummaries = new Set<string>();
    const newLayers: CostLayerDoc[] = [];
    const changedLayers = new Map<string, CostLayerDoc>();
    const touchedSerials = new Set<string>();

    inputs.forEach((input, index) => {
      const product = products.get(input.productId);
      const warehouse = warehouses.get(input.warehouseId);
      if (!product || product.companyId !== ctx.companyId) throw new BadRequestException("Product not found");
      if (!STOCKED.has(product.type)) throw new BadRequestException(`${product.sku} is a ${product.type.replace("_", "-")} product and holds no stock`);
      if (!warehouse || warehouse.companyId !== ctx.companyId) throw new BadRequestException("Warehouse not found");
      if (!warehouse.isActive || warehouse.archivedAt) throw new BadRequestException(`Warehouse ${warehouse.code} is inactive`);
      const lock = settings.lockedWarehouses[input.warehouseId];
      if (lock && lock !== options.countId) throw new BadRequestException(`Warehouse ${warehouse.code} is locked for a stock count`);
      if (!Number.isSafeInteger(input.qty) || input.qty === 0) throw new BadRequestException("Quantity must be a non-zero amount");

      const lotNo = input.lotNo?.trim() || null;
      if (product.trackLots && !lotNo) throw new BadRequestException(`${product.sku} needs a lot or batch number`);
      if (product.trackExpiry && input.qty > 0 && !input.expiryDate && !TRANSFERS.has(input.type)) {
        throw new BadRequestException(`${product.sku} needs an expiry date`);
      }
      const serialNos = [...new Set((input.serialNos ?? []).map((s) => s.trim()).filter(Boolean))];
      if (product.trackSerials) {
        if (input.qty % QTY_SCALE !== 0 || serialNos.length !== Math.abs(input.qty) / QTY_SCALE) {
          throw new BadRequestException(`${product.sku}: give one serial number per unit`);
        }
      } else if (serialNos.length) {
        throw new BadRequestException(`${product.sku} does not track serial numbers`);
      }

      const bKey = balanceId(ctx.companyId, product.id, warehouse.id, lotNo);
      const balance: StockBalanceDoc = balances.get(bKey) ?? {
        id: bKey, tenantId: ctx.tenantId, companyId: ctx.companyId, productId: product.id, warehouseId: warehouse.id,
        lotNo, expiryDate: input.expiryDate ?? null, onHand: 0, reserved: 0, updatedAt: now,
      };
      const sKey = summaryId(ctx.companyId, product.id);
      const summary: StockSummaryDoc = summaries.get(sKey) ?? {
        id: sKey, tenantId: ctx.tenantId, companyId: ctx.companyId, productId: product.id, onHand: 0, reserved: 0, inTransit: 0, onOrder: 0,
        value: 0, avgCost: product.costingMethod === "standard" ? product.standardCost : 0, reorderPoint: 0, safetyStock: 0, reorderQty: 0,
        lowStock: false, lastReceiptAt: null, lastIssueAt: null, updatedAt: now,
      };

      // Reservations used up by this issue.
      const consume = input.qty < 0 ? Math.min(input.consumeReserved ?? 0, balance.reserved, -input.qty) : 0;
      if (consume) {
        balance.reserved -= consume;
        summary.reserved = Math.max(0, summary.reserved - consume);
      }

      // Negative stock policy.
      if (input.qty < 0) {
        const allowNegative = warehouse.allowNegative ?? settings.allowNegative;
        const usable = options.fromReservation ? balance.onHand : balance.onHand - balance.reserved;
        if (!allowNegative && usable + input.qty < 0) {
          throw new BadRequestException(`Not enough ${product.sku} in ${warehouse.code}${lotNo ? ` lot ${lotNo}` : ""}: ${usable / QTY_SCALE} available`);
        }
      }

      // Serial numbers.
      for (const s of serialNos) {
        const key = serialId(ctx.companyId, product.id, s);
        const current = serials.get(key);
        if (input.qty > 0 && current?.status === "in_stock") throw new BadRequestException(`Serial ${s} is already in stock`);
        if (input.qty < 0 && (current?.status !== "in_stock" || current.warehouseId !== warehouse.id)) {
          throw new BadRequestException(`Serial ${s} is not in stock in ${warehouse.code}`);
        }
      }

      // Costing.
      const qty = input.qty;
      const totalQty = summary.onHand + summary.inTransit;
      let unitCost: number;
      let value: number;
      if (input.type === "transfer_out") {
        unitCost = summary.avgCost;
        value = -extend(-qty, unitCost);
      } else if (input.type === "transfer_in") {
        unitCost = input.unitCost ?? summary.avgCost;
        value = extend(qty, unitCost);
      } else if (qty > 0) {
        unitCost = product.costingMethod === "standard" ? product.standardCost : input.unitCost ?? (summary.avgCost || product.purchasePrice);
        value = extend(qty, unitCost);
        if (product.costingMethod !== "standard") {
          const newValue = summary.value + value;
          const newQty = totalQty + qty;
          summary.avgCost = newQty > 0 ? Math.round((newValue * QTY_SCALE) / newQty) : unitCost;
        }
        if (product.costingMethod === "fifo") {
          const layer: CostLayerDoc = {
            id: db(INVENTORY_COLLECTIONS.layers).doc().id, companyId: ctx.companyId, productId: product.id,
            receivedAt: now, qtyRemaining: qty, unitCost, movementId: "", open: true,
          };
          newLayers.push(layer);
        }
      } else if (product.costingMethod === "fifo") {
        let remaining = -qty;
        let cost = 0;
        for (const layer of layers.get(product.id) ?? []) {
          if (remaining <= 0) break;
          if (layer.qtyRemaining <= 0) continue;
          const take = Math.min(remaining, layer.qtyRemaining);
          cost += extend(take, layer.unitCost);
          layer.qtyRemaining -= take;
          remaining -= take;
          changedLayers.set(layer.id, layer);
        }
        if (remaining > 0) cost += extend(remaining, summary.avgCost); // allowed negative stock: cost at average
        value = -cost;
        unitCost = Math.round((cost * QTY_SCALE) / -qty);
      } else {
        unitCost = product.costingMethod === "standard" ? product.standardCost : summary.avgCost;
        value = -extend(-qty, unitCost);
      }

      // Projections.
      balance.onHand += qty;
      if (qty > 0 && input.expiryDate && !balance.expiryDate) balance.expiryDate = input.expiryDate;
      balance.updatedAt = now;
      balances.set(bKey, balance);
      touchedBalances.add(bKey);

      summary.onHand += qty;
      if (input.onOrderDelta) summary.onOrder = Math.max(0, (summary.onOrder ?? 0) + input.onOrderDelta);
      if (input.type === "transfer_out") summary.inTransit += -qty;
      else if (input.type === "transfer_in") summary.inTransit = Math.max(0, summary.inTransit - qty);
      else summary.value += value;
      if (summary.onHand + summary.inTransit === 0) summary.value = 0;
      if (qty > 0 && !TRANSFERS.has(input.type)) summary.lastReceiptAt = now;
      if (qty < 0 && !TRANSFERS.has(input.type)) summary.lastIssueAt = now;
      summary.updatedAt = now;
      summaries.set(sKey, summary);
      touchedSummaries.add(sKey);

      const doc = this.movements.build(ctx, {
        number: numbers.numbers[index]!,
        type: input.type,
        productId: product.id,
        warehouseId: warehouse.id,
        locationId: input.locationId ?? null,
        lotNo,
        expiryDate: input.expiryDate ?? null,
        serialNos,
        qty,
        unitCost,
        value,
        currency,
        reference: input.reference ?? null,
        reason: input.reason ?? null,
        postedAt: now,
        date: (input.date ?? now).slice(0, 10),
      });
      docs.push(doc);
      const layer = newLayers[newLayers.length - 1];
      if (layer && layer.movementId === "" && qty > 0 && product.costingMethod === "fifo") layer.movementId = doc.id;

      for (const s of serialNos) {
        const key = serialId(ctx.companyId, product.id, s);
        const current = serials.get(key);
        serials.set(key, {
          id: key, companyId: ctx.companyId, productId: product.id, serialNo: s,
          status: qty > 0 ? "in_stock" : "out", warehouseId: qty > 0 ? warehouse.id : null, lastMovementId: doc.id,
          history: [...(current?.history ?? []), { movementId: doc.id, type: input.type, at: now, warehouseId: warehouse.id }].slice(-50),
        });
        touchedSerials.add(key);
      }
    });

    // ---- Writes ------------------------------------------------------------
    return {
      commit: () => {
        numbers.commit();
        for (const doc of docs) tx.create(this.movements.ref(doc.id), doc);
        for (const key of touchedBalances) tx.set(db(INVENTORY_COLLECTIONS.balances).doc(key), balances.get(key)!);
        for (const key of touchedSummaries) {
          const s = summaries.get(key)!;
          const available = s.onHand - s.reserved;
          const low = s.reorderPoint > 0 && available <= s.reorderPoint;
          if (low && !s.lowStock) {
            this.events.publish(tx, ctx, "LowStock", { entity: "products.product", entityId: s.productId }, { productId: s.productId, available, reorderPoint: s.reorderPoint, reorderQty: s.reorderQty });
          }
          s.lowStock = low;
          tx.set(db(INVENTORY_COLLECTIONS.summaries).doc(key), s);
        }
        for (const layer of newLayers) tx.set(db(INVENTORY_COLLECTIONS.layers).doc(layer.id), layer);
        for (const layer of changedLayers.values()) tx.set(db(INVENTORY_COLLECTIONS.layers).doc(layer.id), { ...layer, open: layer.qtyRemaining > 0 });
        for (const key of touchedSerials) tx.set(db(INVENTORY_COLLECTIONS.serials).doc(key), serials.get(key)!);
        this.events.publish(tx, ctx, "StockMoved", { entity: "inventory.movement", entityId: docs[0]!.id }, {
          movements: docs.map((d) => ({ id: d.id, type: d.type, productId: d.productId, warehouseId: d.warehouseId, qty: d.qty, value: d.value })),
          totalValue: docs.reduce((a, d) => a + d.value, 0),
          currency,
          reference: docs[0]!.reference,
        });
        return docs;
      },
    };
  }

  /**
   * Reserves stock for several lines at once (read phase), allocating up to
   * what is available per product, warehouse and lot. Returns the reserved
   * quantity per line, and `commit()` for the write phase.
   */
  async reserveMany(tx: Transaction, ctx: RequestContext, items: { productId: string; warehouseId: string; lotNo?: string | null; qty: number }[]) {
    const { balances, summaries, refs } = await this.loadPositions(tx, ctx, items);
    const reserved = items.map((item) => {
      const b = balances.get(balanceId(ctx.companyId, item.productId, item.warehouseId, item.lotNo ?? null))!;
      const take = Math.max(0, Math.min(item.qty, b.onHand - b.reserved));
      b.reserved += take;
      summaries.get(summaryId(ctx.companyId, item.productId))!.reserved += take;
      return take;
    });
    return { reserved, commit: () => this.writePositions(tx, balances, summaries, refs) };
  }

  /** Gives back reserved stock for several lines (read phase); `commit()` to write. */
  async releaseMany(tx: Transaction, ctx: RequestContext, items: { productId: string; warehouseId: string; lotNo?: string | null; qty: number }[]) {
    const { balances, summaries, refs } = await this.loadPositions(tx, ctx, items);
    for (const item of items) {
      const b = balances.get(balanceId(ctx.companyId, item.productId, item.warehouseId, item.lotNo ?? null))!;
      const give = Math.min(item.qty, b.reserved);
      b.reserved -= give;
      const s = summaries.get(summaryId(ctx.companyId, item.productId))!;
      s.reserved = Math.max(0, s.reserved - give);
    }
    return { commit: () => this.writePositions(tx, balances, summaries, refs) };
  }

  /** Changes the quantity on order from suppliers (purchase orders approved, received or cancelled). */
  async adjustOnOrder(tx: Transaction, ctx: RequestContext, items: { productId: string; delta: number }[]) {
    const { summaries } = await this.loadPositions(tx, ctx, items.map((i) => ({ productId: i.productId, warehouseId: "-", lotNo: null })), false);
    for (const item of items) {
      const s = summaries.get(summaryId(ctx.companyId, item.productId))!;
      s.onOrder = Math.max(0, (s.onOrder ?? 0) + item.delta);
    }
    return { commit: () => this.writePositions(tx, new Map(), summaries, new Set()) };
  }

  private async loadPositions(tx: Transaction, ctx: RequestContext, items: { productId: string; warehouseId: string; lotNo?: string | null }[], withBalances = true) {
    const now = new Date().toISOString();
    const bKeys = withBalances ? [...new Set(items.map((i) => balanceId(ctx.companyId, i.productId, i.warehouseId, i.lotNo ?? null)))] : [];
    const sKeys = [...new Set(items.map((i) => summaryId(ctx.companyId, i.productId)))];
    const balances = new Map<string, StockBalanceDoc>();
    const summaries = new Map<string, StockSummaryDoc>();
    const refs = new Set<string>();
    if (bKeys.length) {
      const snaps = await tx.getAll(...bKeys.map((k) => this.firestore.collection(INVENTORY_COLLECTIONS.balances).doc(k)));
      snaps.forEach((snap, i) => {
        const item = items.find((it) => balanceId(ctx.companyId, it.productId, it.warehouseId, it.lotNo ?? null) === bKeys[i])!;
        balances.set(snap.id, (snap.data() as StockBalanceDoc | undefined) ?? {
          id: snap.id, tenantId: ctx.tenantId, companyId: ctx.companyId, productId: item.productId, warehouseId: item.warehouseId,
          lotNo: item.lotNo ?? null, expiryDate: null, onHand: 0, reserved: 0, updatedAt: now,
        });
      });
    }
    if (sKeys.length) {
      const snaps = await tx.getAll(...sKeys.map((k) => this.firestore.collection(INVENTORY_COLLECTIONS.summaries).doc(k)));
      for (const snap of snaps) {
        const productId = snap.id.slice(ctx.companyId.length + 2);
        summaries.set(snap.id, (snap.data() as StockSummaryDoc | undefined) ?? {
          id: snap.id, tenantId: ctx.tenantId, companyId: ctx.companyId, productId, onHand: 0, reserved: 0, inTransit: 0, onOrder: 0, value: 0,
          avgCost: 0, reorderPoint: 0, safetyStock: 0, reorderQty: 0, lowStock: false, lastReceiptAt: null, lastIssueAt: null, updatedAt: now,
        });
      }
    }
    bKeys.forEach((k) => refs.add(`b:${k}`));
    sKeys.forEach((k) => refs.add(`s:${k}`));
    return { balances, summaries, refs };
  }

  private writePositions(tx: Transaction, balances: Map<string, StockBalanceDoc>, summaries: Map<string, StockSummaryDoc>, _refs: Set<string>) {
    const now = new Date().toISOString();
    for (const [k, b] of balances) tx.set(this.firestore.collection(INVENTORY_COLLECTIONS.balances).doc(k), { ...b, updatedAt: now });
    for (const [k, s] of summaries) tx.set(this.firestore.collection(INVENTORY_COLLECTIONS.summaries).doc(k), { ...s, updatedAt: now });
  }

  /** Records an audit entry for a posted document. */
  auditPosting(tx: Transaction, ctx: RequestContext, entity: string, entityId: string, movements: StockMovementDoc[]) {
    this.audit.record(ctx, {
      module: "inventory",
      action: "posted",
      entity,
      entityId,
      after: { movements: movements.map((m) => m.number), value: movements.reduce((a, m) => a + m.value, 0) },
    }, tx);
  }
}
