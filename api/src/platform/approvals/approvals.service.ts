import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { COLLECTIONS } from "../../firestore/collections.js";
import { CompanyUserDoc, UserDoc, UserRoleDoc } from "../../firestore/models.js";
import { AuditService } from "../audit/audit.service.js";
import { hasPermission, RequestContext, Scope, systemContext } from "../context/request-context.js";
import { TenantRepository } from "../data/repository.js";
import { EventBusService } from "../events/event-bus.service.js";
import { JobDoc, JobQueueService } from "../jobs/job-queue.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  APPROVAL_COLLECTIONS,
  APPROVAL_COMPLETED,
  ApprovalCompletedPayload,
  ApprovalDefinitionDoc,
  ApprovalRequestDoc,
  ApproverSpec,
  Condition,
  DecisionRecord,
  DelegationDoc,
  RequestStep,
} from "./approvals.models.js";

const DEPARTMENTS_COLLECTION = "orgDepartments";

export interface SubmitInput {
  entityType: string;
  entityId: string;
  entityLabel: string;
  link?: string | null;
  /** Values conditions are evaluated against: amount (minor units), departmentId, branchId, category … */
  facts: Record<string, unknown>;
}

export interface PreparedApproval {
  definition: ApprovalDefinitionDoc | null;
  steps: RequestStep[];
  input: SubmitInput;
}

export function evaluate(conditions: Condition[] | undefined, facts: Record<string, unknown>): boolean {
  return (conditions ?? []).every((c) => {
    const actual = facts[c.fact];
    const expected = c.value;
    switch (c.op) {
      case "eq": return actual === expected;
      case "neq": return actual !== expected;
      case "gt": return typeof actual === "number" && actual > Number(expected);
      case "gte": return typeof actual === "number" && actual >= Number(expected);
      case "lt": return typeof actual === "number" && actual < Number(expected);
      case "lte": return typeof actual === "number" && actual <= Number(expected);
      case "in": return Array.isArray(expected) && expected.includes(actual as string | number);
      case "nin": return Array.isArray(expected) && !expected.includes(actual as string | number);
      default: return false;
    }
  });
}

/**
 * The shared approval engine (blueprint §22). Modules never hard-code
 * approval chains: they call `prepare` (reads, outside their transaction) and
 * `open` (writes, inside it), set their record to "pending approval", and
 * subscribe to `ApprovalCompleted` to move it on.
 */
@Injectable()
export class ApprovalsService implements OnModuleInit {
  readonly definitions: TenantRepository<ApprovalDefinitionDoc>;
  readonly requests: TenantRepository<ApprovalRequestDoc>;
  readonly delegations: TenantRepository<DelegationDoc>;

  constructor(
    private readonly firestore: FirestoreService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly jobs: JobQueueService,
    private readonly notifications: NotificationsService,
  ) {
    this.definitions = new TenantRepository(firestore, APPROVAL_COLLECTIONS.definitions, "Approval workflow");
    this.requests = new TenantRepository(firestore, APPROVAL_COLLECTIONS.requests, "Approval request");
    this.delegations = new TenantRepository(firestore, APPROVAL_COLLECTIONS.delegations, "Delegation");
  }

  onModuleInit(): void {
    this.jobs.register<{ tenantId: string; companyId: string; requestId: string; step: number }>(
      "approval.timeout",
      (job: JobDoc<{ tenantId: string; companyId: string; requestId: string; step: number }>) => this.escalate(job.payload),
    );
  }

  // ---- Submission ---------------------------------------------------------

  /** Picks the matching definition and resolves every step's approvers. No writes. */
  async prepare(ctx: RequestContext, input: SubmitInput): Promise<PreparedApproval> {
    const all = (await this.definitions.collection.where("companyId", "==", ctx.companyId).get()).docs
      .map((d) => d.data())
      .filter((d) => d.archivedAt == null && d.isActive && d.entityType === input.entityType)
      .sort((a, b) => a.priority - b.priority);
    const definition = all.find((d) => evaluate(d.conditions, input.facts)) ?? null;
    if (!definition) return { definition: null, steps: [], input };

    const steps: RequestStep[] = [];
    for (const step of definition.steps) {
      const applies = evaluate(step.conditions, input.facts);
      let approverIds = applies ? await this.resolveApprovers(ctx, step.approvers, input.facts) : [];
      if (!definition.allowSelfApproval) approverIds = approverIds.filter((id) => id !== ctx.userId);
      if (applies && approverIds.length === 0) {
        throw new BadRequestException(`Approval step "${step.name}" has no eligible approvers; check workflow ${definition.code}`);
      }
      steps.push({
        name: step.name,
        minApprovals: Math.min(step.minApprovals, Math.max(approverIds.length, 1)),
        approverIds,
        approvedBy: [],
        status: applies ? "waiting" : "skipped",
        startedAt: null,
        completedAt: null,
        timeoutHours: step.timeoutHours ?? null,
        escalateTo: step.escalateTo ?? null,
        escalated: false,
      });
    }
    return { definition, steps, input };
  }

  /**
   * Creates the request inside the caller's transaction. It reads delegations,
   * so call it before the caller writes anything (a Firestore rule). When no workflow applies the request is recorded
   * as auto-approved and returned with status "approved": the caller moves
   * its record straight on, and no event is published.
   */
  async open(tx: Transaction, ctx: RequestContext, prepared: PreparedApproval): Promise<ApprovalRequestDoc> {
    const { definition, input } = prepared;
    const now = new Date().toISOString();
    const steps = prepared.steps.map((s) => ({ ...s }));
    const first = steps.findIndex((s) => s.status === "waiting");
    const autoApproved = !definition || first < 0;
    if (!autoApproved) {
      steps[first]!.status = "pending";
      steps[first]!.startedAt = now;
    }
    const delegates = autoApproved ? new Map<string, string>() : await this.activeDelegates(tx, ctx, steps[first]!.approverIds, input.entityType);
    const request = this.requests.build(ctx, {
      definitionId: definition?.id ?? null,
      definitionName: definition?.name ?? "No approval required",
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      link: input.link ?? null,
      facts: input.facts,
      requesterId: ctx.userId,
      status: autoApproved ? "approved" : "pending",
      currentStep: autoApproved ? -1 : first,
      steps,
      decisions: autoApproved
        ? [{ step: -1, userId: ctx.userId, onBehalfOf: null, decision: "auto_approved", comment: null, at: now }]
        : [],
      pendingKeys: autoApproved ? [] : this.pendingKeys(ctx, steps[first]!, delegates),
      completedAt: autoApproved ? now : null,
    });
    tx.create(this.requests.ref(request.id), request);
    this.audit.record(ctx, { module: "workflow", action: autoApproved ? "auto_approved" : "submitted", entity: input.entityType, entityId: input.entityId, after: { requestId: request.id, workflow: request.definitionName } }, tx);
    if (!autoApproved) this.onStepStarted(tx, ctx, request, first, delegates);
    return request;
  }

  /** prepare + open in one transaction, for callers with nothing else to write. */
  async submit(ctx: RequestContext, input: SubmitInput): Promise<ApprovalRequestDoc> {
    const prepared = await this.prepare(ctx, input);
    return this.firestore.runTransaction((tx) => this.open(tx, ctx, prepared));
  }

  // ---- Decisions ----------------------------------------------------------

  async approve(ctx: RequestContext, id: string, comment?: string | null): Promise<ApprovalRequestDoc> {
    return this.act(ctx, id, async (tx, request, actingFor) => {
      const step = request.steps[request.currentStep]!;
      if (step.approvedBy.includes(actingFor)) throw new BadRequestException("You have already approved this step");
      step.approvedBy.push(actingFor);
      this.pushDecision(request, ctx.userId, actingFor, "approved", comment);
      if (step.approvedBy.length < step.minApprovals) {
        request.pendingKeys = this.pendingKeys(ctx, step, await this.activeDelegates(tx, ctx, step.approverIds, request.entityType));
        return {};
      }
      step.status = "approved";
      step.completedAt = new Date().toISOString();
      const next = request.steps.findIndex((s, i) => i > request.currentStep && s.status === "waiting");
      if (next < 0) {
        this.complete(request, "approved");
        return { completed: "approved" as const };
      }
      request.currentStep = next;
      request.steps[next]!.status = "pending";
      request.steps[next]!.startedAt = new Date().toISOString();
      const delegates = await this.activeDelegates(tx, ctx, request.steps[next]!.approverIds, request.entityType);
      request.pendingKeys = this.pendingKeys(ctx, request.steps[next]!, delegates);
      return { startedStep: next, delegates };
    });
  }

  async reject(ctx: RequestContext, id: string, comment: string): Promise<ApprovalRequestDoc> {
    if (!comment?.trim()) throw new BadRequestException("A reason is required to reject");
    return this.act(ctx, id, async (_tx, request, actingFor) => {
      request.steps[request.currentStep]!.status = "rejected";
      request.steps[request.currentStep]!.completedAt = new Date().toISOString();
      this.pushDecision(request, ctx.userId, actingFor, "rejected", comment);
      this.complete(request, "rejected");
      return { completed: "rejected" as const };
    });
  }

  async requestChanges(ctx: RequestContext, id: string, comment: string): Promise<ApprovalRequestDoc> {
    if (!comment?.trim()) throw new BadRequestException("Say what needs to change");
    return this.act(ctx, id, async (_tx, request, actingFor) => {
      this.pushDecision(request, ctx.userId, actingFor, "changes_requested", comment);
      this.complete(request, "changes_requested");
      return { completed: "changes_requested" as const };
    });
  }

  /** Hands the current step from the acting approver to another user. */
  async reassign(ctx: RequestContext, id: string, toUserId: string, comment?: string | null): Promise<ApprovalRequestDoc> {
    const target = (await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(toUserId).get()).data();
    if (!target || target.tenantId !== ctx.tenantId || !target.isActive) throw new BadRequestException("User not found");
    return this.act(ctx, id, async (tx, request, actingFor) => {
      const step = request.steps[request.currentStep]!;
      if (step.approverIds.includes(toUserId)) throw new BadRequestException("That user is already an approver of this step");
      step.approverIds = step.approverIds.map((a) => (a === actingFor ? toUserId : a));
      this.pushDecision(request, ctx.userId, actingFor, "reassigned", comment ? `${comment} (to ${toUserId})` : `Reassigned to ${toUserId}`);
      const delegates = await this.activeDelegates(tx, ctx, step.approverIds, request.entityType);
      request.pendingKeys = this.pendingKeys(ctx, step, delegates);
      return { notifyUsers: [toUserId] };
    });
  }

  /** Withdraws a pending request (the requester, or anyone with workflow.request.manage). */
  async cancel(ctx: RequestContext, id: string, comment?: string | null): Promise<ApprovalRequestDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const request = await this.requests.get(ctx, id, tx);
      if (request.status !== "pending") throw new BadRequestException("Only pending requests can be cancelled");
      if (request.requesterId !== ctx.userId && !hasPermission(ctx, "workflow.request.manage")) {
        throw new ForbiddenException("Only the requester can cancel this request");
      }
      const next = structuredClone(request);
      this.pushDecision(next, ctx.userId, ctx.userId, "cancelled", comment ?? null);
      this.complete(next, "cancelled");
      return this.persist(tx, ctx, request, next, { completed: "cancelled" });
    });
  }

  // ---- Queries -------------------------------------------------------------

  /** Requests waiting for this user (as approver or active delegate). */
  async waitingFor(ctx: RequestContext): Promise<ApprovalRequestDoc[]> {
    const snap = await this.requests.collection
      .where("pendingKeys", "array-contains", `${ctx.companyId}:${ctx.userId}`)
      .limit(200)
      .get();
    return snap.docs.map((d) => d.data()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async submittedBy(ctx: RequestContext): Promise<ApprovalRequestDoc[]> {
    const snap = await this.requests.collection
      .where("companyId", "==", ctx.companyId)
      .where("requesterId", "==", ctx.userId)
      .limit(200)
      .get();
    return snap.docs.map((d) => d.data()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Every request for one record, newest first. */
  async forEntity(ctx: RequestContext, entityType: string, entityId: string): Promise<ApprovalRequestDoc[]> {
    const snap = await this.requests.collection
      .where("companyId", "==", ctx.companyId)
      .where("entityType", "==", entityType)
      .where("entityId", "==", entityId)
      .get();
    return snap.docs.map((d) => d.data()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** One request, visible to its requester, its approvers and holders of workflow.request.view. */
  async getVisible(ctx: RequestContext, id: string): Promise<ApprovalRequestDoc> {
    const request = await this.requests.get(ctx, id);
    const involved =
      request.requesterId === ctx.userId ||
      request.steps.some((s) => s.approverIds.includes(ctx.userId)) ||
      request.pendingKeys.includes(`${ctx.companyId}:${ctx.userId}`);
    if (!involved && !hasPermission(ctx, "workflow.request.view")) throw new NotFoundException("Approval request not found");
    return request;
  }

  // ---- Internals -------------------------------------------------------------

  private async act(
    ctx: RequestContext,
    id: string,
    mutate: (tx: Transaction, request: ApprovalRequestDoc, actingFor: string) => Promise<TransitionEffects>,
  ): Promise<ApprovalRequestDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const request = await this.requests.get(ctx, id, tx);
      if (request.status !== "pending") throw new BadRequestException(`This request is already ${request.status.replace("_", " ")}`);
      const step = request.steps[request.currentStep]!;
      const actingFor = await this.eligibility(tx, ctx, request, step);
      const next = structuredClone(request);
      const effects = await mutate(tx, next, actingFor);
      return this.persist(tx, ctx, request, next, effects);
    });
  }

  /** The approver the user acts for: themselves, or the approver who delegated to them. */
  private async eligibility(tx: Transaction, ctx: RequestContext, request: ApprovalRequestDoc, step: RequestStep): Promise<string> {
    if (step.approverIds.includes(ctx.userId) && !step.approvedBy.includes(ctx.userId)) return ctx.userId;
    const delegates = await this.activeDelegates(tx, ctx, step.approverIds.filter((a) => !step.approvedBy.includes(a)), request.entityType);
    for (const [principal, delegate] of delegates) if (delegate === ctx.userId) return principal;
    if (step.approverIds.includes(ctx.userId)) return ctx.userId; // already approved: let approve() report it
    throw new ForbiddenException("You are not an approver of the current step");
  }

  private persist(
    tx: Transaction,
    ctx: RequestContext,
    before: ApprovalRequestDoc,
    next: ApprovalRequestDoc,
    effects: TransitionEffects,
  ): ApprovalRequestDoc {
    const { after } = this.requests.applyUpdate(ctx, tx, before, {
      status: next.status,
      currentStep: next.currentStep,
      steps: next.steps,
      decisions: next.decisions,
      pendingKeys: next.pendingKeys,
      completedAt: next.completedAt,
    });
    const last = next.decisions[next.decisions.length - 1];
    this.audit.record(ctx, {
      module: "workflow",
      action: last?.decision ?? "updated",
      entity: before.entityType,
      entityId: before.entityId,
      after: { requestId: before.id, step: last?.step, comment: last?.comment },
    }, tx);

    if (effects.completed) {
      const payload: ApprovalCompletedPayload = {
        requestId: after.id,
        entityType: after.entityType,
        entityId: after.entityId,
        outcome: effects.completed,
        comment: last?.comment ?? null,
        decidedBy: ctx.userId,
      };
      this.events.publish(tx, ctx, APPROVAL_COMPLETED, { entity: after.entityType, entityId: after.entityId }, payload);
      if (after.requesterId !== ctx.userId) {
        this.notifications.notify({
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          userIds: [after.requesterId],
          category: "approval.result",
          title: `${after.entityLabel}: ${effects.completed.replace("_", " ")}`,
          body: last?.comment ?? null,
          link: after.link,
          entityType: after.entityType,
          entityId: after.entityId,
          priority: effects.completed === "approved" ? "normal" : "high",
        }, tx);
      }
    } else if (effects.startedStep !== undefined) {
      this.onStepStarted(tx, ctx, after, effects.startedStep, effects.delegates ?? new Map());
    } else if (effects.notifyUsers?.length) {
      this.notifyApprovers(tx, ctx, after, effects.notifyUsers);
    }
    return after;
  }

  private onStepStarted(tx: Transaction, ctx: RequestContext, request: ApprovalRequestDoc, index: number, delegates: Map<string, string>): void {
    const step = request.steps[index]!;
    this.notifyApprovers(tx, ctx, request, [...step.approverIds, ...delegates.values()]);
    if (step.timeoutHours && step.timeoutHours > 0) {
      this.jobs.enqueueInTx(
        tx,
        "approval.timeout",
        { tenantId: ctx.tenantId, companyId: ctx.companyId, requestId: request.id, step: index },
        { id: `approval_timeout_${request.id}_${index}`, runAt: new Date(Date.now() + step.timeoutHours * 3_600_000), scope: ctx },
      );
    }
  }

  private notifyApprovers(tx: Transaction, ctx: RequestContext, request: ApprovalRequestDoc, userIds: string[]): void {
    this.notifications.notify({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      userIds,
      category: "approval.request",
      title: `Approval needed: ${request.entityLabel}`,
      body: `${request.definitionName}, step "${request.steps[request.currentStep]?.name ?? ""}"`,
      link: request.link,
      entityType: request.entityType,
      entityId: request.entityId,
      priority: "high",
    }, tx);
  }

  private async escalate(payload: { tenantId: string; companyId: string; requestId: string; step: number }): Promise<string> {
    const ctx = systemContext(payload);
    return this.firestore.runTransaction(async (tx) => {
      const request = await this.requests.find(ctx, payload.requestId, tx);
      if (!request || request.status !== "pending" || request.currentStep !== payload.step) return "no longer pending";
      const step = request.steps[payload.step]!;
      if (step.escalated) return "already escalated";
      const extra = step.escalateTo?.length ? await this.resolveApprovers(ctx, step.escalateTo, request.facts) : [];
      const next = structuredClone(request);
      const nextStep = next.steps[payload.step]!;
      nextStep.escalated = true;
      nextStep.approverIds = [...new Set([...nextStep.approverIds, ...extra])];
      const delegates = await this.activeDelegates(tx, ctx, nextStep.approverIds, request.entityType);
      next.pendingKeys = this.pendingKeys(ctx, nextStep, delegates);
      this.pushDecision(next, "system", "system", "escalated", `No decision within ${step.timeoutHours} hours`);
      this.persist(tx, ctx, request, next, { notifyUsers: extra.length ? extra : nextStep.approverIds });
      return `escalated to ${extra.length} more approver(s)`;
    });
  }

  private complete(request: ApprovalRequestDoc, status: "approved" | "rejected" | "changes_requested" | "cancelled"): void {
    request.status = status;
    request.pendingKeys = [];
    request.completedAt = new Date().toISOString();
  }

  private pushDecision(request: ApprovalRequestDoc, userId: string, actingFor: string, decision: DecisionRecord["decision"], comment: string | null | undefined): void {
    request.decisions.push({
      step: request.currentStep,
      userId,
      onBehalfOf: actingFor !== userId ? actingFor : null,
      decision,
      comment: comment?.trim() || null,
      at: new Date().toISOString(),
    });
  }

  private pendingKeys(scope: Scope, step: RequestStep, delegates: Map<string, string>): string[] {
    const waiting = step.approverIds.filter((a) => !step.approvedBy.includes(a));
    const users = new Set(waiting);
    for (const principal of waiting) {
      const delegate = delegates.get(principal);
      if (delegate) users.add(delegate);
    }
    return [...users].map((u) => `${scope.companyId}:${u}`);
  }

  /** principal -> delegate, for delegations active today covering this entity type. */
  private async activeDelegates(tx: Transaction, scope: Scope, principals: string[], entityType: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (principals.length === 0) return map;
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < principals.length; i += 30) {
      const q = this.delegations.collection.where("companyId", "==", scope.companyId).where("userId", "in", principals.slice(i, i + 30));
      const snap = await tx.get(q);
      for (const d of snap.docs.map((x) => x.data())) {
        if (d.archivedAt) continue;
        if (d.startDate > today || d.endDate < today) continue;
        if (d.entityTypes.length && !d.entityTypes.includes(entityType)) continue;
        map.set(d.userId, d.delegateUserId);
      }
    }
    return map;
  }

  /** Resolves approver specs to active user ids of the tenant. */
  async resolveApprovers(scope: Scope, specs: ApproverSpec[], facts: Record<string, unknown>): Promise<string[]> {
    const ids = new Set<string>();
    for (const spec of specs) {
      switch (spec.type) {
        case "user":
          (spec.ids ?? []).forEach((id) => ids.add(id));
          break;
        case "role": {
          for (let i = 0; i < (spec.ids ?? []).length; i += 30) {
            const snap = await this.firestore.collection<UserRoleDoc>(COLLECTIONS.userRoles).where("roleId", "in", spec.ids!.slice(i, i + 30)).get();
            const suffix = `_${scope.companyId}`;
            snap.docs.map((d) => d.data().companyUserId).filter((cu) => cu.endsWith(suffix)).forEach((cu) => ids.add(cu.slice(0, -suffix.length)));
          }
          break;
        }
        case "permission": {
          const snap = await this.firestore.collection<CompanyUserDoc>(COLLECTIONS.companyUsers).where("companyId", "==", scope.companyId).get();
          snap.docs
            .map((d) => d.data())
            .filter((cu) => (spec.ids ?? []).some((code) => cu.permissionCodes.includes(code)))
            .forEach((cu) => ids.add(cu.userId));
          break;
        }
        case "departmentManager":
        case "requesterManager": {
          const departmentId = facts[spec.type === "departmentManager" ? "departmentId" : "requesterDepartmentId"];
          if (typeof departmentId !== "string") break;
          const department = (await this.firestore.collection(DEPARTMENTS_COLLECTION).doc(departmentId).get()).data() as
            | { companyId: string; managerUserId: string | null }
            | undefined;
          if (department?.companyId === scope.companyId && department.managerUserId) ids.add(department.managerUserId);
          break;
        }
      }
    }
    if (ids.size === 0) return [];
    const users = await this.firestore.db.getAll(...[...ids].map((id) => this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(id)));
    return users
      .map((u) => u.data() as UserDoc | undefined)
      .filter((u): u is UserDoc => !!u && u.isActive && u.tenantId === scope.tenantId)
      .map((u) => u.id);
  }
}

interface TransitionEffects {
  completed?: "approved" | "rejected" | "changes_requested" | "cancelled";
  startedStep?: number;
  delegates?: Map<string, string>;
  notifyUsers?: string[];
}
