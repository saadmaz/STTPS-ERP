import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Page, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { HR_COLLECTIONS } from "./hr.models.js";
import {
  CreateDevelopmentPlanDto,
  CreateGoalDto,
  CreatePerformanceCycleDto,
  CreateReviewDto,
  SelfReviewDto,
  UpdateDevelopmentPlanDto,
  UpdateGoalDto,
  UpdatePerformanceCycleDto,
  UpdateReviewDto,
} from "./hr-performance.dto.js";
import { DevelopmentPlanDoc, GoalDoc, PERFORMANCE_COLLECTIONS, PERFORMANCE_LISTS, PerformanceCycleDoc, ReviewDoc } from "./hr-performance.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

@Injectable()
export class PerformanceCycleService extends MasterDataService<PerformanceCycleDoc, CreatePerformanceCycleDto, UpdatePerformanceCycleDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, { module: "hr", entity: "performanceCycle", label: "Performance cycle", collection: PERFORMANCE_COLLECTIONS.cycles, route: "/hr/performance-cycles", uniqueFields: ["code"], customFields: false });
  }

  protected toNew(dto: CreatePerformanceCycleDto): NewDoc<PerformanceCycleDoc> {
    return { code: dto.code, name: dto.name, startDate: dto.startDate.slice(0, 10), endDate: dto.endDate.slice(0, 10), status: dto.status ?? "draft", description: orNull(dto.description) };
  }

  protected searchEntry(doc: PerformanceCycleDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code };
  }
}

// ─── Goals ───────────────────────────────────────────────────────────────────

@Injectable()
export class GoalService extends MasterDataService<GoalDoc, CreateGoalDto, UpdateGoalDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly cycles: PerformanceCycleService) {
    super(fs, audit, unique, {
      module: "hr", entity: "goal", label: "Goal", collection: PERFORMANCE_COLLECTIONS.goals, route: "/hr/goals",
      filterFields: [...PERFORMANCE_LISTS.goals.filters, "cycleId", "status"], large: PERFORMANCE_LISTS.goals,
      references: [{ field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" }, { field: "cycleId", collection: PERFORMANCE_COLLECTIONS.cycles, label: "Performance cycle" }],
      customFields: false,
    });
  }

  private async assertCycleOpen(ctx: RequestContext, cycleId: string): Promise<void> {
    const cycle = await this.cycles.get(ctx, cycleId);
    if (cycle.status === "closed") throw new BadRequestException("This performance cycle is closed");
  }

  async create(ctx: RequestContext, dto: CreateGoalDto): Promise<GoalDoc> {
    await this.assertCycleOpen(ctx, dto.cycleId);
    return super.create(ctx, dto);
  }

  protected toNew(dto: CreateGoalDto): NewDoc<GoalDoc> {
    return {
      employeeId: dto.employeeId, cycleId: dto.cycleId, title: dto.title, description: orNull(dto.description), type: dto.type ?? "goal",
      weight: dto.weight ?? null, targetValue: orNull(dto.targetValue), currentValue: null, status: "not_started", dueDate: dto.dueDate?.slice(0, 10) ?? null,
    };
  }

  protected toPatch(dto: UpdateGoalDto): Patch<GoalDoc> {
    const { employeeId: _e, cycleId: _c, dueDate, ...rest } = dto;
    const patch = { ...rest } as Patch<GoalDoc>;
    if (dueDate !== undefined) Object.assign(patch, { dueDate: dueDate?.slice(0, 10) ?? null });
    return patch;
  }

  /** `employeeId` scopes the update to the caller's own goal (self-service); `null` is an HR/manager edit. */
  async updateProgress(ctx: RequestContext, id: string, employeeId: string | null, status: GoalDoc["status"], currentValue: string | undefined): Promise<GoalDoc> {
    const before = await this.repo.get(ctx, id);
    if (employeeId && before.employeeId !== employeeId) throw new ForbiddenException("This is not your goal");
    return (await this.repo.update(ctx, id, { status, currentValue: orNull(currentValue) } as Patch<GoalDoc>)).after;
  }

  async forEmployee(ctx: RequestContext, employeeId: string): Promise<Page<GoalDoc>> {
    return this.list(ctx, { where: `employeeId:${employeeId}`, limit: 200 });
  }

  protected searchEntry(doc: GoalDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.title, subtitle: doc.status };
  }
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReviewService extends MasterDataService<ReviewDoc, CreateReviewDto, UpdateReviewDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly cycles: PerformanceCycleService) {
    super(fs, audit, unique, {
      module: "hr", entity: "review", label: "Review", collection: PERFORMANCE_COLLECTIONS.reviews, route: "/hr/reviews",
      filterFields: [...PERFORMANCE_LISTS.reviews.filters, "cycleId", "type"], large: PERFORMANCE_LISTS.reviews,
      references: [{ field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" }, { field: "cycleId", collection: PERFORMANCE_COLLECTIONS.cycles, label: "Performance cycle" }],
      customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: CreateReviewDto): Promise<ReviewDoc> {
    const cycle = await this.cycles.get(ctx, dto.cycleId);
    if (cycle.status === "closed") throw new BadRequestException("This performance cycle is closed");
    return super.create(ctx, dto);
  }

  protected toNew(dto: CreateReviewDto & { reviewerId?: string; type?: ReviewDoc["type"] }, ctx: RequestContext): NewDoc<ReviewDoc> {
    return {
      employeeId: dto.employeeId, cycleId: dto.cycleId, reviewerId: dto.reviewerId ?? ctx.userId, type: dto.type ?? "manager", rating: dto.rating ?? null,
      strengths: orNull(dto.strengths), improvements: orNull(dto.improvements), comments: orNull(dto.comments), recommendsPromotion: dto.recommendsPromotion ?? false,
      promotionNote: orNull(dto.promotionNote), status: "draft", submittedAt: null,
    };
  }

  protected toPatch(dto: UpdateReviewDto): Patch<ReviewDoc> {
    const { employeeId: _e, cycleId: _c, type: _t, ...rest } = dto;
    return rest as Patch<ReviewDoc>;
  }

  async submit(ctx: RequestContext, id: string): Promise<ReviewDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status === "submitted") throw new BadRequestException("This review is already submitted");
    return (await this.repo.update(ctx, id, { status: "submitted", submittedAt: new Date().toISOString() } as Patch<ReviewDoc>)).after;
  }

  /** Creates or updates (while still a draft) the caller's own self-review for the cycle, then submits it. */
  async submitSelfReview(ctx: RequestContext, employeeId: string, dto: SelfReviewDto): Promise<ReviewDoc> {
    const cycle = await this.cycles.get(ctx, dto.cycleId);
    if (cycle.status === "closed") throw new BadRequestException("This performance cycle is closed");
    const existing = (await this.forEmployee(ctx, employeeId, dto.cycleId, "self")).find((r) => r.reviewerId === employeeId);
    if (existing?.status === "submitted") throw new BadRequestException("You have already submitted a self-assessment for this cycle");
    const fields = { rating: dto.rating ?? null, strengths: orNull(dto.strengths), improvements: orNull(dto.improvements), comments: orNull(dto.comments) };
    const saved = existing
      ? (await this.repo.update(ctx, existing.id, fields as Patch<ReviewDoc>)).after
      : await super.create(ctx, { employeeId, cycleId: dto.cycleId, reviewerId: employeeId, type: "self", ...fields } as unknown as CreateReviewDto);
    return this.submit(ctx, saved.id);
  }

  async forEmployee(ctx: RequestContext, employeeId: string, cycleId?: string, type?: ReviewDoc["type"]): Promise<ReviewDoc[]> {
    const page = await this.list(ctx, { where: `employeeId:${employeeId}`, limit: 200 });
    return page.items.filter((r) => (!cycleId || r.cycleId === cycleId) && (!type || r.type === type));
  }

  /** Submitted reviews about me; a manager's or peer's unfinished draft stays hidden until they submit it. */
  async aboutMeSubmitted(ctx: RequestContext, employeeId: string): Promise<ReviewDoc[]> {
    const all = await this.forEmployee(ctx, employeeId);
    return all.filter((r) => r.status === "submitted");
  }

  protected searchEntry(doc: ReviewDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.type} review`, subtitle: doc.status };
  }
}

// ─── Development plans ───────────────────────────────────────────────────────

@Injectable()
export class DevelopmentPlanService extends MasterDataService<DevelopmentPlanDoc, CreateDevelopmentPlanDto, UpdateDevelopmentPlanDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "hr", entity: "developmentPlan", label: "Development plan", collection: PERFORMANCE_COLLECTIONS.developmentPlans, route: "/hr/development-plans",
      filterFields: ["employeeId", "status"], references: [{ field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" }], customFields: false,
    });
  }

  protected toNew(dto: CreateDevelopmentPlanDto): NewDoc<DevelopmentPlanDoc> {
    return {
      employeeId: dto.employeeId, cycleId: orNull(dto.cycleId), title: dto.title, focusAreas: orNull(dto.focusAreas), actions: orNull(dto.actions),
      targetDate: dto.targetDate?.slice(0, 10) ?? null, status: dto.status ?? "active", notes: orNull(dto.notes),
    };
  }

  async forEmployee(ctx: RequestContext, employeeId: string): Promise<DevelopmentPlanDoc[]> {
    const all = await this.loadAll(ctx);
    return all.filter((p) => p.employeeId === employeeId);
  }

  protected searchEntry(doc: DevelopmentPlanDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.title, subtitle: doc.status };
  }
}
