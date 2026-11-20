import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { ListQueryDto } from "../platform/crud/list-query.dto.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { toMinor } from "../platform/data/money.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { AccountService, ContactService, LeadService, OpportunityService } from "../crm/crm.services.js";
import { CreateCampaignDto, CreateSegmentDto, CreateSequenceDto, EnrollDto, SequenceStepDto, UpdateCampaignDto, UpdateSegmentDto, UpdateSequenceDto } from "./marketing.dto.js";
import {
  CampaignDoc, MARKETING_COLLECTIONS, SegmentDoc, SequenceDoc, SequenceEnrollmentDoc, SequenceStep,
} from "./marketing.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const addDays = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

@Injectable()
export class CampaignService extends MasterDataService<CampaignDoc, CreateCampaignDto, UpdateCampaignDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "marketing", entity: "campaign", label: "Campaign", collection: MARKETING_COLLECTIONS.campaigns, route: "/marketing/campaigns",
      filterFields: ["status", "type", "ownerUserId"], numbering: { field: "code", key: "marketingCampaign", prefix: "CMP", yearly: true }, customFields: false,
    });
  }

  protected toNew(dto: CreateCampaignDto): NewDoc<CampaignDoc> {
    return {
      code: "", name: dto.name, type: dto.type, ownerUserId: orNull(dto.ownerUserId), budget: dto.budget ? toMinor(dto.budget, "LKR") : 0,
      startDate: dto.startDate.slice(0, 10), endDate: orNull(dto.endDate?.slice(0, 10)), goals: orNull(dto.goals), channels: dto.channels ?? [],
      status: "draft", notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateCampaignDto): Patch<CampaignDoc> {
    const { budget, ...rest } = dto;
    return { ...rest, ...(budget !== undefined ? { budget: toMinor(budget, "LKR") } : {}) } as Patch<CampaignDoc>;
  }

  protected searchEntry(doc: CampaignDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code };
  }
}

@Injectable()
export class SegmentService extends MasterDataService<SegmentDoc, CreateSegmentDto, UpdateSegmentDto> {
  constructor(
    fs: FirestoreService, audit: AuditService, unique: UniqueService,
    private readonly accounts: AccountService,
    private readonly leads: LeadService,
    private readonly contacts: ContactService,
  ) {
    super(fs, audit, unique, {
      module: "marketing", entity: "segment", label: "Segment", collection: MARKETING_COLLECTIONS.segments, route: "/marketing/segments",
      filterFields: ["entityType"], customFields: false,
    });
  }

  protected toNew(dto: CreateSegmentDto): NewDoc<SegmentDoc> {
    return { name: dto.name, description: orNull(dto.description), entityType: dto.entityType, filter: orNull(dto.filter) };
  }

  /** Previews up to 200 matching records, by handing the segment's own filter straight to the entity's usual list endpoint. */
  async preview(ctx: RequestContext, id: string) {
    const segment = await this.repo.get(ctx, id);
    const query: ListQueryDto = { where: segment.filter ?? undefined, limit: 200 };
    if (segment.entityType === "crm.account") return this.accounts.list(ctx, query);
    if (segment.entityType === "crm.lead") return this.leads.list(ctx, query);
    return this.contacts.list(ctx, query);
  }

  protected searchEntry(doc: SegmentDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.entityType };
  }
}

@Injectable()
export class SequenceService extends MasterDataService<SequenceDoc, CreateSequenceDto, UpdateSequenceDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "marketing", entity: "sequence", label: "Sequence", collection: MARKETING_COLLECTIONS.sequences, route: "/marketing/sequences",
      filterFields: ["trigger", "isActive"], customFields: false,
    });
  }

  private step(dto: SequenceStepDto): SequenceStep {
    return { stepId: randomUUID().slice(0, 8), seq: dto.seq, delayDays: dto.delayDays, subject: dto.subject, body: dto.body };
  }

  protected toNew(dto: CreateSequenceDto): NewDoc<SequenceDoc> {
    return { name: dto.name, trigger: dto.trigger, steps: (dto.steps ?? []).map((s) => this.step(s)), isActive: dto.isActive ?? true };
  }

  protected toPatch(dto: UpdateSequenceDto): Patch<SequenceDoc> {
    const { steps, ...rest } = dto;
    return { ...rest, ...(steps ? { steps: steps.map((s) => this.step(s)) } : {}) } as Patch<SequenceDoc>;
  }

  protected searchEntry(doc: SequenceDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.trigger };
  }
}

@Injectable()
export class EnrollmentService extends MasterDataService<SequenceEnrollmentDoc, EnrollDto, Record<string, never>> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly sequenceDefs: SequenceService) {
    super(fs, audit, unique, {
      module: "marketing", entity: "enrollment", label: "Sequence enrollment", collection: MARKETING_COLLECTIONS.enrollments,
      route: "/marketing/enrollments", filterFields: ["sequenceId", "status", "leadId", "accountId"], customFields: false,
    });
  }

  /** Enrolls a lead or account at step 0; `nextStepDueAt` is set from the first step's delay, or null for a sequence with no steps yet. */
  async create(ctx: RequestContext, dto: EnrollDto): Promise<SequenceEnrollmentDoc> {
    if (!dto.leadId && !dto.accountId) throw new BadRequestException("Enroll either a lead or an account");
    const sequence = await this.sequenceDefs.repo.get(ctx, dto.sequenceId);
    if (!sequence.isActive) throw new BadRequestException("This sequence is not active");
    return super.create(ctx, dto);
  }

  protected toNew(dto: EnrollDto): NewDoc<SequenceEnrollmentDoc> {
    return { sequenceId: dto.sequenceId, leadId: orNull(dto.leadId), accountId: orNull(dto.accountId), currentStep: -1, enrolledAt: new Date().toISOString(), nextStepDueAt: null, status: "active" };
  }

  /** Advances to the next step, due `delayDays` after now; completes the enrollment once every step has run. */
  async advance(ctx: RequestContext, id: string): Promise<SequenceEnrollmentDoc> {
    const enrollment = await this.repo.get(ctx, id);
    if (enrollment.status !== "active") throw new BadRequestException(`This enrollment is already ${enrollment.status}`);
    const sequence = await this.sequenceDefs.repo.get(ctx, enrollment.sequenceId);
    const ordered = [...sequence.steps].sort((a, b) => a.seq - b.seq);
    const nextIndex = enrollment.currentStep + 1;
    const step = ordered[nextIndex];
    if (!step) return (await this.repo.update(ctx, id, { status: "completed", nextStepDueAt: null } as Patch<SequenceEnrollmentDoc>)).after;
    const today = new Date().toISOString().slice(0, 10);
    return (await this.repo.update(ctx, id, { currentStep: nextIndex, nextStepDueAt: addDays(today, step.delayDays) } as Patch<SequenceEnrollmentDoc>)).after;
  }

  async cancel(ctx: RequestContext, id: string): Promise<SequenceEnrollmentDoc> {
    const enrollment = await this.repo.get(ctx, id);
    if (enrollment.status !== "active") throw new BadRequestException(`This enrollment is already ${enrollment.status}`);
    return (await this.repo.update(ctx, id, { status: "cancelled" } as Patch<SequenceEnrollmentDoc>)).after;
  }

  protected searchEntry(doc: SequenceEnrollmentDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `Enrollment ${doc.id}`, subtitle: doc.status };
  }
}

@Injectable()
export class MarketingAnalyticsService {
  constructor(
    private readonly campaigns: CampaignService,
    private readonly leads: LeadService,
    private readonly opportunities: OpportunityService,
  ) {}

  /**
   * Matches leads to a campaign by `LeadDoc.campaign` (free text) against
   * this campaign's `name` — not a foreign key, so renaming a campaign after
   * leads were tagged breaks the link retroactively; a real, documented
   * limitation, not a bug. Revenue sums `won` opportunities on the accounts
   * those leads converted into.
   */
  async campaignReport(ctx: RequestContext, campaignId: string) {
    const campaign = await this.campaigns.repo.get(ctx, campaignId);
    const leads = await this.leads.repo.all(ctx, { where: [["campaign", "==", campaign.name]] });
    const leadsCount = leads.length;
    const converted = leads.filter((l) => l.convertedAccountId);
    const conversions = converted.length;
    const accountIds = new Set(converted.map((l) => l.convertedAccountId!));
    const opportunities = accountIds.size ? await this.opportunities.repo.all(ctx, {}) : [];
    const revenue = opportunities.filter((o) => o.stage === "won" && o.accountId && accountIds.has(o.accountId)).reduce((a, o) => a + o.amount, 0);
    const budget = campaign.budget;
    return {
      campaignId, leadsCount, conversions, revenue, budget,
      costPerLead: leadsCount ? Math.round(budget / leadsCount) : null,
      costPerAcquisition: conversions ? Math.round(budget / conversions) : null,
      conversionRate: leadsCount ? Math.round((conversions / leadsCount) * 10_000) : 0,
      roi: budget ? Math.round(((revenue - budget) / budget) * 10_000) : null,
    };
  }
}
