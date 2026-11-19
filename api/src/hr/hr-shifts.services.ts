import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { HR_COLLECTIONS } from "./hr.models.js";
import { CreateAssignmentDto, CreateShiftTemplateDto, UpdateAssignmentDto, UpdateShiftTemplateDto } from "./hr-shifts.dto.js";
import { SHIFT_COLLECTIONS, SHIFT_LISTS, ShiftAssignmentDoc, ShiftTemplateDoc, SwapRequest } from "./hr-shifts.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const isNightShift = (startTime: string, endTime: string) => endTime <= startTime;

@Injectable()
export class ShiftTemplateService extends MasterDataService<ShiftTemplateDoc, CreateShiftTemplateDto, UpdateShiftTemplateDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "hr", entity: "shiftTemplate", label: "Shift template", collection: SHIFT_COLLECTIONS.templates,
      route: "/hr/shift-templates", uniqueFields: ["code"], customFields: false,
    });
  }

  protected toNew(dto: CreateShiftTemplateDto): NewDoc<ShiftTemplateDoc> {
    return {
      code: dto.code, name: dto.name, startTime: dto.startTime, endTime: dto.endTime, isNightShift: isNightShift(dto.startTime, dto.endTime),
      breakMinutes: dto.breakMinutes ?? 0, color: orNull(dto.color), notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateShiftTemplateDto, before: ShiftTemplateDoc): Patch<ShiftTemplateDoc> {
    const startTime = dto.startTime ?? before.startTime;
    const endTime = dto.endTime ?? before.endTime;
    const patch = { ...dto } as Patch<ShiftTemplateDoc>;
    if (dto.startTime !== undefined || dto.endTime !== undefined) Object.assign(patch, { isNightShift: isNightShift(startTime, endTime) });
    return patch;
  }

  protected searchEntry(doc: ShiftTemplateDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: `${doc.startTime}–${doc.endTime}` };
  }
}

type AssignmentInput = CreateAssignmentDto & { built?: { startTime: string; endTime: string; isNightShift: boolean } };

@Injectable()
export class ShiftAssignmentService extends MasterDataService<ShiftAssignmentDoc, AssignmentInput, UpdateAssignmentDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly templates: ShiftTemplateService,
  ) {
    super(fs, audit, unique, {
      module: "hr", entity: "shiftAssignment", label: "Shift assignment", collection: SHIFT_COLLECTIONS.assignments,
      route: "/hr/shift-assignments", filterFields: SHIFT_LISTS.assignments.filters, large: SHIFT_LISTS.assignments,
      references: [
        { field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" },
        { field: "templateId", collection: SHIFT_COLLECTIONS.templates, label: "Shift template" },
      ],
      customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: CreateAssignmentDto): Promise<ShiftAssignmentDoc> {
    const template = await this.templates.get(ctx, dto.templateId);
    return super.create(ctx, { ...dto, built: { startTime: template.startTime, endTime: template.endTime, isNightShift: template.isNightShift } });
  }

  protected toNew(dto: AssignmentInput): NewDoc<ShiftAssignmentDoc> {
    const built = dto.built!;
    return {
      employeeId: dto.employeeId, date: dto.date.slice(0, 10), templateId: dto.templateId, startTime: built.startTime, endTime: built.endTime,
      isNightShift: built.isNightShift, isHoliday: dto.isHoliday ?? false, status: "scheduled", swap: null, notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateAssignmentDto): Patch<ShiftAssignmentDoc> {
    const { employeeId: _e, date: _d, templateId: _t, ...rest } = dto;
    return rest as Patch<ShiftAssignmentDoc>;
  }

  /** All assignments across every employee in the date range — the shift calendar. */
  async calendar(ctx: RequestContext, from: string, to: string): Promise<ShiftAssignmentDoc[]> {
    const snap = await this.repo.collection
      .where("companyId", "==", ctx.companyId).where("archived", "==", false)
      .where("date", ">=", from).where("date", "<=", to).orderBy("date", "desc").get();
    return snap.docs.map((d) => d.data()).reverse();
  }

  /** One employee's own assignments in the date range — self-service "my shifts". */
  async mySchedule(ctx: RequestContext, employeeId: string, from: string, to: string): Promise<ShiftAssignmentDoc[]> {
    const snap = await this.repo.collection
      .where("companyId", "==", ctx.companyId).where("archived", "==", false).where("employeeId", "==", employeeId)
      .where("date", ">=", from).where("date", "<=", to).orderBy("date", "desc").get();
    return snap.docs.map((d) => d.data()).reverse();
  }

  async requestSwap(ctx: RequestContext, id: string, employeeId: string, targetAssignmentId: string, note: string | undefined): Promise<ShiftAssignmentDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.employeeId !== employeeId) throw new ForbiddenException("This is not your shift");
    if (before.status !== "scheduled") throw new BadRequestException("Only a scheduled shift can be swapped");
    if (before.swap?.status === "pending") throw new BadRequestException("A swap request is already pending");
    if (targetAssignmentId === id) throw new BadRequestException("Choose a different shift to swap with");
    const target = await this.repo.get(ctx, targetAssignmentId);
    if (target.status !== "scheduled") throw new BadRequestException("That shift is not available to swap");
    if (target.employeeId === employeeId) throw new BadRequestException("That shift is already yours");
    const swap: SwapRequest = {
      requestedAt: new Date().toISOString(), requestedBy: ctx.userId, targetAssignmentId, targetEmployeeId: target.employeeId,
      note: orNull(note), status: "pending", decidedBy: null, decidedAt: null, decisionNote: null,
    };
    return (await this.repo.update(ctx, id, { swap } as Patch<ShiftAssignmentDoc>)).after;
  }

  async decideSwap(ctx: RequestContext, id: string, approve: boolean, note: string | undefined): Promise<ShiftAssignmentDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const own = await this.repo.get(ctx, id, tx);
      if (own.swap?.status !== "pending") throw new BadRequestException("No swap request is pending");
      const target = await this.repo.get(ctx, own.swap.targetAssignmentId, tx);
      const swap: SwapRequest = { ...own.swap, status: approve ? "approved" : "rejected", decidedBy: ctx.userId, decidedAt: new Date().toISOString(), decisionNote: orNull(note) };
      if (!approve) return this.repo.applyUpdate(ctx, tx, own, { swap } as Patch<ShiftAssignmentDoc>).after;
      if (target.status !== "scheduled") throw new BadRequestException("That shift is no longer available to swap");
      this.repo.applyUpdate(ctx, tx, target, { employeeId: own.employeeId, status: "swapped" } as Patch<ShiftAssignmentDoc>);
      return this.repo.applyUpdate(ctx, tx, own, { employeeId: target.employeeId, status: "swapped", swap } as Patch<ShiftAssignmentDoc>).after;
    });
  }

  async cancel(ctx: RequestContext, id: string, reason: string | undefined): Promise<ShiftAssignmentDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status === "cancelled") throw new BadRequestException("This shift is already cancelled");
    return (await this.repo.update(ctx, id, { status: "cancelled", notes: orNull(reason) ?? before.notes } as Patch<ShiftAssignmentDoc>)).after;
  }

  protected searchEntry(doc: ShiftAssignmentDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.date, subtitle: doc.status };
  }
}
