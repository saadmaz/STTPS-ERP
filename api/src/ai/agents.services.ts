import { ForbiddenException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { ApprovalCompletedPayload, APPROVAL_COMPLETED } from "../platform/approvals/approvals.models.js";
import { ApprovalsService } from "../platform/approvals/approvals.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { hasPermission, RequestContext, systemContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { NotificationsService } from "../platform/notifications/notifications.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { RequisitionService } from "../procurement/procurement.services.js";
import { AGENT_ACTION_COLLECTIONS, AgentActionDoc } from "./agents.models.js";

/** Internal bookkeeping only — no public create/update DTO or controller; every row is written by `AiAgentService` itself. */
@Injectable()
export class AgentActionStore extends MasterDataService<AgentActionDoc, AgentActionDoc, AgentActionDoc> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "ai", entity: "agentAction", label: "AI agent action", collection: AGENT_ACTION_COLLECTIONS.actions,
      route: "/ai/agent-actions", filterFields: ["status", "tier"], customFields: false,
    });
  }
  protected toNew(dto: AgentActionDoc) { return dto; }
  protected toPatch(dto: AgentActionDoc) { return dto as Patch<AgentActionDoc>; }
  protected searchEntry(doc: AgentActionDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.actionName, subtitle: doc.status };
  }
}

interface AgentAction {
  domain: string;
  tier: AgentActionDoc["tier"];
  permission: string;
  execute: (ctx: RequestContext, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface AgentActResult {
  status: "executed" | "pending_approval" | "failed";
  result?: Record<string, unknown>;
  requestId?: string;
  error?: string;
}

/**
 * AI agents per domain with blueprint §28's five permission tiers. Every
 * call is written to `AgentActionStore` and audited regardless of tier;
 * `approval_required_execute` additionally defers the actual `execute()`
 * until a human decides the approval request — the exact two-phase
 * `prepare()` (outside any transaction) then `open()` (inside one) shape
 * `PurchaseOrderService.submit()` already uses, reused here rather than
 * re-derived. `read_only`/`draft` tiers already exist as the AI assistant's
 * tools and the document-extraction draft flow (the previous two Phase 6
 * items) — this catalog only adds `low_risk_execute` and
 * `approval_required_execute` examples, one each, deliberately not a large
 * catalog (see CLAUDE.md §9's AI agents note for why).
 */
@Injectable()
export class AiAgentService implements OnModuleInit {
  private readonly actions: Record<string, AgentAction>;

  constructor(
    private readonly store: AgentActionStore,
    private readonly firestore: FirestoreService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly notifications: NotificationsService,
    private readonly requisitions: RequisitionService,
  ) {
    this.actions = {
      notify_user: {
        domain: "platform", tier: "low_risk_execute", permission: "ai.agents.lowRiskExecute",
        execute: async (ctx, input) => {
          const userIds = Array.isArray(input.userIds) ? input.userIds.map(String) : [String(input.userId ?? ctx.userId)];
          const docs = this.notifications.notify({
            tenantId: ctx.tenantId, companyId: ctx.companyId, userIds, category: "ai.agent",
            title: String(input.title ?? "AI agent notification"), body: input.body ? String(input.body) : null,
          });
          return { notified: docs.length };
        },
      },
      create_requisition: {
        domain: "procurement", tier: "approval_required_execute", permission: "ai.agents.approvalRequiredExecute",
        execute: async (ctx, input) => {
          const lines = (input.lines as { productId?: string; description?: string; qty: string }[] | undefined) ?? [];
          if (lines.length === 0) throw new Error("At least one line is required");
          const req = await this.requisitions.create(ctx, { lines, justification: "Created by an AI agent action" });
          return { requisitionId: req.id };
        },
      },
    };
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "ai.agentActionApproval", async (event) => {
      if (event.payload.entityType !== "ai.agentAction") return;
      const ctx = systemContext(event, event.payload.decidedBy);
      if (event.payload.outcome === "approved") await this.executeAndRecord(ctx, event.payload.entityId);
      else await this.store.repo.update(ctx, event.payload.entityId, { status: "rejected" } as Patch<AgentActionDoc>);
    });
  }

  async act(ctx: RequestContext, actionName: string, input: Record<string, unknown>): Promise<AgentActResult> {
    const action = this.actions[actionName];
    if (!action) throw new NotFoundException(`Unknown agent action "${actionName}"`);
    if (!hasPermission(ctx, action.permission)) throw new ForbiddenException(`Permission required: ${action.permission}`);

    const doc = await this.store.repo.create(ctx, {
      actionName, domain: action.domain, tier: action.tier, input,
      status: action.tier === "approval_required_execute" ? "pending_approval" : "executed",
      result: null, error: null, requestedBy: ctx.userId,
    });
    this.audit.record(ctx, { module: "ai", action: `agent.${actionName}`, entity: "ai.agentAction", entityId: doc.id, after: { tier: action.tier, input } });

    if (action.tier !== "approval_required_execute") return this.executeAndRecord(ctx, doc.id);

    const prepared = await this.approvals.prepare(ctx, {
      entityType: "ai.agentAction", entityId: doc.id, entityLabel: `${actionName} (AI agent request)`, link: `/ai/agent-actions/${doc.id}`,
      facts: { actionName, ...input },
    });
    const request = await this.firestore.runTransaction(async (tx) => {
      const before = await this.store.repo.get(ctx, doc.id, tx);
      const req = await this.approvals.open(tx, ctx, prepared);
      this.store.repo.applyUpdate(ctx, tx, before, { status: req.status === "approved" ? "approved" : "pending_approval" });
      return req;
    });
    if (request.status === "approved") return this.executeAndRecord(ctx, doc.id);
    return { status: "pending_approval", requestId: request.id };
  }

  private async executeAndRecord(ctx: RequestContext, id: string): Promise<AgentActResult> {
    const doc = await this.store.repo.get(ctx, id);
    const action = this.actions[doc.actionName];
    try {
      const result = await action!.execute(ctx, doc.input);
      await this.store.repo.update(ctx, id, { status: "executed", result } as Patch<AgentActionDoc>);
      return { status: "executed", result };
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);
      await this.store.repo.update(ctx, id, { status: "failed", error: message } as Patch<AgentActionDoc>);
      return { status: "failed", error: message };
    }
  }
}
