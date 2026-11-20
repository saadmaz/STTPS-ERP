import { randomUUID } from "node:crypto";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, systemContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { ListQueryDto } from "../platform/crud/list-query.dto.js";
import { fromQty } from "../platform/data/money.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { DomainEvent, EventBusService } from "../platform/events/event-bus.service.js";
import { ModulesService } from "../platform/modules/modules.service.js";
import { NotificationPriority, NotificationsService } from "../platform/notifications/notifications.service.js";
import { RecordsService } from "../platform/records/records.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { RequisitionService } from "../procurement/procurement.services.js";
import { TaskService } from "../tasks/tasks.services.js";
import { CreateAutomationRuleDto, UpdateAutomationRuleDto } from "./automation.dto.js";
import {
  AUTOMATION_COLLECTIONS, AUTOMATION_EVENT_TYPES, AutomationAction, AutomationCondition, AutomationRuleDoc, AutomationRunLogEntry,
} from "./automation.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

/** `{{path}}` substitutes a context value; `{{qty:path}}` reads a thousandths-scaled quantity and renders it as a decimal string. */
function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(qty:)?([\w.]+)\s*\}\}/g, (_match, qtyPrefix: string | undefined, path: string) => {
    const raw = getPath(context, path);
    if (qtyPrefix) {
      const n = Number(raw);
      return Number.isFinite(n) ? fromQty(n) : "0";
    }
    return raw === undefined || raw === null ? "" : String(raw);
  });
}

function evaluateCondition(cond: AutomationCondition, context: Record<string, unknown>): boolean {
  const actual = getPath(context, cond.field);
  const actualStr = actual === undefined || actual === null ? "" : String(actual);
  const actualNum = Number(actual);
  const valueNum = Number(cond.value);
  const bothNumeric = actual !== undefined && actual !== null && cond.value !== "" && Number.isFinite(actualNum) && Number.isFinite(valueNum);
  switch (cond.operator) {
    case "eq":
      return bothNumeric ? actualNum === valueNum : actualStr === cond.value;
    case "neq":
      return bothNumeric ? actualNum !== valueNum : actualStr !== cond.value;
    case "gt":
      return bothNumeric && actualNum > valueNum;
    case "gte":
      return bothNumeric && actualNum >= valueNum;
    case "lt":
      return bothNumeric && actualNum < valueNum;
    case "lte":
      return bothNumeric && actualNum <= valueNum;
    case "contains":
      return actualStr.includes(cond.value);
  }
}

@Injectable()
export class AutomationRuleService extends MasterDataService<AutomationRuleDoc, CreateAutomationRuleDto, UpdateAutomationRuleDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "automation", entity: "rule", label: "Automation rule", collection: AUTOMATION_COLLECTIONS.rules, route: "/automation/rules",
      filterFields: ["active", "eventType"], customFields: false,
    });
  }

  protected toNew(dto: CreateAutomationRuleDto): NewDoc<AutomationRuleDoc> {
    return {
      name: dto.name, description: orNull(dto.description), active: dto.active ?? true, eventType: dto.eventType,
      conditions: (dto.conditions ?? []).map((c) => ({ field: c.field, operator: c.operator, value: c.value })),
      actions: (dto.actions ?? []).map((a) => ({ type: a.type, config: a.config })),
      recentRuns: [],
    };
  }

  protected toPatch(dto: UpdateAutomationRuleDto): Patch<AutomationRuleDoc> {
    const { conditions, actions, ...rest } = dto;
    return {
      ...rest,
      ...(conditions ? { conditions: conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value })) } : {}),
      ...(actions ? { actions: actions.map((a) => ({ type: a.type, config: a.config })) } : {}),
    } as Patch<AutomationRuleDoc>;
  }

  /** Appends a firing's outcome; not reachable through the public PATCH, since recentRuns isn't part of the update DTO. */
  async recordRun(ctx: RequestContext, id: string, entry: AutomationRunLogEntry): Promise<AutomationRuleDoc> {
    const rule = await this.repo.get(ctx, id);
    const recentRuns = [entry, ...rule.recentRuns].slice(0, 20);
    return (await this.repo.update(ctx, id, { recentRuns } as Patch<AutomationRuleDoc>)).after;
  }

  protected searchEntry(doc: AutomationRuleDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.eventType };
  }
}

/**
 * The no-code engine: one generic subscriber per known event type, fanning
 * out to every active rule configured for it. Conditions and actions are
 * evaluated against the event's own envelope and payload only — never a
 * live re-fetch of the full record (see automation.models.ts) — so firing
 * stays cheap and self-contained.
 */
@Injectable()
export class AutomationEngineService implements OnModuleInit {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly events: EventBusService,
    private readonly modules: ModulesService,
    private readonly notifications: NotificationsService,
    private readonly records: RecordsService,
    private readonly rules: AutomationRuleService,
    private readonly requisitions: RequisitionService,
    private readonly tasks: TaskService,
  ) {}

  onModuleInit(): void {
    for (const type of AUTOMATION_EVENT_TYPES) {
      this.events.subscribe(type, `automation.on.${type}`, (event) => this.handle(event));
    }
  }

  async handle(event: DomainEvent): Promise<void> {
    if (!(await this.modules.isEnabled(event.tenantId, "automation"))) return;
    const ctx = systemContext(event, event.actorId);
    const page = await this.rules.list(ctx, { where: `active:true,eventType:${event.type}`, limit: 200 } as ListQueryDto);
    for (const rule of page.items) await this.fire(ctx, rule, event);
  }

  async fire(ctx: RequestContext, rule: AutomationRuleDoc, event: DomainEvent): Promise<AutomationRuleDoc> {
    const eventCtx = { type: event.type, entity: event.entity, entityId: event.entityId, actorId: event.actorId, occurredAt: event.occurredAt, payload: event.payload };
    const matched = rule.conditions.every((c) => evaluateCondition(c, eventCtx));
    const actions = matched ? await Promise.all(rule.actions.map((a) => this.runAction(ctx, a, eventCtx, event))) : [];
    const entry: AutomationRunLogEntry = { at: new Date().toISOString(), eventId: event.id.startsWith("test_") ? null : event.id, matched, actions };
    return this.rules.recordRun(ctx, rule.id, entry);
  }

  /** Fires a rule against a synthetic event, for an author to check it before relying on it. */
  async testRun(ctx: RequestContext, ruleId: string, payloadOverride: Record<string, unknown> = {}): Promise<AutomationRuleDoc> {
    const rule = await this.rules.repo.get(ctx, ruleId);
    const event: DomainEvent = {
      id: `test_${randomUUID()}`, type: rule.eventType, tenantId: ctx.tenantId, companyId: ctx.companyId, actorId: ctx.userId,
      occurredAt: new Date().toISOString(), entity: "automation.rule", entityId: rule.id, payload: payloadOverride,
    };
    return this.fire(ctx, rule, event);
  }

  private async runAction(
    ctx: RequestContext,
    action: AutomationAction,
    eventCtx: Record<string, unknown>,
    event: DomainEvent,
  ): Promise<{ type: string; ok: boolean; error?: string }> {
    const cfg: Record<string, string> = {};
    for (const [k, v] of Object.entries(action.config)) cfg[k] = renderTemplate(v, eventCtx);
    try {
      switch (action.type) {
        case "notify": {
          const ids = (cfg.userIds ?? "")
            .split(",")
            .map((s) => s.trim())
            .map((s) => (s === "actor" ? event.actorId ?? "" : s))
            .filter(Boolean);
          if (ids.length === 0) throw new Error("No recipients resolved for userIds");
          await this.firestore.runTransaction(async (tx) => {
            this.notifications.notify(
              {
                tenantId: ctx.tenantId, companyId: ctx.companyId, userIds: ids, category: cfg.category || "automation",
                title: cfg.title || "Automation alert", body: cfg.body || null, link: null, entityType: event.entity, entityId: event.entityId,
                priority: (cfg.priority as NotificationPriority) || "normal",
              },
              tx,
            );
          });
          break;
        }
        case "create_task": {
          const assigneeId = cfg.assigneeId === "actor" ? event.actorId ?? undefined : cfg.assigneeId || undefined;
          const dueInDays = Number(cfg.dueInDays);
          const dueDate = cfg.dueInDays && Number.isFinite(dueInDays) ? new Date(Date.now() + dueInDays * 86_400_000).toISOString().slice(0, 10) : undefined;
          const task = await this.tasks.create(ctx, { title: cfg.title || "Automation task", description: cfg.description || undefined, assigneeId, dueDate });
          await this.records.link(ctx, { type: "tasks.task", id: task.id }, { type: event.entity, id: event.entityId }, "about").catch(() => {});
          break;
        }
        case "create_requisition": {
          if (!cfg.productId) throw new Error("productId did not resolve to a value");
          if (!cfg.qty) throw new Error("qty did not resolve to a value");
          const requisition = await this.requisitions.create(ctx, {
            lines: [{ productId: cfg.productId, qty: cfg.qty }],
            justification: cfg.justification || "Auto-created by an automation rule",
          });
          await this.records.link(ctx, { type: "procurement.requisition", id: requisition.id }, { type: event.entity, id: event.entityId }, "about").catch(() => {});
          break;
        }
      }
      return { type: action.type, ok: true };
    } catch (error) {
      return { type: action.type, ok: false, error: (error as Error).message.slice(0, 300) };
    }
  }
}
