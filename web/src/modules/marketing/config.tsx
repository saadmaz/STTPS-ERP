"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { StatusBadge } from "@/components/ui/kit";

export const CAMPAIGN_TYPES = ["email", "social", "paid_ads", "sms", "whatsapp", "event", "referral", "influencer", "content", "other"] as const;
export const CAMPAIGN_STATUSES = ["draft", "active", "completed", "cancelled"] as const;
export const SEGMENT_ENTITY_TYPES = ["crm.account", "crm.lead", "crm.contact"] as const;
export const SEQUENCE_TRIGGERS = ["welcome", "abandoned_enquiry", "lead_nurture", "follow_up", "anniversary", "renewal", "re_engagement", "upsell_cross_sell", "feedback"] as const;
export const ENROLLMENT_STATUSES = ["active", "completed", "cancelled"] as const;

export interface Campaign extends BaseRecord {
  code: string; name: string; type: (typeof CAMPAIGN_TYPES)[number]; ownerUserId: string | null; budget: number;
  startDate: string; endDate: string | null; goals: string | null; channels: string[]; status: (typeof CAMPAIGN_STATUSES)[number]; notes: string | null;
}
export interface Segment extends BaseRecord {
  name: string; description: string | null; entityType: (typeof SEGMENT_ENTITY_TYPES)[number]; filter: string | null;
}
export interface SequenceStep { stepId: string; seq: number; delayDays: number; subject: string; body: string }
export interface Sequence extends BaseRecord {
  name: string; trigger: (typeof SEQUENCE_TRIGGERS)[number]; steps: SequenceStep[]; isActive: boolean;
}
export interface Enrollment extends BaseRecord {
  sequenceId: string; leadId: string | null; accountId: string | null; currentStep: number; enrolledAt: string; nextStepDueAt: string | null; status: (typeof ENROLLMENT_STATUSES)[number];
}
export interface CampaignReport {
  campaignId: string; leadsCount: number; conversions: number; revenue: number; budget: number;
  costPerLead: number | null; costPerAcquisition: number | null; conversionRate: number; roi: number | null;
}

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const marketingApi = {
  campaigns: crud<Campaign>("/marketing/campaigns"),
  segments: crud<Segment>("/marketing/segments"),
  sequences: crud<Sequence>("/marketing/sequences"),
  enrollments: crud<Enrollment>("/marketing/enrollments"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
  get: <T,>(path: string) => api.get(path).then((r) => r.data as T),
};

export const sequenceOptions = {
  queryKey: ["options", "marketing.sequences"],
  load: async () => (await marketingApi.sequences.list({ limit: 200 })).items.map((s) => ({ value: s.id, label: s.name })),
};

function CampaignReportPanel({ r }: { r: Campaign }) {
  const { data: report } = useQuery({ queryKey: ["marketing.campaignReport", r.id], queryFn: () => marketingApi.get<CampaignReport>(`/marketing/campaigns/${r.id}/report`) });
  if (!report) return null;
  const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;
  return (
    <section className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
      <div><p className="text-slate-500">Leads</p><p className="font-semibold">{report.leadsCount}</p></div>
      <div><p className="text-slate-500">Conversions</p><p className="font-semibold">{report.conversions} ({pct(report.conversionRate)})</p></div>
      <div><p className="text-slate-500">Revenue</p><p className="font-semibold">{formatMoney(report.revenue, "LKR")}</p></div>
      <div><p className="text-slate-500">Budget</p><p className="font-semibold">{formatMoney(report.budget, "LKR")}</p></div>
      <div><p className="text-slate-500">Cost per lead</p><p className="font-semibold">{report.costPerLead != null ? formatMoney(report.costPerLead, "LKR") : "—"}</p></div>
      <div><p className="text-slate-500">Cost per acquisition</p><p className="font-semibold">{report.costPerAcquisition != null ? formatMoney(report.costPerAcquisition, "LKR") : "—"}</p></div>
      <div><p className="text-slate-500">ROI</p><p className="font-semibold">{report.roi != null ? pct(report.roi) : "—"}</p></div>
    </section>
  );
}

export const campaigns: MasterConfig<Campaign> = {
  entityType: "marketing.campaign",
  permission: "marketing.campaign",
  plural: "Campaigns",
  singular: "Campaign",
  description: "Matches leads by name to CRM's free-text Lead.campaign field — tag leads with the campaign's exact name to attribute them.",
  route: "/marketing/campaigns",
  client: marketingApi.campaigns,
  defaultSort: "-createdAt",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(CAMPAIGN_STATUSES) },
    { key: "type", label: "Type", options: opts(CAMPAIGN_TYPES) },
  ],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: opts(CAMPAIGN_TYPES), required: true },
    { key: "budget", label: "Budget", type: "text", placeholder: "50000" },
    { key: "startDate", label: "Start date", type: "date", required: true },
    { key: "endDate", label: "End date", type: "date" },
    { key: "goals", label: "Goals", type: "textarea", wide: true },
    { key: "status", label: "Status", type: "select", options: opts(CAMPAIGN_STATUSES) },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => r.status,
  details: (r) => [
    { label: "Budget", value: formatMoney(r.budget, "LKR") },
    { label: "Dates", value: `${formatDate(r.startDate)} – ${r.endDate ? formatDate(r.endDate) : "ongoing"}` },
    { label: "Channels", value: r.channels.join(", ") || null },
    { label: "Goals", value: r.goals },
  ],
  extra: (r) => <CampaignReportPanel r={r} />,
};

function SegmentPreview({ r }: { r: Segment }) {
  const [show, setShow] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ["marketing.segmentPreview", r.id],
    queryFn: () => marketingApi.get<{ items: { id: string; name?: string; firstName?: string; lastName?: string }[] }>(`/marketing/segments/${r.id}/preview`),
    enabled: show,
  });
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Preview</h2>
        <button className="btn-primary" onClick={() => setShow(true)} disabled={isFetching}>{show ? "Refresh" : "Preview members"}</button>
      </div>
      {show && (
        <table className="table-base">
          <tbody>
            {data?.items.map((item) => <tr key={item.id}><td>{item.name ?? `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim()}</td></tr>)}
            {data && data.items.length === 0 && <tr><td className="text-center text-slate-500 py-6">No matches.</td></tr>}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const segments: MasterConfig<Segment> = {
  entityType: "marketing.segment",
  permission: "marketing.segment",
  plural: "Segments",
  singular: "Segment",
  description: "A saved filter over a CRM collection — the same field:value filter string every list page already uses.",
  route: "/marketing/segments",
  client: marketingApi.segments,
  columns: [
    { key: "name", label: "Name" },
    { key: "entityType", label: "Entity", render: (r) => humanize(r.entityType) },
    { key: "filter", label: "Filter", render: (r) => r.filter ?? "—" },
  ],
  filters: [{ key: "entityType", label: "Entity", options: opts(SEGMENT_ENTITY_TYPES) }],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "entityType", label: "Entity", type: "select", options: opts(SEGMENT_ENTITY_TYPES), required: true, createOnly: true },
    { key: "filter", label: "Filter", type: "text", placeholder: "status:active", hint: "field:value,field2:value2 — leave blank to match everything" },
    { key: "description", label: "Description", type: "textarea", wide: true },
  ],
  title: (r) => r.name,
  subtitle: (r) => humanize(r.entityType),
  details: (r) => [{ label: "Filter", value: r.filter }, { label: "Description", value: r.description }],
  extra: (r) => <SegmentPreview r={r} />,
};

interface StepRow { seq: string; delayDays: string; subject: string; body: string }
const blankStep = (nextSeq: number): StepRow => ({ seq: String(nextSeq), delayDays: "1", subject: "", body: "" });

function StepsEditor({ r }: { r: Sequence }) {
  const canEdit = useCan("marketing.sequence.edit");
  const [rows, setRows] = useState<StepRow[]>(
    r.steps.length ? r.steps.map((s) => ({ seq: String(s.seq), delayDays: String(s.delayDays), subject: s.subject, body: s.body })) : [blankStep(1)],
  );
  const save = useMutation({
    mutationFn: () =>
      marketingApi.sequences.update(r.id, {
        steps: rows.filter((row) => row.subject).map((row) => ({ seq: Number(row.seq) || 1, delayDays: Number(row.delayDays) || 0, subject: row.subject, body: row.body })),
      }, r.version),
    onSuccess: () => toast.success("Steps saved"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setRow = (i: number, patch: Partial<StepRow>) => setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  return (
    <section className="card p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Steps</h2>
        {canEdit && (
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setRows((prev) => [...prev, blankStep(prev.length + 1)])}><Plus size={14} /> Add step</button>
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save steps</button>
          </div>
        )}
      </div>
      <table className="table-base">
        <thead><tr><th>Seq</th><th>Delay (days)</th><th>Subject</th><th>Body</th><th /></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td><input className="input-base w-14" disabled={!canEdit} value={row.seq} onChange={(e) => setRow(i, { seq: e.target.value })} /></td>
              <td><input className="input-base w-20" disabled={!canEdit} value={row.delayDays} onChange={(e) => setRow(i, { delayDays: e.target.value })} /></td>
              <td><input className="input-base" disabled={!canEdit} value={row.subject} onChange={(e) => setRow(i, { subject: e.target.value })} /></td>
              <td><input className="input-base" disabled={!canEdit} value={row.body} onChange={(e) => setRow(i, { body: e.target.value })} /></td>
              <td>{canEdit && <button className="btn-ghost" aria-label="Remove step" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mt-2">Definitions only — nothing is sent automatically; there is no outbound email-sequencing engine yet.</p>
    </section>
  );
}

export const sequences: MasterConfig<Sequence> = {
  entityType: "marketing.sequence",
  permission: "marketing.sequence",
  plural: "Sequences",
  singular: "Sequence",
  description: "A definition and enrollment tracker for an automated sequence — it does not send anything yet.",
  route: "/marketing/sequences",
  client: marketingApi.sequences,
  columns: [
    { key: "name", label: "Name" },
    { key: "trigger", label: "Trigger", render: (r) => humanize(r.trigger) },
    { key: "isActive", label: "Active", render: (r) => (r.isActive ? "Yes" : "—") },
  ],
  filters: [{ key: "trigger", label: "Trigger", options: opts(SEQUENCE_TRIGGERS) }],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "trigger", label: "Trigger", type: "select", options: opts(SEQUENCE_TRIGGERS), required: true, createOnly: true },
    { key: "isActive", label: "Active", type: "boolean" },
  ],
  title: (r) => r.name,
  subtitle: (r) => humanize(r.trigger),
  details: (r) => [{ label: "Steps", value: String(r.steps.length) }],
  extra: (r) => <StepsEditor r={r} />,
};

function EnrollmentActions({ r, refresh }: { r: Enrollment; refresh: (e: Enrollment) => void }) {
  const canEdit = useCan("marketing.enrollment.edit");
  const advance = useMutation({
    mutationFn: () => marketingApi.post<Enrollment>(`/marketing/enrollments/${r.id}/advance`),
    onSuccess: (e) => { toast.success(e.status === "completed" ? "Completed" : "Advanced"); refresh(e); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => marketingApi.post<Enrollment>(`/marketing/enrollments/${r.id}/cancel`),
    onSuccess: (e) => { toast.success("Cancelled"); refresh(e); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit || r.status !== "active") return null;
  return (
    <>
      <button className="btn-primary" disabled={advance.isPending} onClick={() => advance.mutate()}>Advance</button>
      <button className="btn-ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel</button>
    </>
  );
}

export const enrollments: MasterConfig<Enrollment> = {
  entityType: "marketing.enrollment",
  permission: "marketing.enrollment",
  plural: "Enrollments",
  singular: "Enrollment",
  route: "/marketing/enrollments",
  client: marketingApi.enrollments,
  defaultSort: "-createdAt",
  columns: [
    { key: "sequenceId", label: "Sequence" },
    { key: "enrolledAt", label: "Enrolled", render: (r) => formatDateTime(r.enrolledAt) },
    { key: "currentStep", label: "Step", render: (r) => (r.currentStep < 0 ? "Not started" : String(r.currentStep + 1)) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(ENROLLMENT_STATUSES) }],
  fields: [
    { key: "sequenceId", label: "Sequence", type: "reference", reference: sequenceOptions, required: true, createOnly: true },
    { key: "leadId", label: "Lead id (either this or account id)", type: "text", createOnly: true },
    { key: "accountId", label: "Account id", type: "text", createOnly: true },
  ],
  editable: () => false,
  title: (r) => `Enrollment · ${formatDateTime(r.enrolledAt)}`,
  subtitle: (r) => r.sequenceId,
  status: (r) => r.status,
  actions: (r, refresh) => <EnrollmentActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Lead", value: r.leadId },
    { label: "Account", value: r.accountId },
    { label: "Next step due", value: r.nextStepDueAt ? formatDate(r.nextStepDueAt) : null },
  ],
};

export const MARKETING_SCREENS: Record<string, MasterConfig<never>> = {
  campaigns: campaigns as unknown as MasterConfig<never>,
  segments: segments as unknown as MasterConfig<never>,
  sequences: sequences as unknown as MasterConfig<never>,
  enrollments: enrollments as unknown as MasterConfig<never>,
};
