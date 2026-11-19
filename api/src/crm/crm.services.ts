import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, Scope } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { fromMinor, toMinor } from "../platform/data/money.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { RecordsService } from "../platform/records/records.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import {
  AccountDoc,
  ActivityDoc,
  ContactDoc,
  CRM_COLLECTIONS,
  CRM_LISTS,
  CrmSettingsDoc,
  DEFAULT_LOSS_REASONS,
  DEFAULT_SCORING,
  DEFAULT_SOURCES,
  digits,
  LeadDoc,
  OpportunityDoc,
  OpportunityStage,
  ScoringRule,
  STAGE_PROBABILITY,
} from "./crm.models.js";
import {
  ConvertLeadDto,
  CreateAccountDto,
  CreateActivityDto,
  CreateContactDto,
  CreateLeadDto,
  CreateOpportunityDto,
  CrmSettingsDto,
  UpdateAccountDto,
  UpdateActivityDto,
  UpdateContactDto,
  UpdateLeadDto,
  UpdateOpportunityDto,
} from "./crm.dto.js";

const lower = (v: string | null | undefined) => (v ? v.trim().toLowerCase() : null);
const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

// ─── Settings ─────────────────────────────────────────────────────────────────

@Injectable()
export class CrmSettingsService {
  constructor(private readonly firestore: FirestoreService) {}

  private ref(scope: Scope) {
    return this.firestore.collection<CrmSettingsDoc>(CRM_COLLECTIONS.settings).doc(scope.companyId);
  }

  async get(scope: Scope, tx?: Transaction): Promise<CrmSettingsDoc> {
    const snap = tx ? await tx.get(this.ref(scope)) : await this.ref(scope).get();
    return (
      snap.data() ?? {
        companyId: scope.companyId,
        scoringRules: DEFAULT_SCORING,
        assignment: { mode: "owner", assignees: [], next: 0 },
        leadSources: DEFAULT_SOURCES,
        lossReasons: DEFAULT_LOSS_REASONS,
        updatedAt: new Date(0).toISOString(),
      }
    );
  }

  async update(scope: Scope, dto: CrmSettingsDto): Promise<CrmSettingsDoc> {
    const current = await this.get(scope);
    const next: CrmSettingsDoc = {
      ...current,
      scoringRules: dto.scoringRules ?? current.scoringRules,
      assignment: {
        mode: dto.assignmentMode ?? current.assignment.mode,
        assignees: dto.assignees ?? current.assignment.assignees,
        next: 0,
      },
      leadSources: dto.leadSources ?? current.leadSources,
      lossReasons: dto.lossReasons ?? current.lossReasons,
      updatedAt: new Date().toISOString(),
    };
    if (next.assignment.mode === "roundRobin" && next.assignment.assignees.length === 0) {
      throw new BadRequestException("Choose at least one person to distribute leads to");
    }
    await this.ref(scope).set(next);
    return next;
  }
}

export function scoreLead(lead: Partial<LeadDoc>, rules: ScoringRule[]): number {
  let score = 0;
  for (const rule of rules) {
    const raw = (lead as Record<string, unknown>)[rule.field];
    const value = typeof raw === "string" ? raw.toLowerCase() : raw;
    const target = rule.value?.toLowerCase();
    const hit =
      rule.test === "present" ? value !== null && value !== undefined && value !== "" :
      rule.test === "equals" ? value === target :
      typeof value === "string" && !!target && value.includes(target);
    if (hit) score += rule.points;
  }
  return Math.max(0, Math.min(100, score));
}

// ─── Duplicates ─────────────────────────────────────────────────────────────

export interface DuplicateHit {
  entityType: string;
  id: string;
  label: string;
  match: "email" | "phone" | "name";
}

@Injectable()
export class DuplicateFinder {
  constructor(private readonly firestore: FirestoreService) {}

  async find(scope: Scope, input: { email?: string | null; phone?: string | null; name?: string | null }, excludeId?: string): Promise<DuplicateHit[]> {
    const hits: DuplicateHit[] = [];
    const email = lower(input.email);
    const phone = digits(input.phone);
    const name = lower(input.name);
    const run = async (collection: string, field: string, value: string, entityType: string, match: DuplicateHit["match"], label: (d: Record<string, unknown>) => string) => {
      const snap = await this.firestore.collection(collection).where("companyId", "==", scope.companyId).where(field, "==", value).limit(5).get();
      for (const d of snap.docs) {
        const data = d.data();
        if (d.id === excludeId || data.archivedAt) continue;
        hits.push({ entityType, id: d.id, label: label(data), match });
      }
    };
    const person = (d: Record<string, unknown>) => `${d.firstName} ${d.lastName}`;
    await Promise.all([
      email ? run(CRM_COLLECTIONS.leads, "emailLower", email, "crm.lead", "email", person) : null,
      email ? run(CRM_COLLECTIONS.contacts, "emailLower", email, "crm.contact", "email", person) : null,
      phone ? run(CRM_COLLECTIONS.leads, "phoneDigits", phone, "crm.lead", "phone", person) : null,
      phone ? run(CRM_COLLECTIONS.contacts, "phoneDigits", phone, "crm.contact", "phone", person) : null,
      name ? run(CRM_COLLECTIONS.accounts, "nameLower", name, "crm.account", "name", (d) => String(d.name)) : null,
    ]);
    const seen = new Set<string>();
    return hits.filter((h) => (seen.has(`${h.entityType}:${h.id}`) ? false : (seen.add(`${h.entityType}:${h.id}`), true)));
  }

  async assertNone(scope: Scope, input: { email?: string | null; phone?: string | null; name?: string | null }, allow: boolean | undefined, excludeId?: string): Promise<void> {
    if (allow) return;
    const duplicates = await this.find(scope, input, excludeId);
    if (duplicates.length) {
      throw new ConflictException({ statusCode: 409, message: "Possible duplicate found. Review it, or save anyway.", duplicates });
    }
  }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

@Injectable()
export class AccountService extends MasterDataService<AccountDoc, CreateAccountDto, UpdateAccountDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly duplicates: DuplicateFinder) {
    super(fs, audit, unique, {
      module: "crm",
      entity: "account",
      label: "Customer",
      collection: CRM_COLLECTIONS.accounts,
      route: "/crm/accounts",
      uniqueFields: ["code"],
      parentField: "parentId",
      references: [{ field: "priceListId", collection: "priceLists", label: "Price list" }],
      filterFields: ["status", "type", "ownerUserId", "segment"],
      large: CRM_LISTS.accounts,
      numbering: { field: "code", key: "customer", prefix: "CUS" },
    });
  }

  async create(ctx: RequestContext, dto: CreateAccountDto): Promise<AccountDoc> {
    await this.duplicates.assertNone(ctx, { name: dto.name }, dto.allowDuplicate);
    return super.create(ctx, dto);
  }

  protected toNew(dto: CreateAccountDto, ctx: RequestContext): NewDoc<AccountDoc> {
    const currency = dto.currency ?? "LKR";
    return {
      code: dto.code ?? "",
      name: dto.name.trim(),
      nameLower: dto.name.trim().toLowerCase(),
      type: dto.type ?? "customer",
      status: dto.status ?? "active",
      segment: orNull(dto.segment),
      industry: orNull(dto.industry),
      parentId: orNull(dto.parentId),
      website: orNull(dto.website),
      email: orNull(dto.email),
      phone: orNull(dto.phone),
      billingAddress: orNull(dto.billingAddress),
      shippingAddress: orNull(dto.shippingAddress),
      currency,
      paymentTermsDays: dto.paymentTermsDays ?? 30,
      creditLimit: dto.creditLimit ? toMinor(dto.creditLimit, currency) : null,
      taxId: orNull(dto.taxId),
      priceListId: orNull(dto.priceListId),
      ownerUserId: dto.ownerUserId ?? ctx.userId,
      portalAccess: dto.portalAccess ?? false,
      taxExempt: dto.taxExempt ?? false,
      taxExemptionNo: orNull(dto.taxExemptionNo),
      notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateAccountDto, before: AccountDoc): Patch<AccountDoc> {
    const { allowDuplicate: _a, customFields: _c, creditLimit, ...rest } = dto;
    const currency = dto.currency ?? before.currency;
    const patch: Patch<AccountDoc> = { ...rest } as Patch<AccountDoc>;
    if (dto.name) patch.nameLower = dto.name.trim().toLowerCase();
    if (creditLimit !== undefined) patch.creditLimit = creditLimit === null ? null : toMinor(creditLimit, currency);
    else if (dto.currency && before.creditLimit !== null && dto.currency !== before.currency) {
      throw new BadRequestException("Re-enter the credit limit when changing the currency");
    }
    return patch;
  }

  protected searchEntry(doc: AccountDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code, keywords: [doc.email, doc.phone, doc.taxId, doc.code] };
  }

  /** Decimal-string view of money fields for API responses. */
  static present(doc: AccountDoc) {
    return { ...doc, creditLimitDisplay: doc.creditLimit === null ? null : fromMinor(doc.creditLimit, doc.currency) };
  }
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

@Injectable()
export class ContactService extends MasterDataService<ContactDoc, CreateContactDto, UpdateContactDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly duplicates: DuplicateFinder) {
    super(fs, audit, unique, {
      module: "crm",
      entity: "contact",
      label: "Contact",
      collection: CRM_COLLECTIONS.contacts,
      route: "/crm/contacts",
      references: [{ field: "accountId", collection: CRM_COLLECTIONS.accounts, label: "Customer" }],
      filterFields: ["accountId", "ownerUserId"],
      large: CRM_LISTS.contacts,
    });
  }

  async create(ctx: RequestContext, dto: CreateContactDto): Promise<ContactDoc> {
    await this.duplicates.assertNone(ctx, { email: dto.email, phone: dto.phone }, dto.allowDuplicate);
    return super.create(ctx, dto);
  }

  protected toNew(dto: CreateContactDto, ctx: RequestContext): NewDoc<ContactDoc> {
    return {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      accountId: orNull(dto.accountId),
      title: orNull(dto.title),
      role: orNull(dto.role),
      email: orNull(dto.email),
      emailLower: lower(dto.email),
      phone: orNull(dto.phone),
      phoneDigits: digits(dto.phone),
      preferredChannel: dto.preferredChannel ?? null,
      doNotContact: dto.doNotContact ?? false,
      address: orNull(dto.address),
      ownerUserId: dto.ownerUserId ?? ctx.userId,
      notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateContactDto): Patch<ContactDoc> {
    const { allowDuplicate: _a, customFields: _c, ...rest } = dto;
    const patch = { ...rest } as Patch<ContactDoc>;
    if (dto.email !== undefined) patch.emailLower = lower(dto.email);
    if (dto.phone !== undefined) patch.phoneDigits = digits(dto.phone);
    return patch;
  }

  protected searchEntry(doc: ContactDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.firstName} ${doc.lastName}`, subtitle: doc.email ?? doc.title, keywords: [doc.phone, doc.email] };
  }
}

// ─── Leads ────────────────────────────────────────────────────────────────────

@Injectable()
export class LeadService extends MasterDataService<LeadDoc, CreateLeadDto, UpdateLeadDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly duplicates: DuplicateFinder,
    private readonly settings: CrmSettingsService,
  ) {
    super(fs, audit, unique, {
      module: "crm",
      entity: "lead",
      label: "Lead",
      collection: CRM_COLLECTIONS.leads,
      route: "/crm/leads",
      filterFields: ["status", "ownerUserId", "source"],
      large: CRM_LISTS.leads,
    });
  }

  async create(ctx: RequestContext, dto: CreateLeadDto): Promise<LeadDoc> {
    await this.duplicates.assertNone(ctx, { email: dto.email, phone: dto.phone }, dto.allowDuplicate);
    return super.create(ctx, dto);
  }

  protected toNew(dto: CreateLeadDto): NewDoc<LeadDoc> {
    return {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      company: orNull(dto.company),
      title: orNull(dto.title),
      email: orNull(dto.email),
      emailLower: lower(dto.email),
      phone: orNull(dto.phone),
      phoneDigits: digits(dto.phone),
      website: orNull(dto.website),
      source: dto.source ? dto.source.toLowerCase() : null,
      campaign: orNull(dto.campaign),
      status: dto.status ?? "new",
      score: 0,
      ownerUserId: orNull(dto.ownerUserId),
      notes: orNull(dto.notes),
      convertedAt: null,
      convertedAccountId: null,
      convertedContactId: null,
      convertedOpportunityId: null,
    };
  }

  protected toPatch(dto: UpdateLeadDto, before: LeadDoc): Patch<LeadDoc> {
    if (before.status === "converted") throw new BadRequestException("A converted lead cannot be changed");
    const { allowDuplicate: _a, customFields: _c, ...rest } = dto;
    const patch = { ...rest } as Patch<LeadDoc>;
    if (dto.email !== undefined) patch.emailLower = lower(dto.email);
    if (dto.phone !== undefined) patch.phoneDigits = digits(dto.phone);
    if (dto.source !== undefined) patch.source = dto.source ? dto.source.toLowerCase() : null;
    return patch;
  }

  /** Score from the company's rules; new leads without an owner are distributed when routing is on. */
  protected async derive(tx: Transaction, ctx: RequestContext, next: LeadDoc, before: LeadDoc | null): Promise<Partial<LeadDoc>> {
    const settings = await this.settings.get(ctx, tx);
    const derived: Partial<LeadDoc> = { score: scoreLead(next, settings.scoringRules) };
    if (!before && !next.ownerUserId) {
      const pool = settings.assignment.mode === "roundRobin" ? settings.assignment.assignees : [];
      // Spread evenly by a hash of the new id: no shared counter to contend on.
      derived.ownerUserId = pool.length ? pool[createHash("sha256").update(next.id).digest().readUInt32BE(0) % pool.length]! : ctx.userId;
    }
    return derived;
  }

  protected searchEntry(doc: LeadDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.firstName} ${doc.lastName}`, subtitle: doc.company ?? doc.email, keywords: [doc.email, doc.phone, doc.company] };
  }
}

// ─── Opportunities ────────────────────────────────────────────────────────────

@Injectable()
export class OpportunityService extends MasterDataService<OpportunityDoc, CreateOpportunityDto, UpdateOpportunityDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly events: EventBusService, private readonly settings: CrmSettingsService) {
    super(fs, audit, unique, {
      module: "crm",
      entity: "opportunity",
      label: "Opportunity",
      collection: CRM_COLLECTIONS.opportunities,
      route: "/crm/opportunities",
      references: [
        { field: "accountId", collection: CRM_COLLECTIONS.accounts, label: "Customer" },
        { field: "contactId", collection: CRM_COLLECTIONS.contacts, label: "Contact" },
      ],
      filterFields: ["stage", "ownerUserId", "accountId", "forecastCategory"],
      large: CRM_LISTS.opportunities,
    });
  }

  protected toNew(dto: CreateOpportunityDto, ctx: RequestContext): NewDoc<OpportunityDoc> {
    const stage = dto.stage ?? "prospecting";
    const currency = dto.currency ?? "LKR";
    return {
      name: dto.name.trim(),
      accountId: orNull(dto.accountId),
      contactId: orNull(dto.contactId),
      stage,
      probability: dto.probability ?? STAGE_PROBABILITY[stage],
      amount: dto.amount ? toMinor(dto.amount, currency) : 0,
      currency,
      expectedCloseDate: dto.expectedCloseDate?.slice(0, 10) ?? null,
      forecastCategory: dto.forecastCategory ?? "pipeline",
      ownerUserId: dto.ownerUserId ?? ctx.userId,
      source: orNull(dto.source),
      competitors: dto.competitors ?? [],
      nextAction: orNull(dto.nextAction),
      nextActionDate: dto.nextActionDate?.slice(0, 10) ?? null,
      winLossReason: null,
      closedAt: null,
      leadId: null,
      stageHistory: [{ stage, at: new Date().toISOString(), by: ctx.userId }],
      notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateOpportunityDto, before: OpportunityDoc): Patch<OpportunityDoc> {
    const { stage, amount, customFields: _c, ...rest } = dto;
    if (stage !== undefined && stage !== before.stage) throw new BadRequestException("Use the stage action to move an opportunity");
    const currency = dto.currency ?? before.currency;
    const patch = { ...rest } as Patch<OpportunityDoc>;
    if (amount !== undefined) patch.amount = amount ? toMinor(amount, currency) : 0;
    else if (dto.currency && dto.currency !== before.currency && before.amount) throw new BadRequestException("Re-enter the amount when changing the currency");
    if (dto.expectedCloseDate) patch.expectedCloseDate = dto.expectedCloseDate.slice(0, 10);
    if (dto.nextActionDate) patch.nextActionDate = dto.nextActionDate.slice(0, 10);
    return patch;
  }

  /** Moves through the pipeline; closing as won or lost records why and publishes an event. */
  async moveStage(ctx: RequestContext, id: string, stage: OpportunityStage, reason?: string): Promise<OpportunityDoc> {
    const settings = await this.settings.get(ctx);
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.stage === stage) return before;
      const closing = stage === "won" || stage === "lost";
      if (stage === "lost" && !reason?.trim()) throw new BadRequestException("Say why the opportunity was lost");
      if (stage === "lost" && settings.lossReasons.length && !settings.lossReasons.includes(reason!.trim())) {
        throw new BadRequestException(`Loss reason must be one of: ${settings.lossReasons.join(", ")}`);
      }
      const now = new Date().toISOString();
      const { after } = this.repo.applyUpdate(ctx, tx, before, {
        stage,
        probability: STAGE_PROBABILITY[stage],
        forecastCategory: closing ? "closed" : before.forecastCategory === "closed" ? "pipeline" : before.forecastCategory,
        closedAt: closing ? now : null,
        winLossReason: closing ? reason?.trim() || null : null,
        stageHistory: [...before.stageHistory, { stage, at: now, by: ctx.userId }],
      });
      this.audit.record(ctx, { module: "crm", action: `stage_${stage}`, entity: this.entityType, entityId: id, before: { stage: before.stage }, after: { stage, reason: reason ?? null } }, tx);
      if (closing) {
        this.events.publish(tx, ctx, stage === "won" ? "OpportunityWon" : "OpportunityLost", { entity: this.entityType, entityId: id }, {
          opportunityId: id,
          accountId: after.accountId,
          amount: after.amount,
          currency: after.currency,
          reason: reason ?? null,
        });
      }
      return after;
    });
  }

  protected searchEntry(doc: OpportunityDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: `${doc.stage} · ${fromMinor(doc.amount, doc.currency)} ${doc.currency}` };
  }
}

// ─── Activities ───────────────────────────────────────────────────────────────

const RELATED_COLLECTION: Record<string, string> = {
  "crm.lead": CRM_COLLECTIONS.leads,
  "crm.contact": CRM_COLLECTIONS.contacts,
  "crm.account": CRM_COLLECTIONS.accounts,
  "crm.opportunity": CRM_COLLECTIONS.opportunities,
};

@Injectable()
export class ActivityService extends MasterDataService<ActivityDoc, CreateActivityDto, UpdateActivityDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "crm",
      entity: "activity",
      label: "Activity",
      collection: CRM_COLLECTIONS.activities,
      route: "/crm/activities",
      filterFields: ["ownerUserId", "status", "relatedKey", "accountId", "type"],
      large: CRM_LISTS.activities,
      searchFields: ["subject"],
    });
  }

  protected toNew(dto: CreateActivityDto, ctx: RequestContext): NewDoc<ActivityDoc> {
    if (!!dto.relatedType !== !!dto.relatedId) throw new BadRequestException("relatedType and relatedId go together");
    const status = dto.status ?? (dto.type === "note" ? "done" : "planned");
    return {
      type: dto.type,
      subject: dto.subject.trim(),
      description: orNull(dto.description),
      status,
      dueAt: dto.dueAt ?? null,
      completedAt: status === "done" ? new Date().toISOString() : null,
      ownerUserId: dto.ownerUserId ?? ctx.userId,
      relatedType: dto.relatedType ?? null,
      relatedId: dto.relatedId ?? null,
      relatedKey: dto.relatedType ? `${dto.relatedType}:${dto.relatedId}` : null,
      accountId: null,
      outcome: null,
    };
  }

  protected toPatch(dto: UpdateActivityDto, before: ActivityDoc): Patch<ActivityDoc> {
    const { customFields: _c, relatedType, relatedId, ...rest } = dto;
    const patch = { ...rest } as Patch<ActivityDoc>;
    if (relatedType !== undefined || relatedId !== undefined) {
      const t = relatedType ?? before.relatedType;
      const i = relatedId ?? before.relatedId;
      patch.relatedType = t;
      patch.relatedId = i;
      patch.relatedKey = t && i ? `${t}:${i}` : null;
    }
    if (dto.status === "done" && before.status !== "done") patch.completedAt = new Date().toISOString();
    if (dto.status && dto.status !== "done") patch.completedAt = null;
    return patch;
  }

  /** Checks the related record and denormalises its customer for account timelines. */
  protected async derive(tx: Transaction, ctx: RequestContext, next: ActivityDoc): Promise<Partial<ActivityDoc>> {
    if (!next.relatedType || !next.relatedId) return { accountId: null };
    const collection = RELATED_COLLECTION[next.relatedType];
    if (!collection) throw new BadRequestException("Unsupported related record type");
    const related = (await tx.get(this.firestore.collection(collection).doc(next.relatedId))).data() as Record<string, unknown> | undefined;
    if (!related || related.companyId !== ctx.companyId) throw new BadRequestException("Related record not found");
    const accountId = next.relatedType === "crm.account" ? next.relatedId : ((related.accountId as string | null | undefined) ?? null);
    return { accountId };
  }

  async complete(ctx: RequestContext, id: string, outcome?: string): Promise<ActivityDoc> {
    return this.update(ctx, id, { status: "done", outcome } as UpdateActivityDto);
  }

  protected searchEntry(doc: ActivityDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.subject, subtitle: doc.type };
  }
}

// ─── Lead conversion ──────────────────────────────────────────────────────────

@Injectable()
export class LeadConversionService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly records: RecordsService,
    private readonly leads: LeadService,
    private readonly accounts: AccountService,
    private readonly contacts: ContactService,
    private readonly opportunities: OpportunityService,
  ) {}

  /**
   * Turns a lead into a contact at a customer (new or existing) and,
   * optionally, an opportunity, in one transaction, linking them all.
   */
  async convert(ctx: RequestContext, leadId: string, dto: ConvertLeadDto) {
    return this.firestore.runTransaction(async (tx) => {
      const lead = await this.leads.repo.get(ctx, leadId, tx);
      if (lead.status === "converted") throw new BadRequestException("This lead is already converted");
      if (lead.status === "unqualified") throw new BadRequestException("Unqualified leads cannot be converted; requalify first");

      let account = dto.accountId ? await this.accounts.repo.get(ctx, dto.accountId, tx) : null;
      const reserved = account ? null : await this.accounts.reserveNumber(tx, ctx);

      // Writes start here.
      if (!account) {
        const name = lead.company?.trim() || `${lead.firstName} ${lead.lastName}`;
        account = this.accounts.repo.build(ctx, {
          code: reserved!.number,
          name,
          nameLower: name.toLowerCase(),
          type: "customer",
          status: "active",
          segment: null,
          industry: null,
          parentId: null,
          website: lead.website,
          email: lead.email,
          phone: lead.phone,
          billingAddress: null,
          shippingAddress: null,
          currency: "LKR",
          paymentTermsDays: 30,
          creditLimit: null,
          taxId: null,
          priceListId: null,
          ownerUserId: lead.ownerUserId ?? ctx.userId,
          portalAccess: false,
          taxExempt: false,
          taxExemptionNo: null,
          notes: null,
          customFields: {},
        } as never);
        reserved!.commit();
        tx.create(this.accounts.repo.ref(account.id), account);
        this.accounts.indexInTx(tx, ctx, account);
        this.audit.record(ctx, { module: "crm", action: "created", entity: "crm.account", entityId: account.id, after: account, reason: "lead conversion" }, tx);
      }

      const contact = this.contacts.repo.build(ctx, {
        firstName: lead.firstName,
        lastName: lead.lastName,
        accountId: account.id,
        title: lead.title,
        role: null,
        email: lead.email,
        emailLower: lead.emailLower,
        phone: lead.phone,
        phoneDigits: lead.phoneDigits,
        preferredChannel: null,
        doNotContact: false,
        address: null,
        ownerUserId: lead.ownerUserId ?? ctx.userId,
        notes: lead.notes,
        customFields: {},
      } as never);
      tx.create(this.contacts.repo.ref(contact.id), contact);
      this.contacts.indexInTx(tx, ctx, contact);

      let opportunity: OpportunityDoc | null = null;
      if (dto.createOpportunity) {
        const now = new Date().toISOString();
        opportunity = this.opportunities.repo.build(ctx, {
          name: dto.opportunityName?.trim() || `${account.name} opportunity`,
          accountId: account.id,
          contactId: contact.id,
          stage: "qualification",
          probability: STAGE_PROBABILITY.qualification,
          amount: dto.amount ? toMinor(dto.amount, account.currency) : 0,
          currency: account.currency,
          expectedCloseDate: dto.expectedCloseDate?.slice(0, 10) ?? null,
          forecastCategory: "pipeline",
          ownerUserId: lead.ownerUserId ?? ctx.userId,
          source: lead.source,
          competitors: [],
          nextAction: null,
          nextActionDate: null,
          winLossReason: null,
          closedAt: null,
          leadId: lead.id,
          stageHistory: [{ stage: "qualification", at: now, by: ctx.userId }],
          notes: null,
          customFields: {},
        } as never);
        tx.create(this.opportunities.repo.ref(opportunity.id), opportunity);
        this.opportunities.indexInTx(tx, ctx, opportunity);
      }

      const { after } = this.leads.repo.applyUpdate(ctx, tx, lead, {
        status: "converted",
        convertedAt: new Date().toISOString(),
        convertedAccountId: account.id,
        convertedContactId: contact.id,
        convertedOpportunityId: opportunity?.id ?? null,
      });
      const from = { type: "crm.lead", id: lead.id };
      this.records.linkInTx(tx, ctx, from, { type: "crm.account", id: account.id }, "converted_to");
      this.records.linkInTx(tx, ctx, from, { type: "crm.contact", id: contact.id }, "converted_to");
      if (opportunity) this.records.linkInTx(tx, ctx, from, { type: "crm.opportunity", id: opportunity.id }, "converted_to");
      this.audit.record(ctx, { module: "crm", action: "converted", entity: "crm.lead", entityId: lead.id, after: { accountId: account.id, contactId: contact.id, opportunityId: opportunity?.id ?? null } }, tx);
      this.events.publish(tx, ctx, "LeadConverted", { entity: "crm.lead", entityId: lead.id }, { leadId: lead.id, accountId: account.id, contactId: contact.id, opportunityId: opportunity?.id ?? null });
      return { lead: after, account, contact, opportunity };
    });
  }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

@Injectable()
export class CrmAnalyticsService {
  constructor(private readonly firestore: FirestoreService) {}

  /** Lead funnel, pipeline by stage, win rate, sources and rep results (blueprint §5 CRM analytics). */
  async summary(ctx: RequestContext) {
    const col = (name: string) => this.firestore.collection(name).where("companyId", "==", ctx.companyId).where("archived", "==", false);
    const [leads, opportunities] = await Promise.all([
      col(CRM_COLLECTIONS.leads).select("status", "source", "createdAt").limit(10_000).get(),
      col(CRM_COLLECTIONS.opportunities).select("stage", "amount", "currency", "ownerUserId", "createdAt", "closedAt", "probability").limit(10_000).get(),
    ]);
    const leadRows = leads.docs.map((d) => d.data() as Pick<LeadDoc, "status" | "source" | "createdAt">);
    const oppRows = opportunities.docs.map((d) => d.data() as Pick<OpportunityDoc, "stage" | "amount" | "currency" | "ownerUserId" | "createdAt" | "closedAt" | "probability">);

    const byStatus = countBy(leadRows, (l) => l.status);
    const bySource = countBy(leadRows, (l) => l.source ?? "unknown");
    const converted = byStatus.converted ?? 0;

    const pipeline: Record<string, { count: number; amount: number; weighted: number }> = {};
    for (const o of oppRows) {
      const p = (pipeline[o.stage] ??= { count: 0, amount: 0, weighted: 0 });
      p.count++;
      p.amount += o.amount;
      p.weighted += Math.round((o.amount * o.probability) / 100);
    }
    const won = oppRows.filter((o) => o.stage === "won");
    const lost = oppRows.filter((o) => o.stage === "lost");
    const cycleDays = won.filter((o) => o.closedAt).map((o) => (new Date(o.closedAt!).getTime() - new Date(o.createdAt).getTime()) / 86_400_000);
    const reps: Record<string, { won: number; wonAmount: number; open: number }> = {};
    for (const o of oppRows) {
      const r = (reps[o.ownerUserId ?? "unassigned"] ??= { won: 0, wonAmount: 0, open: 0 });
      if (o.stage === "won") {
        r.won++;
        r.wonAmount += o.amount;
      } else if (o.stage !== "lost") r.open++;
    }
    return {
      leads: { total: leadRows.length, byStatus, bySource, conversionRate: leadRows.length ? converted / leadRows.length : 0 },
      pipeline,
      openPipelineAmount: Object.entries(pipeline).filter(([s]) => s !== "won" && s !== "lost").reduce((a, [, v]) => a + v.amount, 0),
      winRate: won.length + lost.length ? won.length / (won.length + lost.length) : 0,
      averageSalesCycleDays: cycleDays.length ? Math.round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) : null,
      reps,
      note: "Amounts are minor units; mixed currencies are summed as recorded.",
    };
  }
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1;
  return out;
}
