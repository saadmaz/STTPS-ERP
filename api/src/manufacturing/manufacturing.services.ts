import { BadRequestException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { extend, applyRate, toQty } from "../platform/data/money.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { PRODUCT_COLLECTIONS } from "../products/products.models.js";
import {
  BomLineDto, CompleteOperationDto, CreateBomDto, CreateMachineDto, CreateProductionOrderDto, CreateRoutingDto, CreateWorkCentreDto,
  LogDowntimeDto, RecordOutputDto, UpdateBomDto, UpdateMachineDto, UpdateProductionOrderDto, UpdateRoutingDto, UpdateWorkCentreDto,
} from "./manufacturing.dto.js";
import {
  BomDoc, BomLine, MachineDoc, MFG_COLLECTIONS, MFG_LISTS, ProductionOperation, ProductionOrderDoc, RoutingDoc, WorkCentreDoc,
} from "./manufacturing.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

@Injectable()
export class WorkCentreService extends MasterDataService<WorkCentreDoc, CreateWorkCentreDto, UpdateWorkCentreDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "manufacturing", entity: "workCentre", label: "Work centre", collection: MFG_COLLECTIONS.workCentres, route: "/manufacturing/work-centres",
      uniqueFields: ["code"], customFields: false,
    });
  }

  protected toNew(dto: CreateWorkCentreDto): NewDoc<WorkCentreDoc> {
    return { code: dto.code, name: dto.name, description: orNull(dto.description), capacityHoursPerDay: orNull(dto.capacityHoursPerDay) };
  }

  protected searchEntry(doc: WorkCentreDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code };
  }
}

@Injectable()
export class MachineService extends MasterDataService<MachineDoc, CreateMachineDto, UpdateMachineDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "manufacturing", entity: "machine", label: "Machine", collection: MFG_COLLECTIONS.machines, route: "/manufacturing/machines",
      uniqueFields: ["code"], filterFields: ["workCentreId", "status"],
      references: [{ field: "workCentreId", collection: MFG_COLLECTIONS.workCentres, label: "Work centre" }], customFields: false,
    });
  }

  protected toNew(dto: CreateMachineDto): NewDoc<MachineDoc> {
    return { code: dto.code, name: dto.name, workCentreId: dto.workCentreId, status: dto.status ?? "operational" };
  }

  protected searchEntry(doc: MachineDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code };
  }
}

@Injectable()
export class BomService extends MasterDataService<BomDoc, CreateBomDto, UpdateBomDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "manufacturing", entity: "bom", label: "Bill of materials", collection: MFG_COLLECTIONS.boms, route: "/manufacturing/boms",
      filterFields: ["productId", "status"],
      references: [{ field: "productId", collection: PRODUCT_COLLECTIONS.products, label: "Product" }], customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: CreateBomDto): Promise<BomDoc> {
    if (dto.revision === undefined) {
      const existing = await this.loadAll(ctx);
      const forProduct = existing.filter((b) => b.productId === dto.productId);
      const next = forProduct.length ? Math.max(...forProduct.map((b) => b.revision)) + 1 : 1;
      return super.create(ctx, { ...dto, revision: next });
    }
    return super.create(ctx, dto);
  }

  /** The active BOM for a product on a given date (default today), latest revision first. */
  async activeFor(ctx: RequestContext, productId: string, date = new Date().toISOString().slice(0, 10)): Promise<BomDoc | null> {
    const all = await this.loadAll(ctx);
    const candidates = all.filter(
      (b) => b.productId === productId && b.status === "active" && b.effectiveFrom <= date && (!b.effectiveTo || b.effectiveTo >= date),
    );
    candidates.sort((a, b) => b.revision - a.revision);
    return candidates[0] ?? null;
  }

  private line(dto: BomLineDto): BomLine {
    return {
      componentProductId: dto.componentProductId, qty: toQty(dto.qty), scrapPct: Math.round((dto.scrapPct ?? 0) * 100),
      isAlternate: dto.isAlternate ?? false, alternateGroup: orNull(dto.alternateGroup), laborMinutes: dto.laborMinutes ?? 0,
    };
  }

  protected toNew(dto: CreateBomDto & { revision: number }): NewDoc<BomDoc> {
    return {
      productId: dto.productId, revision: dto.revision, status: "draft", effectiveFrom: dto.effectiveFrom, effectiveTo: orNull(dto.effectiveTo),
      lines: (dto.lines ?? []).map((l) => this.line(l)), notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateBomDto): Patch<BomDoc> {
    const { lines, ...rest } = dto;
    return { ...rest, ...(lines ? { lines: lines.map((l) => this.line(l)) } : {}) } as Patch<BomDoc>;
  }

  async activate(ctx: RequestContext, id: string): Promise<BomDoc> {
    const bom = await this.repo.get(ctx, id);
    if (bom.lines.length === 0) throw new BadRequestException("Add at least one line before activating this bill of materials");
    return (await this.repo.update(ctx, id, { status: "active" } as Patch<BomDoc>)).after;
  }

  async obsolete(ctx: RequestContext, id: string): Promise<BomDoc> {
    return (await this.repo.update(ctx, id, { status: "obsolete" } as Patch<BomDoc>)).after;
  }

  protected searchEntry(doc: BomDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.productId} v${doc.revision}`, subtitle: doc.status };
  }
}

@Injectable()
export class RoutingService extends MasterDataService<RoutingDoc, CreateRoutingDto, UpdateRoutingDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "manufacturing", entity: "routing", label: "Routing", collection: MFG_COLLECTIONS.routings, route: "/manufacturing/routings",
      filterFields: ["productId", "status"],
      references: [{ field: "productId", collection: PRODUCT_COLLECTIONS.products, label: "Product" }], customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: CreateRoutingDto): Promise<RoutingDoc> {
    if (dto.revision === undefined) {
      const existing = await this.loadAll(ctx);
      const forProduct = existing.filter((r) => r.productId === dto.productId);
      const next = forProduct.length ? Math.max(...forProduct.map((r) => r.revision)) + 1 : 1;
      return super.create(ctx, { ...dto, revision: next });
    }
    return super.create(ctx, dto);
  }

  async activeFor(ctx: RequestContext, productId: string): Promise<RoutingDoc | null> {
    const all = await this.loadAll(ctx);
    const candidates = all.filter((r) => r.productId === productId && r.status === "active");
    candidates.sort((a, b) => b.revision - a.revision);
    return candidates[0] ?? null;
  }

  private ops(operations: CreateRoutingDto["operations"]): RoutingDoc["operations"] {
    return (operations ?? []).map((o) => ({ seq: o.seq, name: o.name, workCentreId: o.workCentreId, setupMinutes: o.setupMinutes ?? 0, runMinutesPerUnit: o.runMinutesPerUnit }));
  }

  protected toNew(dto: CreateRoutingDto & { revision: number }): NewDoc<RoutingDoc> {
    return { productId: dto.productId, revision: dto.revision, status: "draft", operations: this.ops(dto.operations) };
  }

  protected toPatch(dto: UpdateRoutingDto): Patch<RoutingDoc> {
    const { operations, ...rest } = dto;
    return { ...rest, ...(operations ? { operations: this.ops(operations) } : {}) } as Patch<RoutingDoc>;
  }

  async activate(ctx: RequestContext, id: string): Promise<RoutingDoc> {
    const routing = await this.repo.get(ctx, id);
    if (routing.operations.length === 0) throw new BadRequestException("Add at least one operation before activating this routing");
    return (await this.repo.update(ctx, id, { status: "active" } as Patch<RoutingDoc>)).after;
  }

  protected searchEntry(doc: RoutingDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.productId} v${doc.revision}`, subtitle: doc.status };
  }
}

@Injectable()
export class ProductionOrderService extends MasterDataService<ProductionOrderDoc, CreateProductionOrderDto, UpdateProductionOrderDto> {
  constructor(
    fs: FirestoreService, audit: AuditService, unique: UniqueService,
    private readonly boms: BomService,
    private readonly routings: RoutingService,
  ) {
    super(fs, audit, unique, {
      module: "manufacturing", entity: "productionOrder", label: "Production order", collection: MFG_COLLECTIONS.productionOrders,
      route: "/manufacturing/production-orders", large: MFG_LISTS.productionOrders, filterFields: ["status", "productId"],
      references: [{ field: "productId", collection: PRODUCT_COLLECTIONS.products, label: "Product" }],
      numbering: { field: "number", key: "productionOrder", prefix: "PO-MFG" }, customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: CreateProductionOrderDto): Promise<ProductionOrderDoc> {
    const bom = dto.bomId ? await this.boms.repo.get(ctx, dto.bomId) : await this.boms.activeFor(ctx, dto.productId);
    if (!bom) throw new BadRequestException("No active bill of materials for this product; create or activate one, or pass bomId");
    if (dto.bomId && bom.status !== "active") throw new BadRequestException("That bill of materials is not active");
    const routing = dto.routingId ? await this.routings.repo.get(ctx, dto.routingId) : await this.routings.activeFor(ctx, dto.productId);

    const qtyPlanned = toQty(dto.qtyPlanned);
    const materials = bom.lines.filter((l) => !l.isAlternate).map((line) => {
      const base = extend(line.qty, qtyPlanned);
      const scrap = applyRate(base, line.scrapPct);
      return { componentProductId: line.componentProductId, qtyRequired: base + scrap, qtyIssued: 0 };
    });
    const operations: ProductionOperation[] = (routing?.operations ?? []).map((op) => ({
      seq: op.seq, name: op.name, workCentreId: op.workCentreId, machineId: null, status: "pending" as const, actualMinutes: 0, downtimeMinutes: 0,
    }));

    return super.create(ctx, { ...dto, qtyPlanned, bomId: bom.id, routingId: routing?.id ?? null, materials, operations } as CreateProductionOrderDto & {
      qtyPlanned: number; bomId: string; routingId: string | null; materials: typeof materials; operations: typeof operations;
    });
  }

  protected toNew(
    dto: CreateProductionOrderDto & { bomId: string; routingId: string | null; materials: ProductionOrderDoc["materials"]; operations: ProductionOperation[] },
  ): NewDoc<ProductionOrderDoc> {
    return {
      number: "", productId: dto.productId, bomId: dto.bomId, routingId: dto.routingId, qtyPlanned: dto.qtyPlanned, qtyProduced: 0, qtyScrapped: 0,
      status: "planned", scheduledStart: orNull(dto.scheduledStart), scheduledEnd: orNull(dto.scheduledEnd), actualStart: null, actualEnd: null,
      warehouseId: orNull(dto.warehouseId), materials: dto.materials, operations: dto.operations, notes: orNull(dto.notes),
    };
  }

  async release(ctx: RequestContext, id: string): Promise<ProductionOrderDoc> {
    const order = await this.repo.get(ctx, id);
    if (order.status !== "planned") throw new BadRequestException(`A ${order.status} order cannot be released`);
    return (await this.repo.update(ctx, id, { status: "released" } as Patch<ProductionOrderDoc>)).after;
  }

  async start(ctx: RequestContext, id: string): Promise<ProductionOrderDoc> {
    const order = await this.repo.get(ctx, id);
    if (order.status !== "released") throw new BadRequestException("Release the order before starting it");
    return (await this.repo.update(ctx, id, { status: "in_progress", actualStart: new Date().toISOString() } as Patch<ProductionOrderDoc>)).after;
  }

  async completeOperation(ctx: RequestContext, id: string, dto: CompleteOperationDto): Promise<ProductionOrderDoc> {
    const order = await this.repo.get(ctx, id);
    const operations = order.operations.map((op) => (op.seq === dto.seq ? { ...op, status: "completed" as const, actualMinutes: dto.actualMinutes } : op));
    if (!operations.some((op) => op.seq === dto.seq)) throw new BadRequestException(`No operation #${dto.seq} on this order`);
    return (await this.repo.update(ctx, id, { operations } as Patch<ProductionOrderDoc>)).after;
  }

  async logDowntime(ctx: RequestContext, id: string, dto: LogDowntimeDto): Promise<ProductionOrderDoc> {
    const order = await this.repo.get(ctx, id);
    const operations = order.operations.map((op) => (op.seq === dto.seq ? { ...op, downtimeMinutes: op.downtimeMinutes + dto.minutes } : op));
    if (!operations.some((op) => op.seq === dto.seq)) throw new BadRequestException(`No operation #${dto.seq} on this order`);
    return (await this.repo.update(ctx, id, { operations } as Patch<ProductionOrderDoc>)).after;
  }

  /** Material issue and output are recorded for tracking only — see the model's own doc comment for why this doesn't post to Inventory. */
  async recordOutput(ctx: RequestContext, id: string, dto: RecordOutputDto): Promise<ProductionOrderDoc> {
    const order = await this.repo.get(ctx, id);
    if (!["released", "in_progress"].includes(order.status)) throw new BadRequestException(`A ${order.status} order cannot record output`);
    const qtyGood = toQty(dto.qtyGood);
    const qtyScrap = dto.qtyScrap ? toQty(dto.qtyScrap) : 0;
    const qtyProduced = order.qtyProduced + qtyGood;
    const qtyScrapped = order.qtyScrapped + qtyScrap;
    const ratio = qtyPlannedRatio(qtyProduced + qtyScrapped, order.qtyPlanned);
    const materials = order.materials.map((m) => ({ ...m, qtyIssued: applyRate(m.qtyRequired, ratio) }));
    const done = qtyProduced + qtyScrapped >= order.qtyPlanned;
    return (
      await this.repo.update(ctx, id, {
        qtyProduced, qtyScrapped, materials,
        status: done ? "completed" : order.status === "released" ? "in_progress" : order.status,
        actualStart: order.actualStart ?? new Date().toISOString(),
        actualEnd: done ? new Date().toISOString() : order.actualEnd,
      } as Patch<ProductionOrderDoc>)
    ).after;
  }

  async cancel(ctx: RequestContext, id: string): Promise<ProductionOrderDoc> {
    const order = await this.repo.get(ctx, id);
    if (!["planned", "released", "in_progress"].includes(order.status)) throw new BadRequestException(`A ${order.status} order cannot be cancelled`);
    return (await this.repo.update(ctx, id, { status: "cancelled" } as Patch<ProductionOrderDoc>)).after;
  }

  protected searchEntry(doc: ProductionOrderDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: doc.status };
  }
}

/** Qty scale (thousandths) ratio of `done` over `planned`, as a rate for `applyRate`/`extend` (4 decimals). */
function qtyPlannedRatio(done: number, planned: number): number {
  if (planned <= 0) return 0;
  return Math.round((done / planned) * 10_000);
}
