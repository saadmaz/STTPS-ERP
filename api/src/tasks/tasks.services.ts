import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { toQty } from "../platform/data/money.js";
import { NewDoc, Page, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { CreateTaskDto, CreateTimeEntryDto, UpdateTaskDto, UpdateTimeEntryDto } from "./tasks.dto.js";
import { ChecklistItem, TASK_COLLECTIONS, TASK_LISTS, TaskDoc, TimeEntryDoc } from "./tasks.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const toMinor2 = (v: string) => Math.round(Number(v) * 100);

function nextDueDate(from: string, frequency: "daily" | "weekly" | "monthly", interval: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  if (frequency === "daily") d.setUTCDate(d.getUTCDate() + interval);
  else if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7 * interval);
  else d.setUTCMonth(d.getUTCMonth() + interval);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class TaskService extends MasterDataService<TaskDoc, CreateTaskDto, UpdateTaskDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "tasks", entity: "task", label: "Task", collection: TASK_COLLECTIONS.tasks, route: "/tasks",
      filterFields: [...TASK_LISTS.tasks.filters, "projectId", "status", "priority"], large: TASK_LISTS.tasks, customFields: false,
    });
  }

  protected toNew(dto: CreateTaskDto, ctx: RequestContext): NewDoc<TaskDoc> {
    return {
      title: dto.title, description: orNull(dto.description), projectId: orNull(dto.projectId), ownerId: ctx.userId, assigneeId: orNull(dto.assigneeId),
      collaboratorIds: dto.collaboratorIds ?? [], priority: dto.priority ?? "medium", status: "todo", dueDate: dto.dueDate?.slice(0, 10) ?? null,
      estimatedHours: dto.estimatedHours ?? null, actualHours: 0, parentTaskId: orNull(dto.parentTaskId), dependsOnTaskIds: dto.dependsOnTaskIds ?? [],
      checklist: [], tags: dto.tags ?? [], recurrence: dto.recurrence ? { frequency: dto.recurrence.frequency, interval: dto.recurrence.interval ?? 1, until: dto.recurrence.until ?? null } : null,
      reminderAt: orNull(dto.reminderAt), completedAt: null,
    };
  }

  protected toPatch(dto: UpdateTaskDto): Patch<TaskDoc> {
    const { dueDate, recurrence, ...rest } = dto;
    const patch = { ...rest } as Patch<TaskDoc>;
    if (dueDate !== undefined) Object.assign(patch, { dueDate: dueDate?.slice(0, 10) ?? null });
    if (recurrence !== undefined) Object.assign(patch, { recurrence: recurrence ? { frequency: recurrence.frequency, interval: recurrence.interval ?? 1, until: recurrence.until ?? null } : null });
    return patch;
  }

  /** Tasks assigned to me (indexed), plus tasks I created or am a collaborator on that aren't already in that set (an in-memory scan, since neither is indexed). */
  async forUser(ctx: RequestContext, userId: string): Promise<TaskDoc[]> {
    const mine = await this.list(ctx, { where: `assigneeId:${userId}`, limit: 200 });
    const all = await this.loadAll(ctx);
    const others = all.filter((t) => t.assigneeId !== userId && (t.ownerId === userId || t.collaboratorIds.includes(userId)));
    return [...mine.items, ...others];
  }

  async forProject(ctx: RequestContext, projectId: string): Promise<TaskDoc[]> {
    const all = await this.loadAll(ctx);
    return all.filter((t) => t.projectId === projectId);
  }

  async subtasksOf(ctx: RequestContext, parentTaskId: string): Promise<TaskDoc[]> {
    const all = await this.loadAll(ctx);
    return all.filter((t) => t.parentTaskId === parentTaskId);
  }

  /** Moves status; completing a recurring task creates its next occurrence. */
  async setStatus(ctx: RequestContext, id: string, status: TaskDoc["status"]): Promise<TaskDoc> {
    const before = await this.repo.get(ctx, id);
    const patch: Patch<TaskDoc> = { status };
    if (status === "completed" && before.status !== "completed") Object.assign(patch, { completedAt: new Date().toISOString() });
    if (status !== "completed") Object.assign(patch, { completedAt: null });
    const after = (await this.repo.update(ctx, id, patch)).after;

    if (status === "completed" && before.status !== "completed" && before.recurrence) {
      const due = nextDueDate(before.dueDate ?? new Date().toISOString().slice(0, 10), before.recurrence.frequency, before.recurrence.interval);
      if (!before.recurrence.until || due <= before.recurrence.until) {
        await this.create(ctx, {
          title: before.title, description: before.description ?? undefined, projectId: before.projectId ?? undefined, assigneeId: before.assigneeId ?? undefined,
          collaboratorIds: before.collaboratorIds, priority: before.priority, dueDate: due, estimatedHours: before.estimatedHours ?? undefined,
          tags: before.tags, recurrence: { frequency: before.recurrence.frequency, interval: before.recurrence.interval, until: before.recurrence.until ?? undefined },
        });
      }
    }
    return after;
  }

  async addChecklistItem(ctx: RequestContext, id: string, text: string): Promise<TaskDoc> {
    const before = await this.repo.get(ctx, id);
    const item: ChecklistItem = { itemId: randomUUID().slice(0, 8), text, done: false };
    return (await this.repo.update(ctx, id, { checklist: [...before.checklist, item] } as Patch<TaskDoc>)).after;
  }

  async setChecklistItem(ctx: RequestContext, id: string, itemId: string, done: boolean): Promise<TaskDoc> {
    const before = await this.repo.get(ctx, id);
    if (!before.checklist.some((i) => i.itemId === itemId)) throw new BadRequestException("No such checklist item");
    const checklist = before.checklist.map((i) => (i.itemId === itemId ? { ...i, done } : i));
    return (await this.repo.update(ctx, id, { checklist } as Patch<TaskDoc>)).after;
  }

  /** Recomputes `actualHours` from this task's time entries; called whenever one changes. */
  async recomputeActualHours(ctx: RequestContext, taskId: string, entries: TimeEntryDoc[]): Promise<void> {
    const actualHours = entries.filter((e) => e.taskId === taskId).reduce((a, e) => a + e.hours, 0);
    await this.repo.update(ctx, taskId, { actualHours } as Patch<TaskDoc>);
  }

  protected searchEntry(doc: TaskDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.title, subtitle: doc.status };
  }
}

@Injectable()
export class TimeEntryService extends MasterDataService<TimeEntryDoc, CreateTimeEntryDto, UpdateTimeEntryDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly tasks: TaskService) {
    super(fs, audit, unique, {
      module: "tasks", entity: "timeEntry", label: "Time entry", collection: TASK_COLLECTIONS.timeEntries, route: "/tasks/time-entries",
      filterFields: [...TASK_LISTS.timeEntries.filters, "taskId", "projectId", "approved"], large: TASK_LISTS.timeEntries, customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: CreateTimeEntryDto): Promise<TimeEntryDoc> {
    const created = await super.create(ctx, dto);
    if (created.taskId) await this.resync(ctx, created.taskId);
    return created;
  }

  protected toNew(dto: CreateTimeEntryDto): NewDoc<TimeEntryDoc> {
    return {
      userId: dto.userId, taskId: orNull(dto.taskId), projectId: orNull(dto.projectId), date: dto.date.slice(0, 10), hours: toQty(dto.hours),
      billable: dto.billable ?? true, approved: false, cost: dto.cost !== undefined ? toMinor2(dto.cost) : null, description: orNull(dto.description),
    };
  }

  async approve(ctx: RequestContext, id: string, approve: boolean): Promise<TimeEntryDoc> {
    return (await this.repo.update(ctx, id, { approved: approve } as Patch<TimeEntryDoc>)).after;
  }

  async forUser(ctx: RequestContext, userId: string): Promise<Page<TimeEntryDoc>> {
    return this.list(ctx, { where: `userId:${userId}`, limit: 200 });
  }

  async forProject(ctx: RequestContext, projectId: string): Promise<TimeEntryDoc[]> {
    const all = await this.loadAll(ctx);
    return all.filter((e) => e.projectId === projectId);
  }

  private async resync(ctx: RequestContext, taskId: string): Promise<void> {
    const all = await this.loadAll(ctx);
    await this.tasks.recomputeActualHours(ctx, taskId, all);
  }

  protected searchEntry(doc: TimeEntryDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.date, subtitle: `${(doc.hours / 1000).toFixed(2)}h` };
  }
}
