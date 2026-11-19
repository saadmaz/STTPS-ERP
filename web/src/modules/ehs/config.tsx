"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";

export const INCIDENT_TYPES = ["injury", "near_miss", "property_damage", "environmental", "other"] as const;
export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const INCIDENT_STATUSES = ["reported", "investigating", "closed"] as const;
export const PERMIT_TYPES = ["hot_work", "confined_space", "working_at_height", "electrical", "excavation", "other"] as const;
export const PERMIT_STATUSES = ["pending", "approved", "rejected", "closed"] as const;

export interface Incident extends BaseRecord {
  number: string; title: string; incidentType: (typeof INCIDENT_TYPES)[number]; severity: (typeof INCIDENT_SEVERITIES)[number];
  status: (typeof INCIDENT_STATUSES)[number]; reportedBy: string; occurredAt: string; location: string | null; description: string;
  injuries: string | null; witnesses: string | null; rootCause: string | null; preventiveActions: string | null; closedAt: string | null;
}
export interface RiskHazard {
  hazardId: string; hazard: string; category: string; likelihood: number; severity: number; riskScore: number;
  controls: string | null; residualLikelihood: number | null; residualSeverity: number | null; residualScore: number | null;
}
export interface RiskAssessment extends BaseRecord {
  number: string; title: string; assessedBy: string; assessedAt: string; reviewDue: string; status: "draft" | "active"; hazards: RiskHazard[];
}
export interface PermitToWork extends BaseRecord {
  number: string; permitType: (typeof PERMIT_TYPES)[number]; title: string; location: string | null; requestedBy: string;
  validFrom: string; validTo: string; conditions: string | null; status: (typeof PERMIT_STATUSES)[number]; approvedBy: string | null; closedAt: string | null;
}

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const ehsApi = {
  incidents: crud<Incident>("/ehs/incidents"),
  riskAssessments: crud<RiskAssessment>("/ehs/risk-assessments"),
  permits: crud<PermitToWork>("/ehs/permits"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

function InvestigateDialog({ r, refresh }: { r: Incident; refresh: (i: Incident) => void }) {
  const [open, setOpen] = useState(false);
  const [rootCause, setRootCause] = useState(r.rootCause ?? "");
  const [preventiveActions, setPreventiveActions] = useState(r.preventiveActions ?? "");
  const run = useMutation({
    mutationFn: () => ehsApi.post<Incident>(`/ehs/incidents/${r.id}/investigate`, { rootCause: rootCause || undefined, preventiveActions: preventiveActions || undefined }),
    onSuccess: (i) => { setOpen(false); toast.success("Investigation recorded"); refresh(i); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>Investigate</button>
      <ConfirmDialog open={open} title="Record the investigation" confirmLabel="Save" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Root cause"><textarea className="input-base" rows={3} value={rootCause} onChange={(e) => setRootCause(e.target.value)} /></Field>
          <Field label="Preventive actions"><textarea className="input-base" rows={3} value={preventiveActions} onChange={(e) => setPreventiveActions(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function IncidentActions({ r, refresh }: { r: Incident; refresh: (i: Incident) => void }) {
  const canEdit = useCan("ehs.incident.edit");
  const close = useMutation({
    mutationFn: () => ehsApi.post<Incident>(`/ehs/incidents/${r.id}/close`),
    onSuccess: (i) => { toast.success("Closed"); refresh(i); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit || r.status === "closed") return null;
  return (
    <>
      <InvestigateDialog r={r} refresh={refresh} />
      <button className="btn-primary" disabled={close.isPending} onClick={() => close.mutate()}>Close</button>
    </>
  );
}

export const incidents: MasterConfig<Incident> = {
  entityType: "ehs.incident",
  permission: "ehs.incident",
  plural: "Incidents",
  singular: "Incident",
  description: "Report → investigate → close, with a root cause and preventive actions.",
  route: "/ehs/incidents",
  client: ehsApi.incidents,
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "title", label: "Title" },
    { key: "severity", label: "Severity", render: (r) => humanize(r.severity) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(INCIDENT_STATUSES) },
    { key: "incidentType", label: "Type", options: opts(INCIDENT_TYPES) },
    { key: "severity", label: "Severity", options: opts(INCIDENT_SEVERITIES) },
  ],
  fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "incidentType", label: "Type", type: "select", options: opts(INCIDENT_TYPES) },
    { key: "severity", label: "Severity", type: "select", options: opts(INCIDENT_SEVERITIES) },
    { key: "occurredAt", label: "Occurred", type: "date", required: true },
    { key: "location", label: "Location", type: "text" },
    { key: "description", label: "Description", type: "textarea", wide: true, required: true },
    { key: "injuries", label: "Injuries", type: "textarea", wide: true },
    { key: "witnesses", label: "Witnesses", type: "textarea", wide: true },
  ],
  editable: (r) => r.status !== "closed",
  title: (r) => r.title,
  subtitle: (r) => r.number,
  status: (r) => r.status,
  actions: (r, refresh) => <IncidentActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Reported by", value: r.reportedBy },
    { label: "Occurred", value: formatDate(r.occurredAt) },
    { label: "Location", value: r.location },
    { label: "Root cause", value: r.rootCause },
    { label: "Preventive actions", value: r.preventiveActions },
  ],
};

interface HazardRow { hazard: string; category: string; likelihood: string; severity: string; controls: string; residualLikelihood: string; residualSeverity: string }
const blankHazard = (): HazardRow => ({ hazard: "", category: "general", likelihood: "3", severity: "3", controls: "", residualLikelihood: "", residualSeverity: "" });

function HazardsEditor({ r }: { r: RiskAssessment }) {
  const canEdit = useCan("ehs.riskAssessment.edit");
  const [rows, setRows] = useState<HazardRow[]>(
    r.hazards.length
      ? r.hazards.map((h) => ({
          hazard: h.hazard, category: h.category, likelihood: String(h.likelihood), severity: String(h.severity), controls: h.controls ?? "",
          residualLikelihood: h.residualLikelihood != null ? String(h.residualLikelihood) : "", residualSeverity: h.residualSeverity != null ? String(h.residualSeverity) : "",
        }))
      : [blankHazard()],
  );
  const save = useMutation({
    mutationFn: () =>
      ehsApi.riskAssessments.update(
        r.id,
        {
          hazards: rows
            .filter((row) => row.hazard)
            .map((row) => ({
              hazard: row.hazard, category: row.category || undefined, likelihood: Number(row.likelihood) || 1, severity: Number(row.severity) || 1,
              controls: row.controls || undefined, residualLikelihood: row.residualLikelihood ? Number(row.residualLikelihood) : undefined,
              residualSeverity: row.residualSeverity ? Number(row.residualSeverity) : undefined,
            })),
        },
        r.version,
      ),
    onSuccess: () => toast.success("Hazards saved"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setRow = (i: number, patch: Partial<HazardRow>) => setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  return (
    <section className="card p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Hazards</h2>
        {canEdit && (
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setRows((prev) => [...prev, blankHazard()])}><Plus size={14} /> Add hazard</button>
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save hazards</button>
          </div>
        )}
      </div>
      <table className="table-base">
        <thead><tr><th>Hazard</th><th>Category</th><th>Likelihood</th><th>Severity</th><th>Controls</th><th>Resid. L</th><th>Resid. S</th><th /></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td><input className="input-base" disabled={!canEdit} value={row.hazard} onChange={(e) => setRow(i, { hazard: e.target.value })} /></td>
              <td><input className="input-base w-28" disabled={!canEdit} value={row.category} onChange={(e) => setRow(i, { category: e.target.value })} /></td>
              <td><input className="input-base w-16" disabled={!canEdit} value={row.likelihood} onChange={(e) => setRow(i, { likelihood: e.target.value })} /></td>
              <td><input className="input-base w-16" disabled={!canEdit} value={row.severity} onChange={(e) => setRow(i, { severity: e.target.value })} /></td>
              <td><input className="input-base" disabled={!canEdit} value={row.controls} onChange={(e) => setRow(i, { controls: e.target.value })} /></td>
              <td><input className="input-base w-16" disabled={!canEdit} value={row.residualLikelihood} onChange={(e) => setRow(i, { residualLikelihood: e.target.value })} /></td>
              <td><input className="input-base w-16" disabled={!canEdit} value={row.residualSeverity} onChange={(e) => setRow(i, { residualSeverity: e.target.value })} /></td>
              <td>{canEdit && <button className="btn-ghost" aria-label="Remove hazard" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mt-2">Likelihood and severity are rated 1–5; risk score is their product, computed on save.</p>
    </section>
  );
}

function RiskActions({ r, refresh }: { r: RiskAssessment; refresh: (ra: RiskAssessment) => void }) {
  const canEdit = useCan("ehs.riskAssessment.edit");
  const activate = useMutation({
    mutationFn: () => ehsApi.post<RiskAssessment>(`/ehs/risk-assessments/${r.id}/activate`),
    onSuccess: (ra) => { toast.success("Activated"); refresh(ra); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit || r.status !== "draft") return null;
  return <button className="btn-primary" disabled={activate.isPending} onClick={() => activate.mutate()}>Activate</button>;
}

export const riskAssessments: MasterConfig<RiskAssessment> = {
  entityType: "ehs.riskAssessment",
  permission: "ehs.riskAssessment",
  plural: "Risk assessments",
  singular: "Risk assessment",
  description: "Identified hazards with likelihood, severity, controls and residual risk, reviewed periodically.",
  route: "/ehs/risk-assessments",
  client: ehsApi.riskAssessments,
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "reviewDue", label: "Review due", render: (r) => formatDate(r.reviewDue) },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "active"]) }],
  fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "reviewDue", label: "Review due", type: "date", required: true },
  ],
  title: (r) => r.title,
  subtitle: (r) => r.number,
  status: (r) => r.status,
  actions: (r, refresh) => <RiskActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Assessed by", value: r.assessedBy },
    { label: "Assessed on", value: formatDate(r.assessedAt) },
    { label: "Review due", value: formatDate(r.reviewDue) },
    { label: "Hazards", value: String(r.hazards.length) },
  ],
  extra: (r) => <HazardsEditor r={r} />,
};

function PermitActions({ r, refresh }: { r: PermitToWork; refresh: (p: PermitToWork) => void }) {
  const canEdit = useCan("ehs.permit.edit");
  const approve = useMutation({
    mutationFn: () => ehsApi.post<PermitToWork>(`/ehs/permits/${r.id}/approve`),
    onSuccess: (p) => { toast.success("Approved"); refresh(p); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: () => ehsApi.post<PermitToWork>(`/ehs/permits/${r.id}/reject`),
    onSuccess: (p) => { toast.success("Rejected"); refresh(p); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const close = useMutation({
    mutationFn: () => ehsApi.post<PermitToWork>(`/ehs/permits/${r.id}/close`),
    onSuccess: (p) => { toast.success("Closed"); refresh(p); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit) return null;
  return (
    <>
      {r.status === "pending" && (
        <>
          <button className="btn-primary" disabled={approve.isPending} onClick={() => approve.mutate()}>Approve</button>
          <button className="btn-ghost" disabled={reject.isPending} onClick={() => reject.mutate()}>Reject</button>
        </>
      )}
      {r.status === "approved" && <button className="btn-primary" disabled={close.isPending} onClick={() => close.mutate()}>Close</button>}
    </>
  );
}

export const permits: MasterConfig<PermitToWork> = {
  entityType: "ehs.permit",
  permission: "ehs.permit",
  plural: "Permits to work",
  singular: "Permit to work",
  description: "A time-boxed authorisation for hazardous work, approved before it starts.",
  route: "/ehs/permits",
  client: ehsApi.permits,
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "title", label: "Title" },
    { key: "permitType", label: "Type", render: (r) => humanize(r.permitType) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(PERMIT_STATUSES) },
    { key: "permitType", label: "Type", options: opts(PERMIT_TYPES) },
  ],
  fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "permitType", label: "Type", type: "select", options: opts(PERMIT_TYPES) },
    { key: "location", label: "Location", type: "text" },
    { key: "validFrom", label: "Valid from", type: "date", required: true },
    { key: "validTo", label: "Valid to", type: "date", required: true },
    { key: "conditions", label: "Conditions", type: "textarea", wide: true },
  ],
  editable: (r) => r.status === "pending",
  title: (r) => r.title,
  subtitle: (r) => r.number,
  status: (r) => r.status,
  actions: (r, refresh) => <PermitActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Requested by", value: r.requestedBy },
    { label: "Valid from", value: formatDate(r.validFrom) },
    { label: "Valid to", value: formatDate(r.validTo) },
    { label: "Approved by", value: r.approvedBy },
    { label: "Conditions", value: r.conditions },
  ],
};

export const EHS_SCREENS: Record<string, MasterConfig<never>> = {
  incidents: incidents as unknown as MasterConfig<never>,
  "risk-assessments": riskAssessments as unknown as MasterConfig<never>,
  permits: permits as unknown as MasterConfig<never>,
};
