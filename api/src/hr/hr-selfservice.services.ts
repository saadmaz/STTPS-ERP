import { BadRequestException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { HR_COLLECTIONS } from "./hr.models.js";
import { CreateAnnouncementDto, CreateEquipmentRequestDto, CreateHrRequestDto, UpdateAnnouncementDto, UpdateEquipmentRequestDto, UpdateHrRequestDto } from "./hr-selfservice.dto.js";
import { AnnouncementDoc, EquipmentRequestDoc, HrRequestDoc, SELF_SERVICE_COLLECTIONS } from "./hr-selfservice.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

@Injectable()
export class AnnouncementService extends MasterDataService<AnnouncementDoc, CreateAnnouncementDto, UpdateAnnouncementDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, { module: "hr", entity: "announcement", label: "Announcement", collection: SELF_SERVICE_COLLECTIONS.announcements, route: "/hr/announcements", customFields: false });
  }

  protected toNew(dto: CreateAnnouncementDto): NewDoc<AnnouncementDoc> {
    return { title: dto.title, body: dto.body, isPublished: dto.isPublished ?? true, expiresAt: orNull(dto.expiresAt) };
  }

  /** Published and not yet expired, for the self-service feed. */
  async active(ctx: RequestContext): Promise<AnnouncementDoc[]> {
    const all = await this.loadAll(ctx);
    const now = new Date().toISOString();
    return all.filter((a) => a.isPublished && (!a.expiresAt || a.expiresAt > now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  protected searchEntry(doc: AnnouncementDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.title, subtitle: doc.isPublished ? "Published" : "Draft" };
  }
}

@Injectable()
export class HrRequestService extends MasterDataService<HrRequestDoc, CreateHrRequestDto, UpdateHrRequestDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "hr", entity: "hrRequest", label: "HR request", collection: SELF_SERVICE_COLLECTIONS.requests, route: "/hr/requests",
      filterFields: ["employeeId", "status", "type"], references: [{ field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" }], customFields: false,
    });
  }

  protected toNew(dto: CreateHrRequestDto): NewDoc<HrRequestDoc> {
    return { employeeId: dto.employeeId, type: dto.type, subject: dto.subject, description: orNull(dto.description), status: "open", resolution: null, resolvedAt: null, resolvedBy: null };
  }

  async decide(ctx: RequestContext, id: string, status: HrRequestDoc["status"], resolution: string | undefined): Promise<HrRequestDoc> {
    const before = await this.repo.get(ctx, id);
    const patch: Patch<HrRequestDoc> = { status };
    if (status === "resolved" || status === "closed") Object.assign(patch, { resolution: orNull(resolution) ?? before.resolution, resolvedAt: new Date().toISOString(), resolvedBy: ctx.userId });
    return (await this.repo.update(ctx, id, patch)).after;
  }

  async forEmployee(ctx: RequestContext, employeeId: string) {
    return this.list(ctx, { where: `employeeId:${employeeId}`, limit: 100 });
  }

  protected searchEntry(doc: HrRequestDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.subject, subtitle: doc.status };
  }
}

@Injectable()
export class EquipmentRequestService extends MasterDataService<EquipmentRequestDoc, CreateEquipmentRequestDto, UpdateEquipmentRequestDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "hr", entity: "equipmentRequest", label: "Equipment request", collection: SELF_SERVICE_COLLECTIONS.equipmentRequests, route: "/hr/equipment-requests",
      filterFields: ["employeeId", "status"], references: [{ field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" }], customFields: false,
    });
  }

  protected toNew(dto: CreateEquipmentRequestDto): NewDoc<EquipmentRequestDoc> {
    return { employeeId: dto.employeeId, itemDescription: dto.itemDescription, reason: orNull(dto.reason), status: "pending", decidedBy: null, decidedAt: null, decisionNote: null };
  }

  async decide(ctx: RequestContext, id: string, approve: boolean, note: string | undefined): Promise<EquipmentRequestDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status !== "pending") throw new BadRequestException("This request is not pending");
    return (await this.repo.update(ctx, id, { status: approve ? "approved" : "rejected", decidedBy: ctx.userId, decidedAt: new Date().toISOString(), decisionNote: orNull(note) } as Patch<EquipmentRequestDoc>)).after;
  }

  async fulfill(ctx: RequestContext, id: string, note: string | undefined): Promise<EquipmentRequestDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status !== "approved") throw new BadRequestException("Only an approved request can be marked fulfilled");
    return (await this.repo.update(ctx, id, { status: "fulfilled", decisionNote: orNull(note) ?? before.decisionNote } as Patch<EquipmentRequestDoc>)).after;
  }

  async forEmployee(ctx: RequestContext, employeeId: string) {
    return this.list(ctx, { where: `employeeId:${employeeId}`, limit: 100 });
  }

  protected searchEntry(doc: EquipmentRequestDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.itemDescription, subtitle: doc.status };
  }
}
