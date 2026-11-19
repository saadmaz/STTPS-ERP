"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { productsApi } from "@/modules/products/config";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";

export const INSPECTION_STAGES = ["incoming", "in_process", "finished"] as const;
export const INSPECTION_ITEM_TYPES = ["pass_fail", "numeric", "text"] as const;
export const INSPECTION_STATUSES = ["planned", "in_progress", "completed", "cancelled"] as const;
export const NCR_SEVERITIES = ["minor", "major", "critical"] as const;

export interface InspectionPlanItem {
  itemId: string; seq: number; question: string; type: (typeof INSPECTION_ITEM_TYPES)[number]; minValue: number | null; maxValue: number | null; isRequired: boolean;
}
export interface InspectionPlan extends BaseRecord {
  code: string; name: string; stage: (typeof INSPECTION_STAGES)[number]; productId: string | null; sampleSize: number | null; items: InspectionPlanItem[]; isActive: boolean;
}
export interface InspectionResponse { itemId: string; result: "pass" | "fail" | "na"; numericValue: number | null; textValue: string | null; notes: string | null }
export interface Inspection extends BaseRecord {
  number: string; planId: string; stage: (typeof INSPECTION_STAGES)[number]; productId: string | null; status: (typeof INSPECTION_STATUSES)[number];
  scheduledAt: string | null; conductedAt: string | null; conductedBy: string | null; qtyInspected: number | null; qtySampled: number | null; qtyRejected: number | null;
  responses: InspectionResponse[]; overallResult: "pass" | "fail" | "conditional" | null; findings: string | null; notes: string | null;
}
export interface NcrAction {
  actionId: string; type: "corrective" | "preventive"; description: string; assignedTo: string; dueDate: string | null; status: "open" | "done"; completedAt: string | null;
}
export interface NonConformance extends BaseRecord {
  number: string; title: string; description: string; severity: (typeof NCR_SEVERITIES)[number]; status: "open" | "in_progress" | "closed";
  inspectionId: string | null; productId: string | null; raisedBy: string; dueDate: string | null; actions: NcrAction[]; resolution: string | null; closedAt: string | null;
}

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const qualityApi = {
  inspectionPlans: crud<InspectionPlan>("/quality/inspection-plans"),
  inspections: crud<Inspection>("/quality/inspections"),
  nonConformances: crud<NonConformance>("/quality/non-conformances"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

const productOptions = {
  queryKey: ["options", "products.items"],
  load: async () => (await productsApi.items.list({ limit: 200 })).items.map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` })),
};
const planOptions = {
  queryKey: ["options", "quality.inspectionPlans"],
  load: async () => (await qualityApi.inspectionPlans.list({ limit: 200 })).items.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
};

interface PlanItemRow { seq: string; question: string; type: (typeof INSPECTION_ITEM_TYPES)[number]; minValue: string; maxValue: string; isRequired: boolean }
const blankPlanItem = (nextSeq: number): PlanItemRow => ({ seq: String(nextSeq), question: "", type: "pass_fail", minValue: "", maxValue: "", isRequired: true });

function InspectionPlanItemsEditor({ r }: { r: InspectionPlan }) {
  const canEdit = useCan("quality.inspectionPlan.edit");
  const [rows, setRows] = useState<PlanItemRow[]>(
    r.items.length
      ? r.items.map((i) => ({ seq: String(i.seq), question: i.question, type: i.type, minValue: i.minValue != null ? String(i.minValue) : "", maxValue: i.maxValue != null ? String(i.maxValue) : "", isRequired: i.isRequired }))
      : [blankPlanItem(1)],
  );
  const save = useMutation({
    mutationFn: () =>
      qualityApi.inspectionPlans.update(
        r.id,
        {
          items: rows
            .filter((row) => row.question)
            .map((row) => ({
              seq: Number(row.seq) || 1, question: row.question, type: row.type,
              minValue: row.minValue ? Number(row.minValue) : undefined, maxValue: row.maxValue ? Number(row.maxValue) : undefined, isRequired: row.isRequired,
            })),
        },
        r.version,
      ),
    onSuccess: () => toast.success("Items saved"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setRow = (i: number, patch: Partial<PlanItemRow>) => setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  return (
    <section className="card p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Checklist items</h2>
        {canEdit && (
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setRows((prev) => [...prev, blankPlanItem(prev.length + 1)])}><Plus size={14} /> Add item</button>
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save items</button>
          </div>
        )}
      </div>
      <table className="table-base">
        <thead><tr><th>Seq</th><th>Question</th><th>Type</th><th>Min</th><th>Max</th><th>Required</th><th /></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td><input className="input-base w-14" disabled={!canEdit} value={row.seq} onChange={(e) => setRow(i, { seq: e.target.value })} /></td>
              <td><input className="input-base" disabled={!canEdit} value={row.question} onChange={(e) => setRow(i, { question: e.target.value })} /></td>
              <td>
                <select className="input-base" disabled={!canEdit} value={row.type} onChange={(e) => setRow(i, { type: e.target.value as PlanItemRow["type"] })}>
                  <option value="pass_fail">Pass/fail</option>
                  <option value="numeric">Numeric</option>
                  <option value="text">Text</option>
                </select>
              </td>
              <td><input className="input-base w-20" disabled={!canEdit} value={row.minValue} onChange={(e) => setRow(i, { minValue: e.target.value })} /></td>
              <td><input className="input-base w-20" disabled={!canEdit} value={row.maxValue} onChange={(e) => setRow(i, { maxValue: e.target.value })} /></td>
              <td><input type="checkbox" disabled={!canEdit} checked={row.isRequired} onChange={(e) => setRow(i, { isRequired: e.target.checked })} /></td>
              <td>{canEdit && <button className="btn-ghost" aria-label="Remove item" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export const inspectionPlans: MasterConfig<InspectionPlan> = {
  entityType: "quality.inspectionPlan",
  permission: "quality.inspectionPlan",
  plural: "Inspection plans",
  singular: "Inspection plan",
  description: "What to check for a stage of inspection, optionally scoped to one product.",
  route: "/quality/inspection-plans",
  client: qualityApi.inspectionPlans,
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "stage", label: "Stage", render: (r) => humanize(r.stage) },
    { key: "isActive", label: "Active", render: (r) => (r.isActive ? "Yes" : "—") },
  ],
  filters: [
    { key: "stage", label: "Stage", options: opts(INSPECTION_STAGES) },
    { key: "isActive", label: "Active", options: [{ value: "true", label: "Active only" }] },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true, createOnly: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "stage", label: "Stage", type: "select", options: opts(INSPECTION_STAGES), required: true, createOnly: true },
    { key: "productId", label: "Product (optional)", type: "reference", reference: productOptions, createOnly: true },
    { key: "sampleSize", label: "Sample size", type: "number" },
    { key: "isActive", label: "Active", type: "boolean" },
  ],
  title: (r) => r.name,
  subtitle: (r) => r.code,
  details: (r) => [
    { label: "Sample size", value: r.sampleSize != null ? String(r.sampleSize) : null },
    { label: "Items", value: String(r.items.length) },
  ],
  extra: (r) => <InspectionPlanItemsEditor r={r} />,
};

function CompleteInspectionDialog({ r, refresh }: { r: Inspection; refresh: (i: Inspection) => void }) {
  const { data: plan } = useQuery({ queryKey: ["quality.inspectionPlan", r.planId], queryFn: () => qualityApi.inspectionPlans.get(r.planId) });
  const [open, setOpen] = useState(false);
  const [responses, setResponses] = useState<Record<string, { result: "pass" | "fail" | "na"; value: string }>>({});
  const [findings, setFindings] = useState("");
  const [qtyRejected, setQtyRejected] = useState("");
  const complete = useMutation({
    mutationFn: () =>
      qualityApi.post<Inspection>(`/quality/inspections/${r.id}/complete`, {
        responses: Object.entries(responses).map(([itemId, v]) => {
          const item = plan?.items.find((i) => i.itemId === itemId);
          return {
            itemId, result: v.result,
            numericValue: item?.type === "numeric" && v.value ? Number(v.value) : undefined,
            textValue: item?.type === "text" && v.value ? v.value : undefined,
          };
        }),
        findings: findings || undefined, qtyRejected: qtyRejected ? Number(qtyRejected) : undefined,
      }),
    onSuccess: (i) => { setOpen(false); toast.success("Inspection completed"); refresh(i); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Complete</button>
      <ConfirmDialog open={open} title="Complete inspection" confirmLabel="Complete" busy={complete.isPending} onConfirm={() => complete.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-4 max-h-[55vh] overflow-y-auto">
          {(plan?.items ?? []).map((item) => (
            <div key={item.itemId} className="border-b border-slate-200 dark:border-slate-700 pb-3">
              <p className="text-sm font-medium mb-1">{item.question}{item.isRequired && " *"}</p>
              <div className="flex gap-2">
                <select
                  className="input-base w-28"
                  value={responses[item.itemId]?.result ?? ""}
                  onChange={(e) => setResponses((prev) => ({ ...prev, [item.itemId]: { result: e.target.value as "pass" | "fail" | "na", value: prev[item.itemId]?.value ?? "" } }))}
                >
                  <option value="">—</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="na">N/A</option>
                </select>
                {item.type !== "pass_fail" && (
                  <input
                    className="input-base"
                    placeholder={item.type === "numeric" ? "Value" : "Note"}
                    value={responses[item.itemId]?.value ?? ""}
                    onChange={(e) => setResponses((prev) => ({ ...prev, [item.itemId]: { result: prev[item.itemId]?.result ?? "na", value: e.target.value } }))}
                  />
                )}
              </div>
            </div>
          ))}
          <Field label="Quantity rejected"><input className="input-base" value={qtyRejected} onChange={(e) => setQtyRejected(e.target.value)} /></Field>
          <Field label="Findings"><textarea className="input-base" rows={3} value={findings} onChange={(e) => setFindings(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function InspectionActions({ r, refresh }: { r: Inspection; refresh: (i: Inspection) => void }) {
  const canEdit = useCan("quality.inspection.edit");
  const cancel = useMutation({
    mutationFn: () => qualityApi.post<Inspection>(`/quality/inspections/${r.id}/cancel`),
    onSuccess: (i) => { toast.success("Cancelled"); refresh(i); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit || !["planned", "in_progress"].includes(r.status)) return null;
  return (
    <>
      <CompleteInspectionDialog r={r} refresh={refresh} />
      <button className="btn-ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel</button>
    </>
  );
}

function InspectionExtra({ r }: { r: Inspection }) {
  const { data: plan } = useQuery({ queryKey: ["quality.inspectionPlan", r.planId], queryFn: () => qualityApi.inspectionPlans.get(r.planId) });
  const question = (itemId: string) => plan?.items.find((i) => i.itemId === itemId)?.question ?? itemId;
  return (
    <div className="space-y-6">
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Responses</h2>
        <table className="table-base">
          <thead><tr><th>Item</th><th>Result</th><th>Value</th></tr></thead>
          <tbody>
            {r.responses.map((resp, i) => (
              <tr key={i}>
                <td>{question(resp.itemId)}</td>
                <td><StatusBadge status={resp.result} /></td>
                <td>{resp.numericValue ?? resp.textValue ?? "—"}</td>
              </tr>
            ))}
            {r.responses.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500 py-6">Not inspected yet.</td></tr>}
          </tbody>
        </table>
      </section>
      {r.findings && (
        <section className="card p-4">
          <h2 className="font-semibold mb-2">Findings</h2>
          <p className="text-sm whitespace-pre-line">{r.findings}</p>
        </section>
      )}
    </div>
  );
}

export const inspections: MasterConfig<Inspection> = {
  entityType: "quality.inspection",
  permission: "quality.inspection",
  plural: "Inspections",
  singular: "Inspection",
  description: "An incoming, in-process or finished inspection against a plan's checklist.",
  route: "/quality/inspections",
  client: qualityApi.inspections,
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "stage", label: "Stage", render: (r) => humanize(r.stage) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "overallResult", label: "Result", render: (r) => (r.overallResult ? <StatusBadge status={r.overallResult} /> : "—") },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(INSPECTION_STATUSES) },
    { key: "stage", label: "Stage", options: opts(INSPECTION_STAGES) },
  ],
  fields: [
    { key: "planId", label: "Inspection plan", type: "reference", reference: planOptions, required: true, createOnly: true },
    { key: "productId", label: "Product (optional, overrides the plan's)", type: "reference", reference: productOptions, createOnly: true },
    { key: "scheduledAt", label: "Scheduled", type: "date", createOnly: true },
    { key: "qtyInspected", label: "Quantity inspected", type: "number", createOnly: true },
    { key: "qtySampled", label: "Quantity sampled", type: "number", createOnly: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true, createOnly: true },
  ],
  editable: () => false,
  title: (r) => r.number,
  subtitle: (r) => humanize(r.stage),
  status: (r) => r.status,
  actions: (r, refresh) => <InspectionActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Scheduled", value: r.scheduledAt ? formatDate(r.scheduledAt) : null },
    { label: "Conducted", value: r.conductedAt ? formatDateTime(r.conductedAt) : null },
    { label: "Quantity inspected", value: r.qtyInspected != null ? String(r.qtyInspected) : null },
    { label: "Quantity sampled", value: r.qtySampled != null ? String(r.qtySampled) : null },
    { label: "Quantity rejected", value: r.qtyRejected != null ? String(r.qtyRejected) : null },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <InspectionExtra r={r} />,
};

function NcrExtra({ r }: { r: NonConformance }) {
  const canEdit = useCan("quality.nonConformance.edit");
  const [current, setCurrent] = useState(r);
  const [actionOpen, setActionOpen] = useState(false);
  const [type, setType] = useState<"corrective" | "preventive">("corrective");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const addAction = useMutation({
    mutationFn: () => qualityApi.post<NonConformance>(`/quality/non-conformances/${current.id}/actions`, { type, description, assignedTo, dueDate: dueDate || undefined }),
    onSuccess: (n) => { setActionOpen(false); setDescription(""); setAssignedTo(""); setDueDate(""); toast.success("Action added"); setCurrent(n); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const completeAction = useMutation({
    mutationFn: (actionId: string) => qualityApi.post<NonConformance>(`/quality/non-conformances/${current.id}/actions/${actionId}/complete`),
    onSuccess: (n) => { toast.success("Action completed"); setCurrent(n); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [closeOpen, setCloseOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const close = useMutation({
    mutationFn: () => qualityApi.post<NonConformance>(`/quality/non-conformances/${current.id}/close`, { resolution: resolution || undefined }),
    onSuccess: (n) => { setCloseOpen(false); toast.success("Closed"); setCurrent(n); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-6">
      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-semibold">Actions</h2>
          {canEdit && current.status !== "closed" && (
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setActionOpen(true)}>Add action</button>
              <button className="btn-primary" onClick={() => setCloseOpen(true)}>Close</button>
            </div>
          )}
        </div>
        <table className="table-base">
          <thead><tr><th>Type</th><th>Description</th><th>Assigned to</th><th>Due</th><th>Status</th><th /></tr></thead>
          <tbody>
            {current.actions.map((a) => (
              <tr key={a.actionId}>
                <td>{humanize(a.type)}</td>
                <td>{a.description}</td>
                <td>{a.assignedTo}</td>
                <td>{a.dueDate ? formatDate(a.dueDate) : "—"}</td>
                <td><StatusBadge status={a.status} /></td>
                <td>{canEdit && a.status === "open" && <button className="btn-ghost" disabled={completeAction.isPending} onClick={() => completeAction.mutate(a.actionId)}>Mark done</button>}</td>
              </tr>
            ))}
            {current.actions.length === 0 && <tr><td colSpan={6} className="text-center text-slate-500 py-6">No actions yet.</td></tr>}
          </tbody>
        </table>
      </section>
      {current.resolution && (
        <section className="card p-4">
          <h2 className="font-semibold mb-2">Resolution</h2>
          <p className="text-sm whitespace-pre-line">{current.resolution}</p>
        </section>
      )}
      <ConfirmDialog open={actionOpen} title="Add a corrective or preventive action" confirmLabel="Add" busy={addAction.isPending} onConfirm={() => addAction.mutate()} onClose={() => setActionOpen(false)}>
        <div className="space-y-3">
          <Field label="Type">
            <select className="input-base" value={type} onChange={(e) => setType(e.target.value as "corrective" | "preventive")}>
              <option value="corrective">Corrective</option>
              <option value="preventive">Preventive</option>
            </select>
          </Field>
          <Field label="Description" required><textarea className="input-base" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Assigned to (user id)" required><input className="input-base" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} /></Field>
          <Field label="Due date"><input type="date" className="input-base" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
      <ConfirmDialog open={closeOpen} title="Close this non-conformance" confirmLabel="Close" busy={close.isPending} onConfirm={() => close.mutate()} onClose={() => setCloseOpen(false)}>
        <Field label="Resolution"><textarea className="input-base" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
      </ConfirmDialog>
    </div>
  );
}

export const nonConformances: MasterConfig<NonConformance> = {
  entityType: "quality.nonConformance",
  permission: "quality.nonConformance",
  plural: "Non-conformances",
  singular: "Non-conformance",
  description: "A defect or non-conformance, with corrective and preventive actions through to closure.",
  route: "/quality/non-conformances",
  client: qualityApi.nonConformances,
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "title", label: "Title" },
    { key: "severity", label: "Severity", render: (r) => humanize(r.severity) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(["open", "in_progress", "closed"]) },
    { key: "severity", label: "Severity", options: opts(NCR_SEVERITIES) },
  ],
  fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", wide: true, required: true },
    { key: "severity", label: "Severity", type: "select", options: opts(NCR_SEVERITIES) },
    { key: "productId", label: "Product (optional)", type: "reference", reference: productOptions },
    { key: "dueDate", label: "Due date", type: "date" },
  ],
  editable: (r) => r.status !== "closed",
  title: (r) => r.title,
  subtitle: (r) => r.number,
  status: (r) => r.status,
  details: (r) => [
    { label: "Severity", value: humanize(r.severity) },
    { label: "Raised by", value: r.raisedBy },
    { label: "Due date", value: r.dueDate ? formatDate(r.dueDate) : null },
    { label: "Closed", value: r.closedAt ? formatDateTime(r.closedAt) : null },
  ],
  extra: (r) => <NcrExtra r={r} />,
};

export const QUALITY_SCREENS: Record<string, MasterConfig<never>> = {
  "inspection-plans": inspectionPlans as unknown as MasterConfig<never>,
  inspections: inspections as unknown as MasterConfig<never>,
  "non-conformances": nonConformances as unknown as MasterConfig<never>,
};
