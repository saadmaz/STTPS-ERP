import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { applyRate, extend, toQty } from "../platform/data/money.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { PRODUCT_COLLECTIONS } from "../products/products.models.js";
import { InventoryReports } from "../inventory/inventory.services.js";
import { OrderService } from "../sales/sales.services.js";
import { RequisitionService } from "../procurement/procurement.services.js";
import { CreateDemandForecastDto, RunMrpDto, UpdateDemandForecastDto, UpdateMrpRunDto } from "./manufacturing-mrp.dto.js";
import { DemandForecastDoc, MRP_COLLECTIONS, MrpDemandLine, MrpPlannedProductionLine, MrpPlannedPurchaseLine, MrpRunDoc } from "./manufacturing-mrp.models.js";
import { BomService, ProductionOrderService } from "./manufacturing.services.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const qtyToString = (thousandths: number) => (thousandths / 1000).toFixed(3);
const qtyToNumber = (thousandths: number) => Number(qtyToString(thousandths));

@Injectable()
export class DemandForecastService extends MasterDataService<DemandForecastDoc, CreateDemandForecastDto, UpdateDemandForecastDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "manufacturing", entity: "demandForecast", label: "Demand forecast", collection: MRP_COLLECTIONS.demandForecasts,
      route: "/manufacturing/demand-forecasts", filterFields: ["productId", "period"],
      references: [{ field: "productId", collection: PRODUCT_COLLECTIONS.products, label: "Product" }], customFields: false,
    });
  }

  protected toNew(dto: CreateDemandForecastDto): NewDoc<DemandForecastDoc> {
    return { productId: dto.productId, period: dto.period, qty: toQty(dto.qty), notes: orNull(dto.notes) };
  }

  protected toPatch(dto: UpdateDemandForecastDto): Patch<DemandForecastDoc> {
    const { qty, ...rest } = dto;
    return { ...rest, ...(qty !== undefined ? { qty: toQty(qty) } : {}) } as Patch<DemandForecastDoc>;
  }

  protected searchEntry(doc: DemandForecastDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.productId} · ${doc.period}`, subtitle: null };
  }
}

interface ComputedPlan {
  demand: MrpDemandLine[];
  plannedProduction: MrpPlannedProductionLine[];
  plannedPurchases: MrpPlannedPurchaseLine[];
}

@Injectable()
export class MrpService extends MasterDataService<MrpRunDoc, RunMrpDto, UpdateMrpRunDto> {
  constructor(
    fs: FirestoreService, audit: AuditService, unique: UniqueService,
    private readonly forecasts: DemandForecastService,
    private readonly boms: BomService,
    private readonly productionOrders: ProductionOrderService,
    private readonly orders: OrderService,
    private readonly requisitions: RequisitionService,
    private readonly inventoryReports: InventoryReports,
  ) {
    super(fs, audit, unique, {
      module: "manufacturing", entity: "mrpRun", label: "MRP run", collection: MRP_COLLECTIONS.runs,
      route: "/manufacturing/mrp-runs", customFields: false, searchable: false,
    });
  }

  /** Runs a fresh MRP computation and stores its result. Everything here is a read; the computed plan is written once, in `toNew`. */
  async create(ctx: RequestContext, dto: RunMrpDto): Promise<MrpRunDoc> {
    const horizonEnd = dto.horizonEnd ?? addDays(today(), 90);
    const plan = await this.computePlan(ctx, horizonEnd);
    return super.create(ctx, { ...dto, horizonEnd, ...plan } as RunMrpDto & ComputedPlan);
  }

  protected toNew(dto: RunMrpDto & ComputedPlan): NewDoc<MrpRunDoc> {
    return { runAt: new Date().toISOString(), horizonEnd: dto.horizonEnd!, demand: dto.demand, plannedProduction: dto.plannedProduction, plannedPurchases: dto.plannedPurchases, notes: null };
  }

  /**
   * Nets open sales-order and forecast demand against on-hand stock, stock
   * already on order (Inventory's `onOrder`, which already covers open
   * purchase orders) and existing planned/released/in-progress production
   * orders for the same product. A shortage becomes a planned production
   * order when the product has an active BOM, exploded **one level** into
   * component demand, or a planned purchase otherwise. Components that are
   * themselves manufactured are not exploded a second level — give them
   * their own demand forecast row if that depth is needed; true multi-level
   * MRP is not built.
   */
  private async computePlan(ctx: RequestContext, horizonEnd: string): Promise<ComputedPlan> {
    const [orders, forecasts, productionOrders] = await Promise.all([
      this.orders.repo.all(ctx, {}),
      this.forecasts.repo.all(ctx, {}),
      this.productionOrders.repo.all(ctx, {}),
    ]);

    const demand: MrpDemandLine[] = [];
    for (const order of orders) {
      if (!["confirmed", "partially_delivered"].includes(order.status)) continue;
      const due = (order.requestedDate ?? order.date).slice(0, 10);
      if (due > horizonEnd) continue;
      for (const line of order.lines) {
        if (!line.stocked) continue;
        const open = line.qty - line.delivered;
        if (open > 0) demand.push({ productId: line.productId, source: "salesOrder", sourceId: order.id, dueDate: due, qty: open });
      }
    }
    const horizonMonth = horizonEnd.slice(0, 7);
    for (const f of forecasts) {
      if (f.period > horizonMonth) continue;
      demand.push({ productId: f.productId, source: "forecast", sourceId: f.id, dueDate: `${f.period}-01`, qty: f.qty });
    }

    const demandByProduct = new Map<string, { qty: number; due: string }>();
    for (const d of demand) {
      const row = demandByProduct.get(d.productId);
      if (row) {
        row.qty += d.qty;
        if (d.dueDate < row.due) row.due = d.dueDate;
      } else {
        demandByProduct.set(d.productId, { qty: d.qty, due: d.dueDate });
      }
    }

    const plannedSupplyByProduct = new Map<string, number>();
    for (const po of productionOrders) {
      if (!["planned", "released", "in_progress"].includes(po.status)) continue;
      const remaining = po.qtyPlanned - po.qtyProduced - po.qtyScrapped;
      if (remaining > 0) plannedSupplyByProduct.set(po.productId, (plannedSupplyByProduct.get(po.productId) ?? 0) + remaining);
    }

    const plannedProduction: MrpPlannedProductionLine[] = [];
    const plannedPurchases: MrpPlannedPurchaseLine[] = [];
    const componentNeed = new Map<string, { qty: number; due: string }>();

    const netOf = async (productId: string, grossQty: number) => {
      const summary = await this.inventoryReports.summary(ctx, productId);
      const available = (summary?.onHand ?? 0) + (summary?.onOrder ?? 0) + (plannedSupplyByProduct.get(productId) ?? 0);
      return grossQty - available;
    };

    for (const [productId, { qty, due }] of demandByProduct) {
      const net = await netOf(productId, qty);
      if (net <= 0) continue;
      const bom = await this.boms.activeFor(ctx, productId);
      if (bom) {
        plannedProduction.push({ lineId: randomUUID().slice(0, 8), productId, qty: net, dueDate: due, bomId: bom.id, status: "suggested", productionOrderId: null });
        for (const line of bom.lines) {
          if (line.isAlternate) continue;
          const need = extend(line.qty, net) + applyRate(extend(line.qty, net), line.scrapPct);
          const row = componentNeed.get(line.componentProductId);
          if (row) {
            row.qty += need;
            if (due < row.due) row.due = due;
          } else {
            componentNeed.set(line.componentProductId, { qty: need, due });
          }
        }
      } else {
        plannedPurchases.push({ lineId: randomUUID().slice(0, 8), productId, qty: net, dueDate: due, status: "suggested", requisitionId: null });
      }
    }

    for (const [productId, { qty, due }] of componentNeed) {
      const net = await netOf(productId, qty);
      if (net <= 0) continue;
      plannedPurchases.push({ lineId: randomUUID().slice(0, 8), productId, qty: net, dueDate: due, status: "suggested", requisitionId: null });
    }

    return { demand, plannedProduction, plannedPurchases };
  }

  async convertProduction(ctx: RequestContext, runId: string, lineId: string): Promise<MrpRunDoc> {
    const run = await this.repo.get(ctx, runId);
    const line = run.plannedProduction.find((l) => l.lineId === lineId);
    if (!line) throw new NotFoundException(`No planned production line ${lineId} on this run`);
    if (line.status !== "suggested") throw new BadRequestException(`This line is already ${line.status}`);
    const order = await this.productionOrders.create(ctx, {
      productId: line.productId, bomId: line.bomId, qtyPlanned: qtyToNumber(line.qty), scheduledStart: line.dueDate,
      notes: `Created from MRP run ${run.id}`,
    });
    const plannedProduction = run.plannedProduction.map((l) => (l.lineId === lineId ? { ...l, status: "converted" as const, productionOrderId: order.id } : l));
    return (await this.repo.update(ctx, runId, { plannedProduction } as Patch<MrpRunDoc>)).after;
  }

  async convertPurchase(ctx: RequestContext, runId: string, lineId: string): Promise<MrpRunDoc> {
    const run = await this.repo.get(ctx, runId);
    const line = run.plannedPurchases.find((l) => l.lineId === lineId);
    if (!line) throw new NotFoundException(`No planned purchase line ${lineId} on this run`);
    if (line.status !== "suggested") throw new BadRequestException(`This line is already ${line.status}`);
    const requisition = await this.requisitions.create(ctx, {
      lines: [{ productId: line.productId, qty: qtyToString(line.qty) }], requiredDate: line.dueDate, justification: `Created from MRP run ${run.id}`,
    });
    const plannedPurchases = run.plannedPurchases.map((l) => (l.lineId === lineId ? { ...l, status: "converted" as const, requisitionId: requisition.id } : l));
    return (await this.repo.update(ctx, runId, { plannedPurchases } as Patch<MrpRunDoc>)).after;
  }

  async dismissProduction(ctx: RequestContext, runId: string, lineId: string): Promise<MrpRunDoc> {
    const run = await this.repo.get(ctx, runId);
    if (!run.plannedProduction.some((l) => l.lineId === lineId)) throw new NotFoundException(`No planned production line ${lineId} on this run`);
    const plannedProduction = run.plannedProduction.map((l) => (l.lineId === lineId && l.status === "suggested" ? { ...l, status: "dismissed" as const } : l));
    return (await this.repo.update(ctx, runId, { plannedProduction } as Patch<MrpRunDoc>)).after;
  }

  async dismissPurchase(ctx: RequestContext, runId: string, lineId: string): Promise<MrpRunDoc> {
    const run = await this.repo.get(ctx, runId);
    if (!run.plannedPurchases.some((l) => l.lineId === lineId)) throw new NotFoundException(`No planned purchase line ${lineId} on this run`);
    const plannedPurchases = run.plannedPurchases.map((l) => (l.lineId === lineId && l.status === "suggested" ? { ...l, status: "dismissed" as const } : l));
    return (await this.repo.update(ctx, runId, { plannedPurchases } as Patch<MrpRunDoc>)).after;
  }

  protected searchEntry(doc: MrpRunDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `MRP run ${doc.runAt.slice(0, 10)}`, subtitle: doc.horizonEnd };
  }
}
