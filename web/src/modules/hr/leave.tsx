"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, X } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, ErrorState, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { employeeOptions, useEmployeeName } from "./config";

export interface LeavePolicy extends BaseRecord {
  code: string;
  name: string;
  type: string;
  accrualFrequency: "annual" | "monthly";
  annualEntitlementDays: number;
  carryForwardMaxDays: number;
  isPaid: boolean;
  requiresApproval: boolean;
  noticeDays: number;
  color: string | null;
  notes: string | null;
}
export interface Holiday extends BaseRecord {
  date: string;
  name: string;
  isOptional: boolean;
  notes: string | null;
}
export interface LeaveRequest extends BaseRecord {
  employeeId: string;
  policyId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}
export interface LeaveBalance {
  policy: LeavePolicy;
  balance: { year: number; entitlementDays: number; carriedForwardDays: number; usedDays: number; remainingDays: number };
}

export const leaveApi = {
  policies: crud<LeavePolicy>("/hr/leave-policies"),
  holidays: crud<Holiday>("/hr/holidays"),
  requests: crud<LeaveRequest>("/hr/leave-requests"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
  calendar: (from: string, to: string) => api.get("/hr/leave-requests/calendar", { params: { from, to } }).then((r) => r.data as LeaveRequest[]),
  rollover: (year: number) => api.post("/hr/leave/rollover", { year }).then((r) => r.data as { year: number; employees: number; policies: number; balancesUpdated: number }),
  myRequests: () => api.get("/hr/leave/me/requests").then((r) => r.data as { items: LeaveRequest[] }),
  myBalances: () => api.get("/hr/leave/me/balances").then((r) => r.data as LeaveBalance[]),
};

export const leavePolicyOptions = { queryKey: ["options", "hr.leavePolicies"], load: async () => (await leaveApi.policies.list({ limit: 200 })).items.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })) };

function EmployeeLink({ id }: { id: string }) {
  const name = useEmployeeName();
  return <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/hr/employees/${id}`}>{name(id)}</Link>;
}
function usePolicyName() {
  const { data } = useQuery({ queryKey: ["options", "hr.leavePolicies-raw"], queryFn: () => leaveApi.policies.list({ limit: 200 }) });
  return (id: string) => data?.items.find((p) => p.id === id)?.name ?? "…";
}
function PolicyLabel({ id }: { id: string }) {
  const name = usePolicyName();
  return <>{name(id)}</>;
}

// ─── Admin: leave policies and holidays ─────────────────────────────────────

export const leavePolicies: MasterConfig<LeavePolicy> = {
  entityType: "hr.leavePolicy",
  permission: "hr.leavePolicy",
  plural: "Leave policies",
  singular: "Leave policy",
  description: "A leave type's rules: entitlement, whether it is paid, whether it needs approval, and how much carries forward at rollover. Whole days only.",
  route: "/hr/leave-policies",
  client: leaveApi.policies,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "annualEntitlementDays", label: "Entitlement", render: (r) => `${r.annualEntitlementDays}d` },
    { key: "isPaid", label: "Paid", render: (r) => (r.isPaid ? "Yes" : "No") },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: ["annual", "sick", "casual", "unpaid", "maternity", "paternity", "special", "custom"].map((v) => ({ value: v, label: humanize(v) })), required: true },
    { key: "accrualFrequency", label: "Accrual", type: "select", options: [{ value: "annual", label: "Annual (granted by rollover)" }, { value: "monthly", label: "Monthly (manual for now)" }] },
    { key: "annualEntitlementDays", label: "Annual entitlement (days)", type: "number", required: true },
    { key: "carryForwardMaxDays", label: "Max carry-forward (days)", type: "number" },
    { key: "noticeDays", label: "Notice required (days)", type: "number" },
    { key: "isPaid", label: "Paid", type: "boolean" },
    { key: "requiresApproval", label: "Requires approval", type: "boolean" },
    { key: "color", label: "Colour", type: "text", placeholder: "#16a34a" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  defaults: { accrualFrequency: "annual", isPaid: true, requiresApproval: true },
  title: (r) => r.name,
  subtitle: (r) => `${r.code} · ${r.annualEntitlementDays} days/year`,
};

export const holidays: MasterConfig<Holiday> = {
  entityType: "hr.holiday",
  permission: "hr.holiday",
  plural: "Holidays",
  singular: "Holiday",
  description: "The company holiday calendar; excluded automatically when counting leave request days.",
  route: "/hr/holidays",
  client: leaveApi.holidays,
  defaultSort: "date",
  columns: [
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "name", label: "Name" },
    { key: "isOptional", label: "Optional", render: (r) => (r.isOptional ? "Yes" : "—") },
  ],
  fields: [
    { key: "date", label: "Date", type: "date", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "isOptional", label: "Optional holiday", type: "boolean" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => r.name,
  subtitle: (r) => formatDate(r.date),
};

// ─── Admin: leave requests ───────────────────────────────────────────────────

function DecideLeave({ r, refresh }: { r: LeaveRequest; refresh: (r: LeaveRequest) => void }) {
  const can = useCan("hr.leaveRequest.edit");
  const [open, setOpen] = useState<"approve" | "reject" | null>(null);
  const run = useMutation({
    mutationFn: (note: string) => leaveApi.post<LeaveRequest>(`/hr/leave-requests/${r.id}/decide`, { approve: open === "approve", note: note || undefined }),
    onSuccess: (updated) => { setOpen(null); toast.success(open === "approve" ? "Approved" : "Rejected"); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || r.status !== "pending") return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen("approve")}><Check size={15} /> Approve</button>
      <button className="btn-ghost" onClick={() => setOpen("reject")}><X size={15} /> Reject</button>
      <ConfirmDialog open={open !== null} title={open === "approve" ? "Approve this leave?" : "Reject this leave?"} confirmLabel={open === "approve" ? "Approve" : "Reject"} danger={open === "reject"} reason="optional" busy={run.isPending} onConfirm={(note) => run.mutate(note)} onClose={() => setOpen(null)} />
    </>
  );
}

function CancelLeave({ r, refresh }: { r: LeaveRequest; refresh: (r: LeaveRequest) => void }) {
  const can = useCan("hr.leaveRequest.edit");
  const [open, setOpen] = useState(false);
  const run = useMutation({
    mutationFn: (reason: string) => leaveApi.post<LeaveRequest>(`/hr/leave-requests/${r.id}/cancel`, { reason: reason || undefined }),
    onSuccess: (updated) => { setOpen(false); toast.success("Cancelled"); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || r.status === "cancelled") return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><Ban size={15} /> Cancel</button>
      <ConfirmDialog open={open} title="Cancel this leave request?" body={r.status === "approved" ? "Its days will be returned to the employee's balance." : undefined} confirmLabel="Cancel" danger reason="optional" busy={run.isPending} onConfirm={(reason) => run.mutate(reason)} onClose={() => setOpen(false)} />
    </>
  );
}

export const leaveRequests: MasterConfig<LeaveRequest> = {
  entityType: "hr.leaveRequest",
  permission: "hr.leaveRequest",
  plural: "Leave requests",
  singular: "Leave request",
  description: "Employees request their own leave from My Leave; use New only for a direct or backdated request.",
  route: "/hr/leave-requests",
  client: leaveApi.requests,
  defaultSort: "-startDate",
  columns: [
    { key: "employeeId", label: "Employee", render: (r) => <EmployeeLink id={r.employeeId} /> },
    { key: "dates", label: "Dates", render: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}` },
    { key: "days", label: "Days", render: (r) => `${r.days}d` },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: ["pending", "approved", "rejected", "cancelled"].map((v) => ({ value: v, label: humanize(v) })) }],
  fields: [
    { key: "employeeId", label: "Employee", type: "reference", reference: employeeOptions, required: true, createOnly: true },
    { key: "policyId", label: "Leave policy", type: "reference", reference: leavePolicyOptions, required: true, createOnly: true },
    { key: "startDate", label: "Start date", type: "date", required: true, createOnly: true },
    { key: "endDate", label: "End date", type: "date", required: true, createOnly: true },
    { key: "reason", label: "Reason", type: "textarea", wide: true },
  ],
  title: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`,
  subtitle: (r) => `${r.days} day(s)`,
  status: (r) => r.status,
  editable: () => false,
  actions: (r, refresh) => <><DecideLeave r={r} refresh={refresh} /><CancelLeave r={r} refresh={refresh} /></>,
  details: (r) => [
    { label: "Employee", value: <EmployeeLink id={r.employeeId} /> },
    { label: "Policy", value: <PolicyLabel id={r.policyId} /> },
    { label: "Reason", value: r.reason },
    { label: "Decision note", value: r.decisionNote },
    { label: "Cancelled", value: r.cancelledAt ? `${formatDate(r.cancelledAt)} — ${r.cancelReason}` : null },
  ],
};

export const LEAVE_SCREENS: Record<string, MasterConfig<never>> = {
  "leave-policies": leavePolicies as unknown as MasterConfig<never>,
  holidays: holidays as unknown as MasterConfig<never>,
  "leave-requests": leaveRequests as unknown as MasterConfig<never>,
};

// ─── Self-service: My Leave ─────────────────────────────────────────────────

function RequestLeaveForm({ onDone }: { onDone: () => void }) {
  const q = useQuery({ queryKey: leavePolicyOptions.queryKey, queryFn: leavePolicyOptions.load });
  const [open, setOpen] = useState(false);
  const [policyId, setPolicyId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const run = useMutation({
    mutationFn: () => leaveApi.post("/hr/leave/me/requests", { policyId, startDate, endDate, reason: reason || undefined }),
    onSuccess: () => { setOpen(false); setPolicyId(""); setStartDate(""); setEndDate(""); setReason(""); toast.success("Leave requested"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Request leave</button>
      <ConfirmDialog open={open} title="Request leave" confirmLabel="Send request" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Policy" required>
            <select className="input-base" value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
              <option value="">Select…</option>
              {q.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" required><input type="date" className="input-base" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
            <Field label="End date" required><input type="date" className="input-base" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
          </div>
          <Field label="Reason"><textarea className="input-base" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function CancelMyRequest({ r, onDone }: { r: LeaveRequest; onDone: () => void }) {
  const run = useMutation({
    mutationFn: () => leaveApi.post(`/hr/leave/me/requests/${r.id}/cancel`, {}),
    onSuccess: () => { toast.success("Cancelled"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (r.status !== "pending") return null;
  return <button className="btn-ghost" disabled={run.isPending} onClick={() => run.mutate()}><Ban size={15} /> Cancel</button>;
}

export function MyLeavePage() {
  const queryClient = useQueryClient();
  const balancesQ = useQuery({ queryKey: ["hr-leave-balances-me"], queryFn: leaveApi.myBalances });
  const requestsQ = useQuery({ queryKey: ["hr-leave-requests-me"], queryFn: leaveApi.myRequests });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["hr-leave-balances-me"] }); queryClient.invalidateQueries({ queryKey: ["hr-leave-requests-me"] }); };

  if (balancesQ.isLoading || requestsQ.isLoading) return <div className="p-6"><Spinner /></div>;
  if (balancesQ.isError || requestsQ.isError) return <ErrorState message="Could not load your leave. Make sure you have an employee record linked to your account." />;

  return (
    <div className="space-y-6">
      <PageHeader title="My Leave" actions={<RequestLeaveForm onDone={refresh} />} />
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Balances</h2>
        <table className="table-base">
          <thead><tr><th>Policy</th><th>Entitlement</th><th>Carried forward</th><th>Used</th><th>Remaining</th></tr></thead>
          <tbody>
            {balancesQ.data!.map((b) => (
              <tr key={b.policy.id}>
                <td>{b.policy.name}</td><td>{b.balance.entitlementDays}d</td><td>{b.balance.carriedForwardDays}d</td><td>{b.balance.usedDays}d</td><td className="font-medium">{b.balance.remainingDays}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">My requests</h2>
        <table className="table-base">
          <thead><tr><th>Dates</th><th>Days</th><th>Status</th><th /></tr></thead>
          <tbody>
            {requestsQ.data!.items.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.startDate)} – {formatDate(r.endDate)}</td><td>{r.days}d</td><td><StatusBadge status={r.status} /></td>
                <td><CancelMyRequest r={r} onDone={refresh} /></td>
              </tr>
            ))}
            {requestsQ.data!.items.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-6">No leave requests yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ─── Admin: leave calendar ───────────────────────────────────────────────────

export function LeaveCalendarPage() {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10));
  const empName = useEmployeeName();
  const policyName = usePolicyName();
  const q = useQuery({ queryKey: ["hr-leave-calendar", from, to], queryFn: () => leaveApi.calendar(from, to) });
  return (
    <div className="space-y-6">
      <PageHeader title="Leave calendar" subtitle="Who is on approved leave, by start date, in a date range." />
      <section className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
          <Field label="From"><input type="date" className="input-base" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className="input-base" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </section>
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message="Could not load the calendar" /> : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Dates</th><th>Employee</th><th>Policy</th><th>Days</th></tr></thead>
            <tbody>
              {q.data!.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.startDate)} – {formatDate(r.endDate)}</td><td>{empName(r.employeeId)}</td><td>{policyName(r.policyId)}</td><td>{r.days}d</td>
                </tr>
              ))}
              {q.data!.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-6">No approved leave in this range.</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// ─── Admin: yearly rollover ──────────────────────────────────────────────────

export function LeaveRolloverPage() {
  const [year, setYear] = useState(() => new Date().getFullYear() + 1);
  const [result, setResult] = useState<{ year: number; employees: number; policies: number; balancesUpdated: number } | null>(null);
  const run = useMutation({
    mutationFn: () => leaveApi.rollover(year),
    onSuccess: (r) => { setResult(r); toast.success("Rollover complete"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Leave rollover" subtitle="Resets every employee's balance for every policy into a new year, carrying forward up to each policy's cap. Run once, at the start of the year." />
      <section className="card p-5 max-w-sm space-y-4">
        <Field label="Year"><input type="number" className="input-base" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field>
        <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending && <Spinner size={14} className="text-white" />} Run rollover</button>
        {result && <p className="text-sm text-slate-600 dark:text-slate-300">Updated {result.balancesUpdated} balance(s) across {result.employees} employee(s) and {result.policies} policy(ies) into {result.year}.</p>}
      </section>
    </div>
  );
}
