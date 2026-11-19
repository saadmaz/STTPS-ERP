import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { PRODUCT_COLLECTIONS } from "../products/products.models.js";
import {
  AddNcrActionDto, CloseNcrDto, CompleteInspectionDto, CreateInspectionDto, CreateInspectionPlanDto,
  CreateNonConformanceDto, InspectionPlanItemDto, InspectionResponseDto, UpdateInspectionDto, UpdateInspectionPlanDto, UpdateNonConformanceDto,
} from "./quality.dto.js";
import {
  InspectionDoc, InspectionPlanDoc, InspectionPlanItem, InspectionResponse, NcrAction, NonConformanceDoc,
  QUALITY_COLLECTIONS, QUALITY_LISTS,
} from "./quality.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

@Injectable()
export class InspectionPlanService extends MasterDataService<InspectionPlanDoc, CreateInspectionPlanDto, UpdateInspectionPlanDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "quality", entity: "inspectionPlan", label: "Inspection plan", collection: QUALITY_COLLECTIONS.inspectionPlans,
      route: "/quality/inspection-plans", uniqueFields: ["code"], filterFields: ["stage", "productId", "isActive"],
      references: [{ field: "productId", collection: PRODUCT_COLLECTIONS.products, label: "Product" }], customFields: false,
    });
  }

  private item(dto: InspectionPlanItemDto): InspectionPlanItem {
    return {
      itemId: randomUUID().slice(0, 8), seq: dto.seq, question: dto.question, type: dto.type ?? "pass_fail",
      minValue: orNull(dto.minValue), maxValue: orNull(dto.maxValue), isRequired: dto.isRequired ?? true,
    };
  }

  protected toNew(dto: CreateInspectionPlanDto): NewDoc<InspectionPlanDoc> {
    return {
      code: dto.code, name: dto.name, stage: dto.stage, productId: orNull(dto.productId), sampleSize: orNull(dto.sampleSize),
      items: (dto.items ?? []).map((i) => this.item(i)), isActive: dto.isActive ?? true,
    };
  }

  protected toPatch(dto: UpdateInspectionPlanDto): Patch<InspectionPlanDoc> {
    const { items, ...rest } = dto;
    return { ...rest, ...(items ? { items: items.map((i) => this.item(i)) } : {}) } as Patch<InspectionPlanDoc>;
  }

  protected searchEntry(doc: InspectionPlanDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code };
  }
}

@Injectable()
export class InspectionService extends MasterDataService<InspectionDoc, CreateInspectionDto & { plan?: InspectionPlanDoc }, UpdateInspectionDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly plans: InspectionPlanService) {
    super(fs, audit, unique, {
      module: "quality", entity: "inspection", label: "Inspection", collection: QUALITY_COLLECTIONS.inspections,
      route: "/quality/inspections", large: QUALITY_LISTS.inspections, filterFields: ["status", "stage", "planId", "productId"],
      references: [
        { field: "planId", collection: QUALITY_COLLECTIONS.inspectionPlans, label: "Inspection plan" },
        { field: "productId", collection: PRODUCT_COLLECTIONS.products, label: "Product" },
      ],
      numbering: { field: "number", key: "qualityInspection", prefix: "QI", yearly: true }, customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: CreateInspectionDto): Promise<InspectionDoc> {
    const plan = await this.plans.repo.get(ctx, dto.planId);
    if (!plan.isActive) throw new BadRequestException("That inspection plan is not active");
    return super.create(ctx, { ...dto, plan });
  }

  protected toNew(dto: CreateInspectionDto & { plan: InspectionPlanDoc }): NewDoc<InspectionDoc> {
    return {
      number: "", planId: dto.planId, stage: dto.plan.stage, productId: orNull(dto.productId ?? dto.plan.productId ?? undefined),
      status: "planned", scheduledAt: orNull(dto.scheduledAt), conductedAt: null, conductedBy: null,
      qtyInspected: orNull(dto.qtyInspected), qtySampled: orNull(dto.qtySampled ?? dto.plan.sampleSize ?? undefined), qtyRejected: null,
      responses: [], overallResult: null, findings: null, notes: orNull(dto.notes),
    };
  }

  async complete(ctx: RequestContext, id: string, dto: CompleteInspectionDto): Promise<InspectionDoc> {
    const inspection = await this.repo.get(ctx, id);
    if (!["planned", "in_progress"].includes(inspection.status)) throw new BadRequestException(`A ${inspection.status} inspection cannot be completed`);
    const plan = await this.plans.repo.get(ctx, inspection.planId);
    const responses = this.responses(dto.responses);
    const overallResult = dto.overallResult ?? deriveResult(plan.items, responses);
    return (
      await this.repo.update(ctx, id, {
        status: "completed", conductedAt: new Date().toISOString(), conductedBy: ctx.userId,
        responses, qtyRejected: orNull(dto.qtyRejected), findings: orNull(dto.findings), overallResult,
      } as Patch<InspectionDoc>)
    ).after;
  }

  async cancel(ctx: RequestContext, id: string): Promise<InspectionDoc> {
    const inspection = await this.repo.get(ctx, id);
    if (!["planned", "in_progress"].includes(inspection.status)) throw new BadRequestException(`A ${inspection.status} inspection cannot be cancelled`);
    return (await this.repo.update(ctx, id, { status: "cancelled" } as Patch<InspectionDoc>)).after;
  }

  private responses(dto: InspectionResponseDto[] | undefined): InspectionResponse[] {
    return (dto ?? []).map((r) => ({ itemId: r.itemId, result: r.result, numericValue: orNull(r.numericValue), textValue: orNull(r.textValue), notes: orNull(r.notes) }));
  }

  protected searchEntry(doc: InspectionDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: doc.status };
  }
}

/** Fails overall when a required item either failed or was never answered. */
function deriveResult(items: InspectionPlanItem[], responses: InspectionResponse[]): "pass" | "fail" {
  const byItem = new Map(responses.map((r) => [r.itemId, r]));
  const failed = items.some((i) => i.isRequired && (byItem.get(i.itemId)?.result ?? "fail") === "fail");
  return failed ? "fail" : "pass";
}

@Injectable()
export class NonConformanceService extends MasterDataService<NonConformanceDoc, CreateNonConformanceDto, UpdateNonConformanceDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "quality", entity: "nonConformance", label: "Non-conformance", collection: QUALITY_COLLECTIONS.nonConformances,
      route: "/quality/non-conformances", filterFields: ["status", "severity", "productId"],
      references: [
        { field: "inspectionId", collection: QUALITY_COLLECTIONS.inspections, label: "Inspection" },
        { field: "productId", collection: PRODUCT_COLLECTIONS.products, label: "Product" },
      ],
      numbering: { field: "number", key: "ncr", prefix: "NCR", yearly: true }, customFields: false,
    });
  }

  protected toNew(dto: CreateNonConformanceDto, ctx: RequestContext): NewDoc<NonConformanceDoc> {
    return {
      number: "", title: dto.title, description: dto.description, severity: dto.severity ?? "minor", status: "open",
      inspectionId: orNull(dto.inspectionId), productId: orNull(dto.productId), raisedBy: ctx.userId, dueDate: orNull(dto.dueDate),
      actions: [], resolution: null, closedAt: null,
    };
  }

  async addAction(ctx: RequestContext, id: string, dto: AddNcrActionDto): Promise<NonConformanceDoc> {
    const ncr = await this.repo.get(ctx, id);
    if (ncr.status === "closed") throw new BadRequestException("This non-conformance is closed");
    const action: NcrAction = { actionId: randomUUID().slice(0, 8), type: dto.type, description: dto.description, assignedTo: dto.assignedTo, dueDate: orNull(dto.dueDate), status: "open", completedAt: null };
    return (await this.repo.update(ctx, id, { actions: [...ncr.actions, action], status: "in_progress" } as Patch<NonConformanceDoc>)).after;
  }

  async completeAction(ctx: RequestContext, id: string, actionId: string): Promise<NonConformanceDoc> {
    const ncr = await this.repo.get(ctx, id);
    if (!ncr.actions.some((a) => a.actionId === actionId)) throw new NotFoundException(`No action ${actionId} on this non-conformance`);
    const actions = ncr.actions.map((a) => (a.actionId === actionId ? { ...a, status: "done" as const, completedAt: new Date().toISOString() } : a));
    return (await this.repo.update(ctx, id, { actions } as Patch<NonConformanceDoc>)).after;
  }

  async close(ctx: RequestContext, id: string, dto: CloseNcrDto): Promise<NonConformanceDoc> {
    const ncr = await this.repo.get(ctx, id);
    if (ncr.status === "closed") throw new BadRequestException("Already closed");
    return (await this.repo.update(ctx, id, { status: "closed", resolution: orNull(dto.resolution), closedAt: new Date().toISOString() } as Patch<NonConformanceDoc>)).after;
  }

  protected searchEntry(doc: NonConformanceDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.number} · ${doc.title}`, subtitle: doc.severity };
  }
}
