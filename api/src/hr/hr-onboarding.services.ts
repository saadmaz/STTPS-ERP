import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { HR_COLLECTIONS } from "./hr.models.js";
import { CreateChecklistDto, UpdateChecklistDto } from "./hr-onboarding.dto.js";
import { ChecklistDoc, ChecklistItem, ChecklistItemTemplate, ONBOARDING_COLLECTIONS, ONBOARDING_TEMPLATE, OFFBOARDING_TEMPLATE } from "./hr-onboarding.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class ChecklistService extends MasterDataService<ChecklistDoc, CreateChecklistDto, UpdateChecklistDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "hr", entity: "checklist", label: "Checklist", collection: ONBOARDING_COLLECTIONS.checklists,
      route: "/hr/checklists", filterFields: ["employeeId", "type", "status"],
      references: [{ field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" }],
      customFields: false,
    });
  }

  protected toNew(dto: CreateChecklistDto): NewDoc<ChecklistDoc> {
    const targetDate = dto.targetDate?.slice(0, 10) ?? null;
    const template: ChecklistItemTemplate[] = dto.items?.length ? dto.items : (dto.type === "onboarding" ? ONBOARDING_TEMPLATE : OFFBOARDING_TEMPLATE);
    const items: ChecklistItem[] = template.map((t) => ({
      itemId: randomUUID().slice(0, 8), title: t.title, category: t.category,
      assigneeUserId: orNull(t.assigneeUserId), dueDate: t.dueDate?.slice(0, 10) ?? targetDate,
      status: "pending", completedAt: null, completedBy: null, notes: null,
    }));
    return { employeeId: dto.employeeId, type: dto.type, startedAt: today(), targetDate, status: "in_progress", items, notes: orNull(dto.notes) };
  }

  protected toPatch(dto: UpdateChecklistDto, before: ChecklistDoc): Patch<ChecklistDoc> {
    if (before.status !== "in_progress") throw new BadRequestException(`This checklist is ${before.status}`);
    const { employeeId: _e, type: _t, items: _i, targetDate, ...rest } = dto;
    const patch = { ...rest } as Patch<ChecklistDoc>;
    if (targetDate !== undefined) Object.assign(patch, { targetDate: targetDate?.slice(0, 10) ?? null });
    return patch;
  }

  /**
   * Ensures an in-progress checklist of this type exists for the employee,
   * reusing one already running rather than failing — safe to call from
   * `hire()` and `terminate()` without special-case error handling.
   */
  async start(ctx: RequestContext, employeeId: string, type: ChecklistDoc["type"], targetDate: string | null): Promise<ChecklistDoc> {
    const all = await this.loadAll(ctx);
    const existing = all.find((c) => c.employeeId === employeeId && c.type === type && c.status === "in_progress");
    if (existing) return existing;
    return this.create(ctx, { employeeId, type, targetDate: targetDate ?? undefined } as CreateChecklistDto);
  }

  /** Marks an item done, skipped or back to pending; completes the checklist once nothing is left pending. */
  async setItemStatus(ctx: RequestContext, id: string, itemId: string, status: ChecklistItem["status"], notes: string | undefined): Promise<ChecklistDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status !== "in_progress") throw new BadRequestException(`This checklist is ${before.status}`);
    if (!before.items.some((i) => i.itemId === itemId)) throw new BadRequestException("Checklist item not found");
    const items = before.items.map((i) => (i.itemId === itemId
      ? { ...i, status, notes: notes ?? i.notes, completedAt: status === "pending" ? null : today(), completedBy: status === "pending" ? null : ctx.userId }
      : i));
    const patch: Patch<ChecklistDoc> = { items };
    if (items.every((i) => i.status !== "pending")) patch.status = "completed";
    return (await this.repo.update(ctx, id, patch)).after;
  }

  async assignItem(ctx: RequestContext, id: string, itemId: string, userId: string | null): Promise<ChecklistDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status !== "in_progress") throw new BadRequestException(`This checklist is ${before.status}`);
    if (!before.items.some((i) => i.itemId === itemId)) throw new BadRequestException("Checklist item not found");
    const items = before.items.map((i) => (i.itemId === itemId ? { ...i, assigneeUserId: userId } : i));
    return (await this.repo.update(ctx, id, { items } as Patch<ChecklistDoc>)).after;
  }

  async cancel(ctx: RequestContext, id: string, reason: string | undefined): Promise<ChecklistDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status !== "in_progress") throw new BadRequestException(`This checklist is already ${before.status}`);
    const notes = reason ? [before.notes, reason].filter(Boolean).join(" — ") : before.notes;
    return (await this.repo.update(ctx, id, { status: "cancelled", notes } as Patch<ChecklistDoc>)).after;
  }

  protected searchEntry(doc: ChecklistDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.type === "onboarding" ? "Onboarding" : "Offboarding"} checklist`, subtitle: doc.status };
  }
}
