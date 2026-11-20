import { createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { assertStrongPassword } from "../auth/security.js";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Page, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { CRM_COLLECTIONS } from "../crm/crm.models.js";
import {
  AssignTicketDto,
  CreatePortalUserDto,
  CreateSlaPolicyDto,
  CreateTicketDto,
  EscalateDto,
  MergeTicketDto,
  PortalChangePasswordDto,
  PortalLoginDto,
  PortalSetPasswordDto,
  RateSatisfactionDto,
  UpdateSlaPolicyDto,
  UpdateTicketDto,
} from "./support.dto.js";
import { PortalUserDoc, SlaPolicyDoc, SUPPORT_COLLECTIONS, SUPPORT_LISTS, TicketDoc, TicketReply } from "./support.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const SETUP_TOKEN_DAYS = 7;
// Real bcrypt hash at the same cost, compared when the email is unknown so sign-in timing is uniform.
const PORTAL_DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);
const DEFAULT_SLA_TARGETS = [
  { priority: "low" as const, responseMinutes: 480, resolutionMinutes: 4320 },
  { priority: "medium" as const, responseMinutes: 240, resolutionMinutes: 1440 },
  { priority: "high" as const, responseMinutes: 60, resolutionMinutes: 480 },
  { priority: "urgent" as const, responseMinutes: 15, resolutionMinutes: 120 },
];

@Injectable()
export class SlaPolicyService extends MasterDataService<SlaPolicyDoc, CreateSlaPolicyDto, UpdateSlaPolicyDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, { module: "support", entity: "slaPolicy", label: "SLA policy", collection: SUPPORT_COLLECTIONS.slaPolicies, route: "/support/sla-policies", customFields: false });
  }

  async create(ctx: RequestContext, dto: CreateSlaPolicyDto) {
    const created = await super.create(ctx, dto);
    if (created.isDefault) await this.clearOtherDefaults(ctx, created.id);
    return created;
  }

  async update(ctx: RequestContext, id: string, dto: UpdateSlaPolicyDto, expectedVersion?: number) {
    const updated = await super.update(ctx, id, dto, expectedVersion);
    if (dto.isDefault) await this.clearOtherDefaults(ctx, id);
    return updated;
  }

  private async clearOtherDefaults(ctx: RequestContext, keepId: string): Promise<void> {
    const all = await this.loadAll(ctx);
    for (const p of all) if (p.id !== keepId && p.isDefault) await this.repo.update(ctx, p.id, { isDefault: false } as Patch<SlaPolicyDoc>);
  }

  async getDefault(ctx: RequestContext): Promise<SlaPolicyDoc | null> {
    const all = await this.loadAll(ctx);
    return all.find((p) => p.isDefault) ?? null;
  }

  protected toNew(dto: CreateSlaPolicyDto): NewDoc<SlaPolicyDoc> {
    return { name: dto.name, tier: dto.tier, targets: dto.targets ?? DEFAULT_SLA_TARGETS, isDefault: dto.isDefault ?? false };
  }

  protected searchEntry(doc: SlaPolicyDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.tier };
  }
}

@Injectable()
export class TicketService extends MasterDataService<TicketDoc, CreateTicketDto, UpdateTicketDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly slaPolicies: SlaPolicyService) {
    super(fs, audit, unique, {
      module: "support", entity: "ticket", label: "Ticket", collection: SUPPORT_COLLECTIONS.tickets, route: "/support/tickets",
      filterFields: [...SUPPORT_LISTS.tickets.filters, "status", "priority", "assignedTo"], large: SUPPORT_LISTS.tickets,
      references: [{ field: "customerId", collection: CRM_COLLECTIONS.accounts, label: "Customer" }],
      numbering: { field: "number", key: "ticket", prefix: "TKT" }, customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: CreateTicketDto): Promise<TicketDoc> {
    const policy = dto.slaPolicyId ? await this.slaPolicies.repo.get(ctx, dto.slaPolicyId) : await this.slaPolicies.getDefault(ctx);
    const priority = dto.priority ?? "medium";
    const target = policy?.targets.find((t) => t.priority === priority);
    const now = Date.now();
    const built = {
      slaPolicyId: policy?.id ?? null,
      firstResponseDueAt: target ? new Date(now + target.responseMinutes * 60_000).toISOString() : null,
      resolutionDueAt: target ? new Date(now + target.resolutionMinutes * 60_000).toISOString() : null,
    };
    return super.create(ctx, { ...dto, ...built } as CreateTicketDto & typeof built);
  }

  protected toNew(dto: CreateTicketDto & { slaPolicyId?: string | null; firstResponseDueAt?: string | null; resolutionDueAt?: string | null }): NewDoc<TicketDoc> {
    return {
      number: "", customerId: orNull(dto.customerId), contactId: orNull(dto.contactId), channel: dto.channel ?? "internal", subject: dto.subject, description: orNull(dto.description),
      category: orNull(dto.category), priority: dto.priority ?? "medium", status: "new", assignedTo: null, slaPolicyId: dto.slaPolicyId ?? null,
      firstResponseDueAt: dto.firstResponseDueAt ?? null, resolutionDueAt: dto.resolutionDueAt ?? null, respondedAt: null, resolvedAt: null, closedAt: null,
      productId: orNull(dto.productId), orderId: orNull(dto.orderId), invoiceId: orNull(dto.invoiceId), projectId: orNull(dto.projectId),
      mergedIntoId: null, reopenedCount: 0, satisfactionRating: null, satisfactionComment: null, replies: [],
    };
  }

  protected toPatch(dto: UpdateTicketDto): Patch<TicketDoc> {
    const { customerId: _c, slaPolicyId: _s, ...rest } = dto;
    return rest as Patch<TicketDoc>;
  }

  async assign(ctx: RequestContext, id: string, dto: AssignTicketDto): Promise<TicketDoc> {
    const before = await this.repo.get(ctx, id);
    if (["resolved", "closed"].includes(before.status)) throw new BadRequestException(`A ${before.status} ticket cannot be assigned`);
    return (await this.repo.update(ctx, id, { assignedTo: dto.assignedTo, status: before.status === "new" || before.status === "open" ? "assigned" : before.status } as Patch<TicketDoc>)).after;
  }

  /** A customer-visible reply, from staff or the customer themselves; `authorType` distinguishes the two in the thread. */
  async reply(ctx: RequestContext, id: string, authorType: TicketReply["authorType"], authorId: string, body: string): Promise<TicketDoc> {
    const before = await this.repo.get(ctx, id);
    const replies = [...before.replies, { authorType, authorId, body, at: new Date().toISOString() }];
    const patch: Patch<TicketDoc> = { replies };
    if (authorType === "staff") {
      if (!before.respondedAt) Object.assign(patch, { respondedAt: new Date().toISOString() });
      if (["new", "open", "assigned"].includes(before.status)) Object.assign(patch, { status: "in_progress" });
    } else if (before.status === "waiting_customer") {
      Object.assign(patch, { status: "in_progress" });
    }
    return (await this.repo.update(ctx, id, patch)).after;
  }

  async setStatus(ctx: RequestContext, id: string, status: "open" | "waiting_customer" | "resolved" | "closed"): Promise<TicketDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status === "closed" && status !== "closed") throw new BadRequestException("A closed ticket must be reopened, not edited directly");
    const patch: Patch<TicketDoc> = { status };
    if (status === "resolved" && !before.resolvedAt) Object.assign(patch, { resolvedAt: new Date().toISOString() });
    if (status === "closed" && !before.closedAt) Object.assign(patch, { closedAt: new Date().toISOString() });
    return (await this.repo.update(ctx, id, patch)).after;
  }

  async escalate(ctx: RequestContext, id: string, dto: EscalateDto): Promise<TicketDoc> {
    const before = await this.repo.get(ctx, id);
    const bumped: Record<string, TicketDoc["priority"]> = { low: "medium", medium: "high", high: "urgent", urgent: "urgent" };
    return (await this.repo.update(ctx, id, {
      assignedTo: dto.to, priority: bumped[before.priority], status: "assigned",
      replies: before.replies, // unchanged; escalation reason goes in the generic activity note instead of the customer-visible thread
    } as Patch<TicketDoc>)).after;
  }

  async merge(ctx: RequestContext, id: string, dto: MergeTicketDto): Promise<TicketDoc> {
    if (id === dto.intoId) throw new BadRequestException("A ticket cannot be merged into itself");
    await this.repo.get(ctx, dto.intoId);
    return (await this.repo.update(ctx, id, { mergedIntoId: dto.intoId, status: "closed", closedAt: new Date().toISOString() } as Patch<TicketDoc>)).after;
  }

  async reopen(ctx: RequestContext, id: string, customerId: string | null): Promise<TicketDoc> {
    const before = await this.repo.get(ctx, id);
    if (customerId && before.customerId !== customerId) throw new BadRequestException("This is not your ticket");
    if (!["resolved", "closed"].includes(before.status)) throw new BadRequestException("Only a resolved or closed ticket can be reopened");
    return (await this.repo.update(ctx, id, { status: "open", resolvedAt: null, closedAt: null, reopenedCount: before.reopenedCount + 1 } as Patch<TicketDoc>)).after;
  }

  async rate(ctx: RequestContext, id: string, customerId: string, dto: RateSatisfactionDto): Promise<TicketDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.customerId !== customerId) throw new BadRequestException("This is not your ticket");
    if (!["resolved", "closed"].includes(before.status)) throw new BadRequestException("Rate a ticket once it's resolved");
    return (await this.repo.update(ctx, id, { satisfactionRating: dto.rating, satisfactionComment: orNull(dto.comment) } as Patch<TicketDoc>)).after;
  }

  async forCustomer(ctx: RequestContext, customerId: string): Promise<Page<TicketDoc>> {
    return this.list(ctx, { where: `customerId:${customerId}`, limit: 100 });
  }

  /** Looks up a ticket and checks it belongs to this customer, for the portal's own-ticket routes. */
  async getOwn(ctx: RequestContext, id: string, customerId: string): Promise<TicketDoc> {
    const ticket = await this.repo.get(ctx, id);
    if (ticket.customerId !== customerId) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  protected searchEntry(doc: TicketDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.subject, subtitle: doc.status };
  }
}

/**
 * Admin-side management of customer logins. Creation is staff-initiated only
 * (no self-registration); `provision`/`reissueSetupToken` share the same
 * one-time-token mechanism for both initial password setup and resets.
 */
@Injectable()
export class PortalUserService extends MasterDataService<PortalUserDoc, CreatePortalUserDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "support", entity: "portalUser", label: "Portal user", collection: SUPPORT_COLLECTIONS.portalUsers, route: "/support/portal-users",
      uniqueFields: ["emailLower"], filterFields: ["customerId"], searchFields: ["email"],
      references: [{ field: "customerId", collection: CRM_COLLECTIONS.accounts, label: "Customer" }], customFields: false,
    });
  }

  /** Creates the login and a one-time setup token the customer uses to choose their password. */
  async provision(ctx: RequestContext, dto: CreatePortalUserDto): Promise<{ user: PortalUserDoc; setupToken: string }> {
    const user = await super.create(ctx, dto);
    const setupToken = await this.issueSetupToken(ctx, user.id);
    return { user, setupToken };
  }

  /** For a forgotten password, or to resend a lost setup link; invalidates any token issued earlier is not needed since lookup is by the new token's own hash. */
  async reissueSetupToken(ctx: RequestContext, id: string): Promise<string> {
    const user = await this.repo.get(ctx, id);
    if (!user.isActive) throw new BadRequestException("This login is deactivated");
    return this.issueSetupToken(ctx, user.id);
  }

  async deactivate(ctx: RequestContext, id: string): Promise<PortalUserDoc> {
    return (await this.repo.update(ctx, id, { isActive: false } as Patch<PortalUserDoc>)).after;
  }

  async reactivate(ctx: RequestContext, id: string): Promise<PortalUserDoc> {
    return (await this.repo.update(ctx, id, { isActive: true } as Patch<PortalUserDoc>)).after;
  }

  private async issueSetupToken(ctx: RequestContext, portalUserId: string): Promise<string> {
    const token = randomBytes(24).toString("base64url");
    await this.firestore.collection(SUPPORT_COLLECTIONS.portalSetupTokens).doc(createHash("sha256").update(token).digest("hex")).set({
      portalUserId, tenantId: ctx.tenantId, companyId: ctx.companyId,
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + SETUP_TOKEN_DAYS * 86_400_000).toISOString(),
    });
    return token;
  }

  protected toNew(dto: CreatePortalUserDto): NewDoc<PortalUserDoc> {
    return { email: dto.email, emailLower: dto.email.toLowerCase(), customerId: dto.customerId, contactId: orNull(dto.contactId), passwordHash: null, isActive: true };
  }

  protected searchEntry(doc: PortalUserDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.email, subtitle: doc.isActive ? "Active" : "Deactivated" };
  }
}

export interface PortalContext {
  portalUserId: string;
  tenantId: string;
  companyId: string;
  customerId: string;
}

interface SetupTokenRecord {
  portalUserId: string;
  tenantId: string;
  companyId: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Customer-facing authentication, entirely separate from staff sign-in:
 * its own collection, its own JWT `scope` claim (rejected by the staff
 * `JwtStrategy`), a longer-lived token and no refresh mechanism.
 */
@Injectable()
export class PortalAuthService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly jwtService: JwtService,
  ) {}

  /** Cross-tenant lookup by email: which tenant/company the customer belongs to is not known at sign-in. */
  async login(dto: PortalLoginDto): Promise<{ accessToken: string; portalUser: { id: string; email: string; customerId: string } }> {
    const emailLower = dto.email.toLowerCase();
    const snap = await this.firestore.collection<PortalUserDoc>(SUPPORT_COLLECTIONS.portalUsers)
      .where("emailLower", "==", emailLower).where("isActive", "==", true).limit(1).get();
    const user = snap.empty ? null : snap.docs[0]!.data();
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? PORTAL_DUMMY_HASH);
    if (!user || !user.passwordHash || !valid) throw new UnauthorizedException("Invalid credentials");
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, scope: "portal", tenantId: user.tenantId, companyId: user.companyId, customerId: user.customerId },
      { expiresIn: "24h" },
    );
    return { accessToken, portalUser: { id: user.id, email: user.email, customerId: user.customerId } };
  }

  /** Sets the password from a one-time token issued by `PortalUserService` (covers both initial setup and a forgotten-password reset). */
  async setPassword(dto: PortalSetPasswordDto): Promise<{ ok: true }> {
    const tokenRef = this.firestore.collection(SUPPORT_COLLECTIONS.portalSetupTokens).doc(createHash("sha256").update(dto.token).digest("hex"));
    const record = (await tokenRef.get()).data() as SetupTokenRecord | undefined;
    if (!record || record.expiresAt < new Date().toISOString()) throw new UnauthorizedException("This link is not valid or has expired");
    const userRef = this.firestore.collection<PortalUserDoc>(SUPPORT_COLLECTIONS.portalUsers).doc(record.portalUserId);
    const user = (await userRef.get()).data();
    if (!user) throw new UnauthorizedException("This link is not valid");
    assertStrongPassword(dto.password, user.email);
    await userRef.update({ passwordHash: await bcrypt.hash(dto.password, 12), updatedAt: new Date().toISOString() });
    await tokenRef.delete();
    return { ok: true };
  }

  async changePassword(portalCtx: PortalContext, dto: PortalChangePasswordDto): Promise<{ ok: true }> {
    const userRef = this.firestore.collection<PortalUserDoc>(SUPPORT_COLLECTIONS.portalUsers).doc(portalCtx.portalUserId);
    const user = (await userRef.get()).data();
    if (!user || !user.passwordHash || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) throw new UnauthorizedException("Current password is wrong");
    assertStrongPassword(dto.newPassword, user.email);
    await userRef.update({ passwordHash: await bcrypt.hash(dto.newPassword, 12), updatedAt: new Date().toISOString() });
    return { ok: true };
  }
}
