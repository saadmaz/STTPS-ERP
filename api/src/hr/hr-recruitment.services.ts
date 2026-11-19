import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FirestoreService } from "../firestore/firestore.service.js";
import { COLLECTIONS } from "../firestore/collections.js";
import { CompanyDoc } from "../firestore/models.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, systemContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { toMinor } from "../platform/data/money.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { APPROVAL_COMPLETED, ApprovalCompletedPayload } from "../platform/approvals/approvals.models.js";
import { ApprovalsService } from "../platform/approvals/approvals.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { ORG_COLLECTIONS } from "../org/org.models.js";
import { HR_COLLECTIONS } from "./hr.models.js";
import { EmployeeService } from "./hr.services.js";
import {
  CreateCandidateDto,
  CreateJobPostingDto,
  CreateJobRequisitionDto,
  ExtendOfferDto,
  PublicApplyDto,
  RecordScorecardDto,
  ScheduleInterviewDto,
  UpdateCandidateDto,
  UpdateJobPostingDto,
  UpdateJobRequisitionDto,
} from "./hr-recruitment.dto.js";
import { CandidateDoc, InterviewEntry, JobPostingDoc, JobRequisitionDoc, Offer, RECRUITMENT_COLLECTIONS, RECRUITMENT_LISTS } from "./hr-recruitment.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);
const LOCKED_STAGES = new Set(["hired", "rejected"]);
const blankOffer = (): Offer => ({ salary: null, currency: "LKR", startDate: null, status: "none", extendedAt: null, notes: null });

// ─── Job requisitions ──────────────────────────────────────────────────────────

@Injectable()
export class JobRequisitionService extends MasterDataService<JobRequisitionDoc, CreateJobRequisitionDto, UpdateJobRequisitionDto> implements OnModuleInit {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly approvals: ApprovalsService,
    private readonly events: EventBusService,
  ) {
    super(fs, audit, unique, {
      module: "hr", entity: "jobRequisition", label: "Job requisition", collection: RECRUITMENT_COLLECTIONS.requisitions,
      route: "/hr/requisitions", filterFields: ["status", "positionId", "departmentId"],
      references: [
        { field: "positionId", collection: HR_COLLECTIONS.positions, label: "Position" },
        { field: "departmentId", collection: ORG_COLLECTIONS.departments, label: "Department" },
        { field: "branchId", collection: ORG_COLLECTIONS.branches, label: "Branch" },
      ],
      numbering: { field: "number", key: "jobRequisition", prefix: "REQ" },
      customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "hr.requisitionApproval", async (event) => {
      if (event.payload.entityType !== this.entityType) return;
      const ctx = systemContext(event, event.payload.decidedBy);
      const doc = await this.repo.find(ctx, event.payload.entityId);
      if (doc?.status !== "pending_approval") return;
      const status = event.payload.outcome === "approved" ? "approved" : event.payload.outcome === "rejected" ? "rejected" : "draft";
      await this.repo.update(ctx, doc.id, { status });
    });
  }

  protected toNew(dto: CreateJobRequisitionDto): NewDoc<JobRequisitionDoc> {
    const currency = dto.currency ?? "LKR";
    return {
      number: "", positionId: dto.positionId, departmentId: orNull(dto.departmentId), branchId: orNull(dto.branchId),
      openings: dto.openings ?? 1, filledCount: 0, justification: dto.justification, hiringManagerId: orNull(dto.hiringManagerId), currency,
      targetSalaryMin: dto.targetSalaryMin ? toMinor(dto.targetSalaryMin, currency) : null, targetSalaryMax: dto.targetSalaryMax ? toMinor(dto.targetSalaryMax, currency) : null,
      status: "draft", notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateJobRequisitionDto, before: JobRequisitionDoc): Patch<JobRequisitionDoc> {
    if (!["draft", "rejected"].includes(before.status)) throw new BadRequestException("Only a draft or rejected requisition can be changed");
    const { targetSalaryMin, targetSalaryMax, ...rest } = dto;
    const currency = dto.currency ?? before.currency;
    const patch = { ...rest } as Patch<JobRequisitionDoc>;
    if (targetSalaryMin !== undefined) Object.assign(patch, { targetSalaryMin: targetSalaryMin ? toMinor(targetSalaryMin, currency) : null });
    if (targetSalaryMax !== undefined) Object.assign(patch, { targetSalaryMax: targetSalaryMax ? toMinor(targetSalaryMax, currency) : null });
    return patch;
  }

  /** Sends the requisition for hiring approval (or approves it at once when no workflow applies). */
  async submit(ctx: RequestContext, id: string): Promise<JobRequisitionDoc> {
    const doc = await this.repo.get(ctx, id);
    if (!["draft", "rejected"].includes(doc.status)) throw new BadRequestException("Only a draft or rejected requisition can be submitted");
    const prepared = await this.approvals.prepare(ctx, {
      entityType: this.entityType,
      entityId: id,
      entityLabel: `${doc.number} · ${doc.openings} opening(s)`,
      link: `/hr/requisitions/${id}`,
      facts: { amount: (doc.targetSalaryMax ?? 0) * doc.openings, departmentId: doc.departmentId, branchId: doc.branchId, openings: doc.openings },
    });
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const request = await this.approvals.open(tx, ctx, prepared);
      return this.repo.applyUpdate(ctx, tx, before, { status: request.status === "approved" ? "approved" : "pending_approval" }).after;
    });
  }

  async cancel(ctx: RequestContext, id: string): Promise<JobRequisitionDoc> {
    const doc = await this.repo.get(ctx, id);
    if (["closed", "cancelled"].includes(doc.status)) throw new BadRequestException(`This requisition is ${doc.status}`);
    if (doc.status === "pending_approval") throw new BadRequestException("Withdraw the approval request first");
    return (await this.repo.update(ctx, id, { status: "cancelled" })).after;
  }

  protected searchEntry(doc: JobRequisitionDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: `${doc.openings} opening(s)` };
  }
}

// ─── Job postings ──────────────────────────────────────────────────────────────

@Injectable()
export class JobPostingService extends MasterDataService<JobPostingDoc, CreateJobPostingDto, UpdateJobPostingDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly requisitions: JobRequisitionService) {
    super(fs, audit, unique, {
      module: "hr", entity: "jobPosting", label: "Job posting", collection: RECRUITMENT_COLLECTIONS.postings,
      route: "/hr/postings", filterFields: ["status", "requisitionId"],
      references: [{ field: "requisitionId", collection: RECRUITMENT_COLLECTIONS.requisitions, label: "Job requisition" }],
      customFields: false,
    });
  }

  protected toNew(dto: CreateJobPostingDto): NewDoc<JobPostingDoc> {
    return {
      requisitionId: dto.requisitionId, title: dto.title, description: dto.description, location: orNull(dto.location),
      employmentType: dto.employmentType ?? "full_time", status: "draft", publishedAt: null, closedAt: null,
    };
  }

  protected toPatch(dto: UpdateJobPostingDto, before: JobPostingDoc): Patch<JobPostingDoc> {
    if (before.status === "closed") throw new BadRequestException("A closed posting cannot be changed");
    const { requisitionId: _r, ...rest } = dto;
    return { ...rest } as Patch<JobPostingDoc>;
  }

  /** Publishes the posting to the public career page; the requisition must already be approved. */
  async publish(ctx: RequestContext, id: string): Promise<JobPostingDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "draft") throw new BadRequestException("Only a draft posting can be published");
      const req = await this.requisitions.repo.get(ctx, before.requisitionId, tx);
      if (req.status !== "approved") throw new BadRequestException("The requisition must be approved before posting");
      return this.repo.applyUpdate(ctx, tx, before, { status: "published", publishedAt: today() }).after;
    });
  }

  async close(ctx: RequestContext, id: string): Promise<JobPostingDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status !== "published") throw new BadRequestException("Only a published posting can be closed");
    return (await this.repo.update(ctx, id, { status: "closed", closedAt: today() })).after;
  }

  /** Published postings for a company, for the public career page; no tenant context needed. */
  async publicList(companyId: string) {
    const snap = await this.repo.collection.where("companyId", "==", companyId).where("status", "==", "published").get();
    return snap.docs.map((d) => d.data()).filter((p) => !p.archivedAt).map(publicPosting);
  }

  async publicGet(companyId: string, id: string) {
    const doc = (await this.repo.collection.doc(id).get()).data();
    if (!doc || doc.companyId !== companyId || doc.status !== "published" || doc.archivedAt) throw new NotFoundException("This posting is not available");
    return publicPosting(doc);
  }

  protected searchEntry(doc: JobPostingDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.title, subtitle: doc.location };
  }
}

function publicPosting(p: JobPostingDoc) {
  return { id: p.id, title: p.title, description: p.description, location: p.location, employmentType: p.employmentType, publishedAt: p.publishedAt };
}

// ─── Candidates ─────────────────────────────────────────────────────────────────

@Injectable()
export class CandidateService extends MasterDataService<CandidateDoc, CreateCandidateDto, UpdateCandidateDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly postings: JobPostingService,
    private readonly requisitions: JobRequisitionService,
    private readonly employees: EmployeeService,
  ) {
    super(fs, audit, unique, {
      module: "hr", entity: "candidate", label: "Candidate", collection: RECRUITMENT_COLLECTIONS.candidates,
      route: "/hr/candidates", filterFields: RECRUITMENT_LISTS.candidates.filters, large: RECRUITMENT_LISTS.candidates,
      references: [
        { field: "postingId", collection: RECRUITMENT_COLLECTIONS.postings, label: "Job posting" },
        { field: "requisitionId", collection: RECRUITMENT_COLLECTIONS.requisitions, label: "Job requisition" },
      ],
      customFields: false,
    });
  }

  protected toNew(dto: CreateCandidateDto): NewDoc<CandidateDoc> {
    return {
      postingId: orNull(dto.postingId), requisitionId: orNull(dto.requisitionId), firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), email: dto.email,
      phone: orNull(dto.phone), resumeUrl: orNull(dto.resumeUrl), linkedInUrl: orNull(dto.linkedInUrl), source: dto.source ?? "direct",
      stage: "applied", score: null, skills: dto.skills ?? [], notes: orNull(dto.notes), interviews: [], offer: blankOffer(), rejectionReason: null, hiredAt: null, employeeId: null,
    };
  }

  protected toPatch(dto: UpdateCandidateDto, before: CandidateDoc): Patch<CandidateDoc> {
    if (LOCKED_STAGES.has(before.stage)) throw new BadRequestException(`A ${before.stage} candidate cannot be changed`);
    if (dto.stage && LOCKED_STAGES.has(dto.stage)) throw new BadRequestException("Use the hire or reject action, which records the outcome");
    return { ...dto } as Patch<CandidateDoc>;
  }

  /** Schedules an interview (read phase only; appends to the record). */
  async scheduleInterview(ctx: RequestContext, id: string, dto: ScheduleInterviewDto): Promise<CandidateDoc> {
    const before = await this.repo.get(ctx, id);
    if (LOCKED_STAGES.has(before.stage)) throw new BadRequestException(`A ${before.stage} candidate cannot be changed`);
    const entry: InterviewEntry = { interviewId: randomUUID().slice(0, 8), scheduledAt: dto.scheduledAt, type: dto.type, interviewerId: dto.interviewerId ?? null, status: "scheduled", rating: null, comments: null };
    const stage = ["applied", "screening", "shortlisted"].includes(before.stage) ? "interview" : before.stage;
    return (await this.repo.update(ctx, id, { interviews: [...before.interviews, entry], stage } as Patch<CandidateDoc>)).after;
  }

  /** Records the outcome of a scheduled interview and refreshes the overall score (average of completed ratings). */
  async recordScorecard(ctx: RequestContext, id: string, interviewId: string, dto: RecordScorecardDto): Promise<CandidateDoc> {
    const before = await this.repo.get(ctx, id);
    if (!before.interviews.some((i) => i.interviewId === interviewId)) throw new BadRequestException("Interview not found");
    const interviews = before.interviews.map((i) => (i.interviewId === interviewId ? { ...i, status: dto.status, rating: dto.rating ?? null, comments: orNull(dto.comments) } : i));
    const rated = interviews.filter((i) => i.status === "completed" && i.rating !== null).map((i) => i.rating!);
    const score = rated.length ? Math.round((rated.reduce((a, r) => a + r, 0) / rated.length) * 10) / 10 : null;
    return (await this.repo.update(ctx, id, { interviews, score } as Patch<CandidateDoc>)).after;
  }

  /** Extends (or revises) an offer, moving the candidate to the offer stage. */
  async extendOffer(ctx: RequestContext, id: string, dto: ExtendOfferDto): Promise<CandidateDoc> {
    const before = await this.repo.get(ctx, id);
    if (LOCKED_STAGES.has(before.stage)) throw new BadRequestException(`A ${before.stage} candidate cannot be changed`);
    const currency = dto.currency ?? before.offer.currency;
    const offer: Offer = {
      salary: dto.salary ? toMinor(dto.salary, currency) : before.offer.salary, currency, startDate: dto.startDate?.slice(0, 10) ?? before.offer.startDate,
      status: "extended", extendedAt: today(), notes: dto.notes ?? before.offer.notes,
    };
    return (await this.repo.update(ctx, id, { offer, stage: "offer" } as Patch<CandidateDoc>)).after;
  }

  /** Records the candidate's reply; declining closes the pipeline as rejected. */
  async respondToOffer(ctx: RequestContext, id: string, accepted: boolean): Promise<CandidateDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.offer.status !== "extended") throw new BadRequestException("No offer is waiting for a response");
      const offer: Offer = { ...before.offer, status: accepted ? "accepted" : "declined" };
      const patch: Patch<CandidateDoc> = accepted ? { offer } : { offer, stage: "rejected", rejectionReason: "Offer declined" };
      return this.repo.applyUpdate(ctx, tx, before, patch).after;
    });
  }

  /** Ends the pipeline without an offer (or after one is declined, directly). */
  async reject(ctx: RequestContext, id: string, reason: string): Promise<CandidateDoc> {
    const before = await this.repo.get(ctx, id);
    if (LOCKED_STAGES.has(before.stage)) throw new BadRequestException(`A ${before.stage} candidate cannot be changed`);
    return (await this.repo.update(ctx, id, { stage: "rejected", rejectionReason: reason } as Patch<CandidateDoc>)).after;
  }

  /**
   * Hires the candidate: creates the employee record (its own transaction,
   * so a failure here leaves the candidate exactly as it was), then marks
   * the candidate hired and the requisition filled in one transaction.
   */
  async hire(ctx: RequestContext, id: string, joiningDate: string | undefined) {
    const before = await this.repo.get(ctx, id);
    if (before.stage === "hired") throw new BadRequestException("Already hired");
    if (before.stage === "rejected") throw new BadRequestException("This candidate was rejected");
    const req = before.requisitionId ? await this.requisitions.repo.find(ctx, before.requisitionId) : null;
    const resolvedJoiningDate = joiningDate?.slice(0, 10) ?? today();
    const employee = await this.employees.create(ctx, {
      firstName: before.firstName, lastName: before.lastName, email: before.email ?? undefined, phone: before.phone ?? undefined,
      joiningDate: resolvedJoiningDate,
      departmentId: req?.departmentId ?? undefined, branchId: req?.branchId ?? undefined, positionId: req?.positionId ?? undefined, managerId: req?.hiringManagerId ?? undefined,
    });
    return this.firestore.runTransaction(async (tx) => {
      const cur = await this.repo.get(ctx, id, tx);
      if (cur.stage === "hired") throw new BadRequestException("Already hired");
      const reqDoc = cur.requisitionId ? await this.requisitions.repo.find(ctx, cur.requisitionId, tx) : null;
      const { after } = this.repo.applyUpdate(ctx, tx, cur, { stage: "hired", hiredAt: resolvedJoiningDate, employeeId: employee.id } as Patch<CandidateDoc>);
      if (reqDoc) {
        const filledCount = reqDoc.filledCount + 1;
        this.requisitions.repo.applyUpdate(ctx, tx, reqDoc, { filledCount, status: filledCount >= reqDoc.openings ? "closed" : reqDoc.status } as Patch<JobRequisitionDoc>);
      }
      this.audit.record(ctx, { module: "hr", action: "hired", entity: this.entityType, entityId: id, after: { employeeId: employee.id } }, tx);
      return after;
    });
  }

  /** The public career page's apply form: creates a candidate with no authentication, scoped by the posting's own company. */
  async publicApply(companyId: string, postingId: string, dto: PublicApplyDto): Promise<{ id: string }> {
    const company = (await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(companyId).get()).data();
    if (!company) throw new NotFoundException("This posting is not available");
    const posting = (await this.postings.repo.collection.doc(postingId).get()).data();
    if (!posting || posting.companyId !== companyId || posting.status !== "published") throw new NotFoundException("This posting is not available");
    const ctx = systemContext({ tenantId: company.tenantId, companyId }, null);
    const candidate = await this.create(ctx, {
      postingId, requisitionId: posting.requisitionId, firstName: dto.firstName, lastName: dto.lastName, email: dto.email,
      phone: dto.phone, resumeUrl: dto.resumeUrl, linkedInUrl: dto.linkedInUrl, source: "career_page", notes: dto.notes,
    });
    return { id: candidate.id };
  }

  protected searchEntry(doc: CandidateDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.firstName} ${doc.lastName}`, subtitle: doc.email, keywords: [doc.phone] };
  }
}
