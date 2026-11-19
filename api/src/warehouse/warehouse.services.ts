import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, systemContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { toQty } from "../platform/data/money.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { InventoryReports } from "../inventory/inventory.services.js";
import { DeliveryService, OrderService } from "../sales/sales.services.js";
import { GoodsReceiptService } from "../procurement/procurement.services.js";
import {
  AssignTaskDto, CompleteTaskDto, CreatePutAwayRuleDto, CreateWarehouseTaskDto, SuggestPickDto, UpdatePutAwayRuleDto, UpdateWarehouseTaskDto, WavePickDto,
} from "./warehouse.dto.js";
import { PutAwayRuleDoc, WAREHOUSE_COLLECTIONS, WAREHOUSE_LISTS, WarehouseTaskDoc } from "./warehouse.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

interface GoodsReceivedPayload {
  receiptId: string;
  orderId: string;
  lines: { orderLineId: string; productId: string; accepted: number; rejected: number }[];
}
interface SalesOrderConfirmedPayload {
  orderId: string;
}

@Injectable()
export class PutAwayRuleService extends MasterDataService<PutAwayRuleDoc, CreatePutAwayRuleDto, UpdatePutAwayRuleDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "warehouse", entity: "putAwayRule", label: "Put-away rule", collection: WAREHOUSE_COLLECTIONS.putAwayRules,
      route: "/warehouse/put-away-rules", filterFields: ["warehouseId", "productId", "categoryId"], customFields: false,
    });
  }

  protected toNew(dto: CreatePutAwayRuleDto): NewDoc<PutAwayRuleDoc> {
    return { warehouseId: dto.warehouseId, productId: orNull(dto.productId), categoryId: orNull(dto.categoryId), targetLocationId: dto.targetLocationId, priority: dto.priority ?? 0 };
  }

  /** The most specific matching rule's target location for a put-away, or null if none match. */
  async suggest(ctx: RequestContext, warehouseId: string, productId: string, categoryId: string | null = null): Promise<string | null> {
    const rules = await this.loadAll(ctx);
    const candidates = rules.filter((r) => r.warehouseId === warehouseId && (r.productId === null || r.productId === productId) && (r.categoryId === null || r.categoryId === categoryId));
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      const specificity = (r: PutAwayRuleDoc) => (r.productId ? 2 : r.categoryId ? 1 : 0);
      return specificity(b) - specificity(a) || b.priority - a.priority;
    });
    return candidates[0]!.targetLocationId;
  }

  protected searchEntry(doc: PutAwayRuleDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.warehouseId} rule`, subtitle: doc.productId ?? doc.categoryId ?? "default" };
  }
}

@Injectable()
export class WarehouseTaskService extends MasterDataService<WarehouseTaskDoc, CreateWarehouseTaskDto & { reference?: WarehouseTaskDoc["reference"] }, UpdateWarehouseTaskDto> implements OnModuleInit {
  constructor(
    fs: FirestoreService, audit: AuditService, unique: UniqueService,
    private readonly putAwayRules: PutAwayRuleService,
    private readonly events: EventBusService,
    private readonly receipts: GoodsReceiptService,
    private readonly orders: OrderService,
  ) {
    super(fs, audit, unique, {
      module: "warehouse", entity: "task", label: "Warehouse task", collection: WAREHOUSE_COLLECTIONS.tasks,
      route: "/warehouse/tasks", large: WAREHOUSE_LISTS.tasks, filterFields: ["status", "type", "warehouseId", "assignedTo"],
      numbering: { field: "number", key: "warehouseTask", prefix: "WT", yearly: true }, customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<GoodsReceivedPayload>("GoodsReceived", "warehouse.putawayFromReceipt", async (event) => {
      const ctx = systemContext(event, event.actorId);
      const receipt = await this.receipts.repo.find(ctx, event.payload.receiptId);
      if (!receipt) return;
      for (const line of event.payload.lines) {
        if (line.accepted <= 0) continue;
        const locationId = await this.putAwayRules.suggest(ctx, receipt.warehouseId, line.productId);
        await this.create(ctx, {
          type: "putaway", warehouseId: receipt.warehouseId, locationId: locationId ?? undefined, productId: line.productId, qty: line.accepted / 1000,
          reference: { entityType: "procurement.goodsReceipt", entityId: receipt.id, label: receipt.number },
        });
      }
    });
    this.events.subscribe<SalesOrderConfirmedPayload>("SalesOrderConfirmed", "warehouse.pickFromOrder", async (event) => {
      const ctx = systemContext(event, event.actorId);
      const order = await this.orders.repo.find(ctx, event.payload.orderId);
      if (!order) return;
      for (const line of order.lines) {
        if (!line.stocked || line.reserved <= 0) continue;
        await this.create(ctx, {
          type: "pick", warehouseId: line.warehouseId, productId: line.productId, qty: line.reserved / 1000,
          reference: { entityType: "sales.order", entityId: order.id, label: order.number },
        });
      }
    });
  }

  protected toNew(dto: CreateWarehouseTaskDto & { reference?: WarehouseTaskDoc["reference"] }): NewDoc<WarehouseTaskDoc> {
    return {
      number: "", type: dto.type, status: "pending", warehouseId: dto.warehouseId, locationId: orNull(dto.locationId), productId: dto.productId,
      qty: toQty(dto.qty), assignedTo: null, reference: dto.reference ?? null, startedAt: null, completedAt: null, notes: orNull(dto.notes),
    };
  }

  async assign(ctx: RequestContext, id: string, dto: AssignTaskDto): Promise<WarehouseTaskDoc> {
    const task = await this.repo.get(ctx, id);
    if (["completed", "cancelled"].includes(task.status)) throw new BadRequestException(`A ${task.status} task cannot be assigned`);
    return (await this.repo.update(ctx, id, { assignedTo: dto.assignedTo } as Patch<WarehouseTaskDoc>)).after;
  }

  async start(ctx: RequestContext, id: string): Promise<WarehouseTaskDoc> {
    const task = await this.repo.get(ctx, id);
    if (task.status !== "pending") throw new BadRequestException(`A ${task.status} task cannot be started`);
    return (await this.repo.update(ctx, id, { status: "in_progress", startedAt: new Date().toISOString() } as Patch<WarehouseTaskDoc>)).after;
  }

  async complete(ctx: RequestContext, id: string, dto: CompleteTaskDto): Promise<WarehouseTaskDoc> {
    const task = await this.repo.get(ctx, id);
    if (!["pending", "in_progress"].includes(task.status)) throw new BadRequestException(`A ${task.status} task cannot be completed`);
    return (
      await this.repo.update(ctx, id, {
        status: "completed", completedAt: new Date().toISOString(), locationId: dto.locationId ? dto.locationId : task.locationId, notes: dto.notes !== undefined ? orNull(dto.notes) : task.notes,
      } as Patch<WarehouseTaskDoc>)
    ).after;
  }

  async cancel(ctx: RequestContext, id: string): Promise<WarehouseTaskDoc> {
    const task = await this.repo.get(ctx, id);
    if (["completed", "cancelled"].includes(task.status)) throw new BadRequestException(`A ${task.status} task cannot be cancelled`);
    return (await this.repo.update(ctx, id, { status: "cancelled" } as Patch<WarehouseTaskDoc>)).after;
  }

  async scan(ctx: RequestContext, code: string): Promise<WarehouseTaskDoc> {
    const all = await this.loadAll(ctx);
    const task = all.find((t) => t.number === code.trim());
    if (!task) throw new NotFoundException(`No task with code ${code}`);
    return task;
  }

  protected searchEntry(doc: WarehouseTaskDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: doc.status };
  }
}

@Injectable()
export class PickingService {
  constructor(
    private readonly reports: InventoryReports,
    private readonly putAwayRules: PutAwayRuleService,
    private readonly deliveries: DeliveryService,
  ) {}

  /**
   * Allocates a quantity against existing stock balances (lots/batches) for
   * one product and warehouse. `fifo` and `zone` order by lot number (a
   * reasonable proxy, since `StockBalanceDoc` carries no receipt timestamp —
   * only the FIFO-costing `CostLayerDoc`, which isn't tracked per warehouse
   * or lot); `fefo` orders by expiry date, which is exact. `zone` additionally
   * returns a suggested location from the put-away rules, but — since the
   * ledger doesn't track on-hand quantity per bin, only per warehouse and
   * lot — it is a location *recommendation*, not a verified per-bin quantity.
   */
  async suggest(ctx: RequestContext, dto: SuggestPickDto) {
    const strategy = dto.strategy ?? "fifo";
    const balances = (await this.reports.onHand(ctx, { productId: dto.productId, warehouseId: dto.warehouseId })).filter((b) => b.available > 0);
    const sorted = [...balances].sort((a, b) => {
      if (strategy === "fefo") return (a.expiryDate ?? "9999-12-31").localeCompare(b.expiryDate ?? "9999-12-31");
      return (a.lotNo ?? "").localeCompare(b.lotNo ?? "");
    });
    let remaining = toQty(dto.qty);
    const lines: { lotNo: string | null; expiryDate: string | null; qty: number }[] = [];
    for (const b of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(b.available, remaining);
      lines.push({ lotNo: b.lotNo, expiryDate: b.expiryDate, qty: take });
      remaining -= take;
    }
    const locationId = strategy === "zone" ? await this.putAwayRules.suggest(ctx, dto.warehouseId, dto.productId) : null;
    return { productId: dto.productId, warehouseId: dto.warehouseId, strategy, qtyRequested: toQty(dto.qty), qtyAllocated: toQty(dto.qty) - remaining, shortfall: remaining, lines, locationId };
  }

  /** One combined pick list across several deliveries, grouped by product and warehouse. */
  async wave(ctx: RequestContext, dto: WavePickDto) {
    const deliveries = await Promise.all(dto.deliveryIds.map((id) => this.deliveries.repo.get(ctx, id)));
    const need = new Map<string, { productId: string; warehouseId: string; qty: number }>();
    for (const delivery of deliveries) {
      for (const line of delivery.lines) {
        const key = `${line.productId}_${delivery.warehouseId}`;
        const row = need.get(key);
        if (row) row.qty += line.qty;
        else need.set(key, { productId: line.productId, warehouseId: delivery.warehouseId, qty: line.qty });
      }
    }
    const picks = await Promise.all([...need.values()].map((row) => this.suggest(ctx, { productId: row.productId, warehouseId: row.warehouseId, qty: row.qty / 1000, strategy: dto.strategy })));
    return { deliveryIds: dto.deliveryIds, picks };
  }
}
