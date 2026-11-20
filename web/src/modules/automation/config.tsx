"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDateTime, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";

export const AUTOMATION_EVENT_TYPES = [
  "LowStock", "StockMoved", "GoodsReceived", "GoodsDispatched", "PurchaseOrderApproved", "SupplierReturnShipped",
  "SalesOrderConfirmed", "SalesDelivered", "SalesReturnReceived", "QuoteAccepted", "InvoicePosted", "CreditNotePosted",
  "DebitNotePosted", "PaymentReceived", "SupplierPaymentMade", "ExpenseClaimApproved", "LeadConverted", "OpportunityWon", "OpportunityLost",
] as const;
export const AUTOMATION_CONDITION_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains"] as const;
export const AUTOMATION_ACTION_TYPES = ["notify", "create_task", "create_requisition"] as const;

export interface AutomationCondition { field: string; operator: (typeof AUTOMATION_CONDITION_OPERATORS)[number]; value: string }
export interface AutomationAction { type: (typeof AUTOMATION_ACTION_TYPES)[number]; config: Record<string, string> }
export interface AutomationRunLogEntry { at: string; eventId: string | null; matched: boolean; actions: { type: string; ok: boolean; error?: string }[] }

export interface AutomationRule extends BaseRecord {
  name: string; description: string | null; active: boolean; eventType: (typeof AUTOMATION_EVENT_TYPES)[number];
  conditions: AutomationCondition[]; actions: AutomationAction[]; recentRuns: AutomationRunLogEntry[];
}

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const automationApi = {
  rules: crud<AutomationRule>("/automation/rules"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

/** Parses "key:value,key2:value2" the same way every list endpoint's `where` filter does. */
function parsePairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(",")) {
    const i = part.indexOf(":");
    if (i <= 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const pairsToText = (config: Record<string, string>) => Object.entries(config).map(([k, v]) => `${k}:${v}`).join(",");

interface ConditionRow { field: string; operator: (typeof AUTOMATION_CONDITION_OPERATORS)[number]; value: string }
interface ActionRow { type: (typeof AUTOMATION_ACTION_TYPES)[number]; config: string }
const blankCondition = (): ConditionRow => ({ field: "payload.", operator: "eq", value: "" });
const blankAction = (): ActionRow => ({ type: "notify", config: "" });

function RuleEditor({ r }: { r: AutomationRule }) {
  const canEdit = useCan("automation.rule.edit");
  const [conditions, setConditions] = useState<ConditionRow[]>(r.conditions.length ? r.conditions.map((c) => ({ ...c })) : [blankCondition()]);
  const [actions, setActions] = useState<ActionRow[]>(r.actions.length ? r.actions.map((a) => ({ type: a.type, config: pairsToText(a.config) })) : [blankAction()]);
  const save = useMutation({
    mutationFn: () =>
      automationApi.rules.update(
        r.id,
        {
          conditions: conditions.filter((c) => c.field).map((c) => ({ field: c.field, operator: c.operator, value: c.value })),
          actions: actions.map((a) => ({ type: a.type, config: parsePairs(a.config) })),
        },
        r.version,
      ),
    onSuccess: () => toast.success("Rule saved"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setCondition = (i: number, patch: Partial<ConditionRow>) => setConditions((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const setAction = (i: number, patch: Partial<ActionRow>) => setActions((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-4">
      <section className="card p-4 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Conditions</h2>
          {canEdit && <button className="btn-ghost" onClick={() => setConditions((prev) => [...prev, blankCondition()])}><Plus size={14} /> Add condition</button>}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">All conditions must match. Fields are dot paths into the event, e.g. <code>payload.available</code>, <code>entityId</code>, <code>occurredAt</code>. Empty means always match.</p>
        <table className="table-base">
          <thead><tr><th>Field</th><th>Operator</th><th>Value</th><th /></tr></thead>
          <tbody>
            {conditions.map((row, i) => (
              <tr key={i}>
                <td><input className="input-base" disabled={!canEdit} value={row.field} onChange={(e) => setCondition(i, { field: e.target.value })} /></td>
                <td>
                  <select className="input-base" disabled={!canEdit} value={row.operator} onChange={(e) => setCondition(i, { operator: e.target.value as ConditionRow["operator"] })}>
                    {AUTOMATION_CONDITION_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td><input className="input-base" disabled={!canEdit} value={row.value} onChange={(e) => setCondition(i, { value: e.target.value })} /></td>
                <td>{canEdit && <button className="btn-ghost" aria-label="Remove condition" onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-4 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Actions</h2>
          {canEdit && <button className="btn-ghost" onClick={() => setActions((prev) => [...prev, blankAction()])}><Plus size={14} /> Add action</button>}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          Config is <code>key:value,key2:value2</code>. Values may use <code>{"{{payload.field}}"}</code>, <code>{"{{entityId}}"}</code>, <code>{"{{qty:payload.field}}"}</code> (a scaled quantity), or the literal <code>actor</code> for a user id field. Notify needs <code>userIds</code>, <code>title</code>; create task needs <code>title</code>, optional <code>assigneeId</code>, <code>dueInDays</code>; create requisition needs <code>productId</code>, <code>qty</code>.
        </p>
        <table className="table-base">
          <thead><tr><th>Type</th><th>Config</th><th /></tr></thead>
          <tbody>
            {actions.map((row, i) => (
              <tr key={i}>
                <td>
                  <select className="input-base" disabled={!canEdit} value={row.type} onChange={(e) => setAction(i, { type: e.target.value as ActionRow["type"] })}>
                    {AUTOMATION_ACTION_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
                  </select>
                </td>
                <td><input className="input-base" disabled={!canEdit} value={row.config} onChange={(e) => setAction(i, { config: e.target.value })} /></td>
                <td>{canEdit && <button className="btn-ghost" aria-label="Remove action" onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && <div className="mt-3"><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save conditions and actions</button></div>}
      </section>

      <section className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Recent runs</h2>
        {r.recentRuns.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Not fired yet.</p>}
        {r.recentRuns.length > 0 && (
          <table className="table-base">
            <thead><tr><th>When</th><th>Matched</th><th>Actions</th></tr></thead>
            <tbody>
              {r.recentRuns.map((run, i) => (
                <tr key={i}>
                  <td>{formatDateTime(run.at)}</td>
                  <td><StatusBadge status={run.matched ? "matched" : "no_match"} /></td>
                  <td>{run.actions.length === 0 ? "—" : run.actions.map((a) => `${humanize(a.type)}: ${a.ok ? "ok" : `failed (${a.error})`}`).join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function TestRunDialog({ r, refresh }: { r: AutomationRule; refresh: (rule: AutomationRule) => void }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState("");
  const run = useMutation({
    mutationFn: () => automationApi.post<AutomationRule>(`/automation/rules/${r.id}/test-run`, { payload: parsePairs(payload) }),
    onSuccess: (rule) => { setOpen(false); toast.success(rule.recentRuns[0]?.matched ? "Matched — actions ran" : "Did not match"); refresh(rule); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>Test run</button>
      <ConfirmDialog open={open} title="Test this rule" confirmLabel="Run" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <Field label="Sample payload (key:value,key2:value2)">
          <input className="input-base" value={payload} onChange={(e) => setPayload(e.target.value)} placeholder="productId:p1,available:3" />
        </Field>
      </ConfirmDialog>
    </>
  );
}

export const rules: MasterConfig<AutomationRule> = {
  entityType: "automation.rule",
  permission: "automation.rule",
  plural: "Automation rules",
  singular: "Automation rule",
  description: "Trigger → conditions → actions over the platform's existing events — a no-code builder.",
  route: "/automation/rules",
  client: automationApi.rules,
  defaultSort: "-createdAt",
  columns: [
    { key: "name", label: "Name" },
    { key: "eventType", label: "Trigger" },
    { key: "active", label: "Status", render: (r) => <StatusBadge status={r.active ? "active" : "inactive"} /> },
  ],
  filters: [
    { key: "eventType", label: "Trigger", options: opts(AUTOMATION_EVENT_TYPES) },
    { key: "active", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] },
  ],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", wide: true },
    { key: "eventType", label: "Trigger event", type: "select", options: opts(AUTOMATION_EVENT_TYPES), required: true },
    { key: "active", label: "Active", type: "boolean" },
  ],
  title: (r) => r.name,
  subtitle: (r) => r.eventType,
  status: (r) => (r.active ? "active" : "inactive"),
  actions: (r, refresh) => <TestRunDialog r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Trigger event", value: r.eventType },
    { label: "Conditions", value: String(r.conditions.length) },
    { label: "Actions", value: String(r.actions.length) },
    { label: "Description", value: r.description },
  ],
  extra: (r) => <RuleEditor r={r} />,
};

export const AUTOMATION_SCREENS: Record<string, MasterConfig<never>> = {
  rules: rules as unknown as MasterConfig<never>,
};
