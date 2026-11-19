"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Check, Repeat, X } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, ErrorState, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { employeeOptions, useEmployeeName } from "./config";

export interface ShiftTemplate extends BaseRecord {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  isNightShift: boolean;
  breakMinutes: number;
  color: string | null;
  notes: string | null;
}
export interface SwapRequest {
  requestedAt: string;
  requestedBy: string;
  targetAssignmentId: string;
  targetEmployeeId: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}
export interface ShiftAssignment extends BaseRecord {
  employeeId: string;
  date: string;
  templateId: string;
  startTime: string;
  endTime: string;
  isNightShift: boolean;
  isHoliday: boolean;
  status: "scheduled" | "swapped" | "cancelled";
  swap: SwapRequest | null;
  notes: string | null;
}

export const shiftsApi = {
  templates: crud<ShiftTemplate>("/hr/shift-templates"),
  assignments: crud<ShiftAssignment>("/hr/shift-assignments"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
  calendar: (from: string, to: string) => api.get("/hr/shift-assignments/calendar", { params: { from, to } }).then((r) => r.data as ShiftAssignment[]),
  mySchedule: (from: string, to: string) => api.get("/hr/shift-assignments/me", { params: { from, to } }).then((r) => r.data as ShiftAssignment[]),
};

export const templateOptions = { queryKey: ["options", "hr.shiftTemplates"], load: async () => (await shiftsApi.templates.list({ limit: 200 })).items.map((t) => ({ value: t.id, label: `${t.code} · ${t.name} (${t.startTime}–${t.endTime})` })) };

function EmployeeLink({ id }: { id: string }) {
  const name = useEmployeeName();
  return <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/hr/employees/${id}`}>{name(id)}</Link>;
}

// ─── Admin: shift templates ─────────────────────────────────────────────────

export const shiftTemplates: MasterConfig<ShiftTemplate> = {
  entityType: "hr.shiftTemplate",
  permission: "hr.shiftTemplate",
  plural: "Shift templates",
  singular: "Shift template",
  description: "A reusable shift shape. Assigning an employee to one copies its times onto the assignment, so editing a template never changes a shift already assigned.",
  route: "/hr/shift-templates",
  client: shiftsApi.templates,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "hours", label: "Hours", render: (r) => `${r.startTime}–${r.endTime}` },
    { key: "isNightShift", label: "Night shift", render: (r) => (r.isNightShift ? "Yes" : "—") },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "startTime", label: "Start time", type: "text", placeholder: "08:00", required: true },
    { key: "endTime", label: "End time", type: "text", placeholder: "16:00", hint: "An end time at or before the start time is a night shift (crosses midnight)", required: true },
    { key: "breakMinutes", label: "Break (minutes)", type: "number" },
    { key: "color", label: "Colour", type: "text", placeholder: "#2563eb" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => r.name,
  subtitle: (r) => `${r.code} · ${r.startTime}–${r.endTime}`,
};

// ─── Admin: shift assignments ───────────────────────────────────────────────

function DecideSwap({ a, refresh }: { a: ShiftAssignment; refresh: (a: ShiftAssignment) => void }) {
  const can = useCan("hr.shiftAssignment.edit");
  const [open, setOpen] = useState<"approve" | "reject" | null>(null);
  const run = useMutation({
    mutationFn: (note: string) => shiftsApi.post<ShiftAssignment>(`/hr/shift-assignments/${a.id}/swap/decide`, { approve: open === "approve", note: note || undefined }),
    onSuccess: (updated) => { setOpen(null); toast.success(open === "approve" ? "Swap approved" : "Swap rejected"); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || a.swap?.status !== "pending") return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen("approve")}><Check size={15} /> Approve swap</button>
      <button className="btn-ghost" onClick={() => setOpen("reject")}><X size={15} /> Reject swap</button>
      <ConfirmDialog
        open={open !== null} title={open === "approve" ? "Approve this swap?" : "Reject this swap?"} confirmLabel={open === "approve" ? "Approve" : "Reject"}
        body={open === "approve" ? "The two employees exchange this shift and the target shift." : undefined} danger={open === "reject"} reason="optional" busy={run.isPending}
        onConfirm={(note) => run.mutate(note)} onClose={() => setOpen(null)}
      />
    </>
  );
}

function CancelAssignment({ a, refresh }: { a: ShiftAssignment; refresh: (a: ShiftAssignment) => void }) {
  const can = useCan("hr.shiftAssignment.edit");
  const [open, setOpen] = useState(false);
  const run = useMutation({
    mutationFn: (reason: string) => shiftsApi.post<ShiftAssignment>(`/hr/shift-assignments/${a.id}/cancel`, { reason: reason || undefined }),
    onSuccess: (updated) => { setOpen(false); toast.success("Cancelled"); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || a.status === "cancelled") return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><Ban size={15} /> Cancel</button>
      <ConfirmDialog open={open} title="Cancel this shift?" confirmLabel="Cancel shift" danger reason="optional" busy={run.isPending} onConfirm={(reason) => run.mutate(reason)} onClose={() => setOpen(false)} />
    </>
  );
}

function AssignmentExtra({ a }: { a: ShiftAssignment }) {
  const [current, setCurrent] = useState(a);
  if (!current.swap) return null;
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Swap request</h2>
        <StatusBadge status={current.swap.status} />
      </div>
      <dl className="text-sm space-y-1">
        <div className="flex justify-between gap-4"><dt>With</dt><dd><EmployeeLink id={current.swap.targetEmployeeId} /></dd></div>
        {current.swap.note && <div className="flex justify-between gap-4"><dt>Note</dt><dd className="text-right">{current.swap.note}</dd></div>}
        {current.swap.decisionNote && <div className="flex justify-between gap-4"><dt>Decision note</dt><dd className="text-right">{current.swap.decisionNote}</dd></div>}
      </dl>
      <div className="flex gap-1 mt-3"><DecideSwap a={current} refresh={setCurrent} /></div>
    </section>
  );
}

export const shiftAssignments: MasterConfig<ShiftAssignment> = {
  entityType: "hr.shiftAssignment",
  permission: "hr.shiftAssignment",
  plural: "Shift assignments",
  singular: "Shift assignment",
  description: "One employee assigned to one shift on one date. Employees request swaps themselves from My Shifts; use New only for a direct assignment or backfill.",
  route: "/hr/shift-assignments",
  client: shiftsApi.assignments,
  defaultSort: "-date",
  columns: [
    { key: "employeeId", label: "Employee", render: (r) => <EmployeeLink id={r.employeeId} /> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "hours", label: "Hours", render: (r) => `${r.startTime}–${r.endTime}` },
    { key: "isHoliday", label: "Holiday", render: (r) => (r.isHoliday ? "Yes" : "—") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: ["scheduled", "swapped", "cancelled"].map((v) => ({ value: v, label: humanize(v) })) }],
  fields: [
    { key: "employeeId", label: "Employee", type: "reference", reference: employeeOptions, required: true, createOnly: true },
    { key: "date", label: "Date", type: "date", required: true, createOnly: true },
    { key: "templateId", label: "Shift template", type: "reference", reference: templateOptions, required: true, createOnly: true },
    { key: "isHoliday", label: "Holiday shift", type: "boolean" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => formatDate(r.date),
  subtitle: (r) => `${r.startTime}–${r.endTime}`,
  status: (r) => r.status,
  editable: (r) => r.status === "scheduled",
  actions: (r, refresh) => <CancelAssignment a={r} refresh={refresh} />,
  details: (r) => [
    { label: "Employee", value: <EmployeeLink id={r.employeeId} /> },
    { label: "Night shift", value: r.isNightShift ? "Yes" : null },
    { label: "Holiday", value: r.isHoliday ? "Yes" : null },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <AssignmentExtra a={r} />,
};

export const SHIFT_SCREENS: Record<string, MasterConfig<never>> = {
  "shift-templates": shiftTemplates as unknown as MasterConfig<never>,
  "shift-assignments": shiftAssignments as unknown as MasterConfig<never>,
};

// ─── Self-service: My Shifts ────────────────────────────────────────────────

function RequestSwap({ a, onDone }: { a: ShiftAssignment; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [targetAssignmentId, setTargetAssignmentId] = useState("");
  const [note, setNote] = useState("");
  const run = useMutation({
    mutationFn: () => shiftsApi.post(`/hr/shift-assignments/${a.id}/swap`, { targetAssignmentId, note: note || undefined }),
    onSuccess: () => { setOpen(false); setTargetAssignmentId(""); setNote(""); toast.success("Swap requested"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (a.status !== "scheduled") return null;
  if (a.swap?.status === "pending") return <span className="text-xs text-slate-500">Swap pending</span>;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><Repeat size={15} /> Swap</button>
      <ConfirmDialog open={open} title="Request a shift swap" confirmLabel="Send request" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Other shift's ID" required hint="Ask the coworker, or your manager, for the shift's ID"><input className="input-base" value={targetAssignmentId} onChange={(e) => setTargetAssignmentId(e.target.value)} /></Field>
          <Field label="Note"><textarea className="input-base" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function weekRange(): [string, string] {
  const from = new Date();
  const to = new Date(from.getTime() + 13 * 86400_000);
  return [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)];
}

export function MyShiftsPage() {
  const [from, to] = weekRange();
  const q = useQuery({ queryKey: ["hr-shifts-me", from, to], queryFn: () => shiftsApi.mySchedule(from, to) });
  const refresh = () => q.refetch();
  return (
    <div className="space-y-6">
      <PageHeader title="My Shifts" subtitle={`${formatDate(from)} – ${formatDate(to)}`} />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState message="Could not load your shifts. Make sure you have an employee record linked to your account." />
      ) : q.data!.length === 0 ? (
        <p className="text-sm text-slate-500">No shifts scheduled in the next two weeks.</p>
      ) : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Date</th><th>Hours</th><th>Status</th><th /></tr></thead>
            <tbody>
              {q.data!.map((a) => (
                <tr key={a.id}>
                  <td>{formatDate(a.date)}{a.isHoliday ? " · Holiday" : ""}</td>
                  <td>{a.startTime}–{a.endTime}{a.isNightShift ? " (night)" : ""}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td><RequestSwap a={a} onDone={refresh} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// ─── Admin: shift calendar ───────────────────────────────────────────────────

export function ShiftCalendarPage() {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date(Date.now() + 6 * 86400_000).toISOString().slice(0, 10));
  const empName = useEmployeeName();
  const q = useQuery({ queryKey: ["hr-shift-calendar", from, to], queryFn: () => shiftsApi.calendar(from, to) });
  return (
    <div className="space-y-6">
      <PageHeader title="Shift calendar" subtitle="Every employee's shifts in a date range." />
      <section className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
          <Field label="From"><input type="date" className="input-base" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className="input-base" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </section>
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState message="Could not load the calendar" />
      ) : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Date</th><th>Employee</th><th>Hours</th><th>Status</th></tr></thead>
            <tbody>
              {q.data!.map((a) => (
                <tr key={a.id}>
                  <td>{formatDate(a.date)}{a.isHoliday ? " · Holiday" : ""}</td>
                  <td>{empName(a.employeeId)}</td>
                  <td>{a.startTime}–{a.endTime}{a.isNightShift ? " (night)" : ""}</td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              ))}
              {q.data!.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-6">No shifts in this range.</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
