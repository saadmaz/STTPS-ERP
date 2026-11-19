import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { extend, toMinor, toQty } from "../platform/data/money.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { ASSET_COLLECTIONS, FixedAssetService } from "../finance/assets.js";
import {
  AddPartDto,
  AssignTechnicianDto,
  CompleteWorkOrderDto,
  CreateMaintenancePlanDto,
  CreateWorkOrderDto,
  LogLaborDto,
  UpdateMaintenancePlanDto,
  UpdateWorkOrderDto,
} from "./maintenance.dto.js";
import { ChecklistItem, MAINTENANCE_COLLECTIONS, MaintenancePlanDoc, PartUsed, WorkOrderDoc } from "./maintenance.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);

function nextDue(from: string, plan: Pick<MaintenancePlanDoc, "frequency" | "intervalDays">): string {
  const days = plan.frequency === "daily" ? 1 : plan.frequency === "weekly" ? 7 : plan.frequency === "monthly" ? 30 : plan.intervalDays;
  return new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

@Injectable()
export class MaintenancePlanService extends MasterDataService<MaintenancePlanDoc, CreateMaintenancePlanDto, UpdateMaintenancePlanDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "maintenance", entity: "plan", label: "Maintenance plan", collection: MAINTENANCE_COLLECTIONS.plans, route: "/maintenance/plans",
      filterFields: ["assetId", "active"], references: [{ field: "assetId", collection: ASSET_COLLECTIONS.assets, label: "Asset" }], customFields: false,
    });
  }

  protected toNew(dto: CreateMaintenancePlanDto): NewDoc<MaintenancePlanDoc> {
    return {
      assetId: dto.assetId, name: dto.name, frequency: dto.frequency, intervalDays: dto.frequency === "custom" ? dto.intervalDays ?? 30 : { daily: 1, weekly: 7, monthly: 30 }[dto.frequency] ?? 30,
      lastDoneDate: null, nextDueDate: dto.nextDueDate.slice(0, 10), checklistTemplate: dto.checklistTemplate ?? [], active: true, notes: orNull(dto.notes),
    };
  }

  async setActive(ctx: RequestContext, id: string, active: boolean): Promise<MaintenancePlanDoc> {
    return (await this.repo.update(ctx, id, { active } as Patch<MaintenancePlanDoc>)).after;
  }

  /** Advances the plan's own due date; the work order itself is created by `WorkOrderService.fromPlan`. */
  async advance(ctx: RequestContext, id: string): Promise<MaintenancePlanDoc> {
    const before = await this.repo.get(ctx, id);
    return (await this.repo.update(ctx, id, { lastDoneDate: today(), nextDueDate: nextDue(today(), before) } as Patch<MaintenancePlanDoc>)).after;
  }

  async dueBy(ctx: RequestContext, date: string): Promise<MaintenancePlanDoc[]> {
    const all = await this.loadAll(ctx);
    return all.filter((p) => p.active && p.nextDueDate <= date);
  }

  protected searchEntry(doc: MaintenancePlanDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.nextDueDate };
  }
}

@Injectable()
export class WorkOrderService extends MasterDataService<WorkOrderDoc, CreateWorkOrderDto, UpdateWorkOrderDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly plans: MaintenancePlanService, private readonly assets: FixedAssetService) {
    super(fs, audit, unique, {
      module: "maintenance", entity: "workOrder", label: "Work order", collection: MAINTENANCE_COLLECTIONS.workOrders, route: "/maintenance/work-orders",
      filterFields: ["assetId", "status", "type", "assignedTo"], references: [{ field: "assetId", collection: ASSET_COLLECTIONS.assets, label: "Asset" }],
      numbering: { field: "code", key: "workOrder", prefix: "WO" }, customFields: false,
    });
  }

  protected toNew(dto: CreateWorkOrderDto, ctx: RequestContext): NewDoc<WorkOrderDoc> {
    return {
      code: "", assetId: dto.assetId, planId: orNull(dto.planId), type: dto.type ?? "corrective", title: dto.title, description: orNull(dto.description),
      priority: dto.priority ?? "medium", status: "requested", requestedBy: ctx.userId, assignedTo: null, scheduledDate: dto.scheduledDate?.slice(0, 10) ?? null,
      startedAt: null, completedAt: null, downtimeMinutes: 0, parts: [], laborHours: 0, laborCost: 0, partsCost: 0, totalCost: 0, checklist: [], notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateWorkOrderDto): Patch<WorkOrderDoc> {
    const { assetId: _a, planId: _p, scheduledDate, ...rest } = dto;
    const patch = { ...rest } as Patch<WorkOrderDoc>;
    if (scheduledDate !== undefined) Object.assign(patch, { scheduledDate: scheduledDate?.slice(0, 10) ?? null });
    return patch;
  }

  /** Creates a preventive work order from a due plan, and advances the plan's own due date. */
  async fromPlan(ctx: RequestContext, planId: string): Promise<WorkOrderDoc> {
    const plan = await this.plans.repo.get(ctx, planId);
    let wo = await this.create(ctx, { assetId: plan.assetId, planId, type: "preventive", title: plan.name, scheduledDate: plan.nextDueDate });
    if (plan.checklistTemplate.length) {
      wo = (await this.repo.update(ctx, wo.id, { checklist: plan.checklistTemplate.map((text) => ({ itemId: randomUUID().slice(0, 8), text, done: false }) as ChecklistItem) })).after;
    }
    await this.plans.advance(ctx, planId);
    return wo;
  }

  async assign(ctx: RequestContext, id: string, dto: AssignTechnicianDto): Promise<WorkOrderDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status === "completed" || before.status === "cancelled") throw new BadRequestException(`A ${before.status} work order cannot be assigned`);
    return (await this.repo.update(ctx, id, {
      assignedTo: dto.assignedTo, scheduledDate: dto.scheduledDate?.slice(0, 10) ?? before.scheduledDate, status: before.status === "requested" ? "scheduled" : before.status,
    } as Patch<WorkOrderDoc>)).after;
  }

  async start(ctx: RequestContext, id: string): Promise<WorkOrderDoc> {
    const before = await this.repo.get(ctx, id);
    if (!["requested", "scheduled"].includes(before.status)) throw new BadRequestException("Only a requested or scheduled work order can start");
    return (await this.repo.update(ctx, id, { status: "in_progress", startedAt: new Date().toISOString() } as Patch<WorkOrderDoc>)).after;
  }

  async addPart(ctx: RequestContext, id: string, dto: AddPartDto): Promise<WorkOrderDoc> {
    const before = await this.repo.get(ctx, id);
    const qty = toQty(dto.qty);
    const unitCost = dto.unitCost ? toMinor(dto.unitCost, "LKR") : null;
    const part: PartUsed = { productId: dto.productId, qty, unitCost, totalCost: unitCost ? extend(qty, unitCost) : 0 };
    const parts = [...before.parts, part];
    const partsCost = parts.reduce((a, p) => a + p.totalCost, 0);
    return (await this.repo.update(ctx, id, { parts, partsCost, totalCost: partsCost + before.laborCost } as Patch<WorkOrderDoc>)).after;
  }

  async logLabor(ctx: RequestContext, id: string, dto: LogLaborDto): Promise<WorkOrderDoc> {
    const before = await this.repo.get(ctx, id);
    const hours = toQty(dto.hours);
    const cost = dto.hourlyCost ? extend(hours, toMinor(dto.hourlyCost, "LKR")) : 0;
    const laborHours = before.laborHours + hours;
    const laborCost = before.laborCost + cost;
    return (await this.repo.update(ctx, id, { laborHours, laborCost, totalCost: before.partsCost + laborCost } as Patch<WorkOrderDoc>)).after;
  }

  async addChecklistItem(ctx: RequestContext, id: string, text: string): Promise<WorkOrderDoc> {
    const before = await this.repo.get(ctx, id);
    const item: ChecklistItem = { itemId: randomUUID().slice(0, 8), text, done: false };
    return (await this.repo.update(ctx, id, { checklist: [...before.checklist, item] } as Patch<WorkOrderDoc>)).after;
  }

  async setChecklistItem(ctx: RequestContext, id: string, itemId: string, done: boolean): Promise<WorkOrderDoc> {
    const before = await this.repo.get(ctx, id);
    if (!before.checklist.some((i) => i.itemId === itemId)) throw new BadRequestException("No such checklist item");
    const checklist = before.checklist.map((i) => (i.itemId === itemId ? { ...i, done } : i));
    return (await this.repo.update(ctx, id, { checklist } as Patch<WorkOrderDoc>)).after;
  }

  /** Completes the order and records its cost onto the asset's own history (blueprint §16: "asset history and costs updated"). */
  async complete(ctx: RequestContext, id: string, dto: CompleteWorkOrderDto): Promise<WorkOrderDoc> {
    const before = await this.repo.get(ctx, id);
    if (!["requested", "scheduled", "in_progress"].includes(before.status)) throw new BadRequestException(`A ${before.status} work order cannot be completed`);
    const downtimeMinutes = dto.downtimeMinutes ?? before.downtimeMinutes;
    const asset = await this.assets.repo.get(ctx, before.assetId);
    await this.assets.repo.update(ctx, before.assetId, {
      history: [...asset.history, { date: today(), event: "maintained", detail: `${before.code}: ${before.title}${before.totalCost ? ` (${(before.totalCost / 100).toFixed(2)})` : ""}`, journalId: null, by: ctx.userId }],
    });
    return (await this.repo.update(ctx, id, {
      status: "completed", completedAt: new Date().toISOString(), downtimeMinutes, notes: dto.notes ?? before.notes,
    } as Patch<WorkOrderDoc>)).after;
  }

  async cancel(ctx: RequestContext, id: string): Promise<WorkOrderDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status === "completed" || before.status === "cancelled") throw new BadRequestException(`Already ${before.status}`);
    return (await this.repo.update(ctx, id, { status: "cancelled" } as Patch<WorkOrderDoc>)).after;
  }

  protected searchEntry(doc: WorkOrderDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.title, subtitle: doc.status };
  }
}
