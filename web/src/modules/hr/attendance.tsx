"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Coffee, KeyRound, LogIn, LogOut, X } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, ErrorState, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { branchOptions, employeeOptions, useEmployeeName } from "./config";

export interface BreakEntry {
  breakId: string;
  start: string;
  end: string | null;
}
export interface CorrectionRequest {
  requestedAt: string;
  requestedBy: string;
  requestedClockIn: string | null;
  requestedClockOut: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}
export interface AttendanceRecord extends BaseRecord {
  employeeId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  breaks: BreakEntry[];
  method: string;
  deviceId: string | null;
  status: string;
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  correction: CorrectionRequest | null;
  notes: string | null;
}
export interface Device extends BaseRecord {
  code: string;
  name: string;
  branchId: string | null;
  status: "active" | "revoked";
  lastSeenAt: string | null;
}
export interface AttendanceSettings {
  startTime: string;
  endTime: string;
  graceMinutes: number;
  standardMinutes: number;
}
interface Timesheet {
  employeeId: string;
  from: string;
  to: string;
  records: AttendanceRecord[];
  totals: { workedMinutes: number; overtimeMinutes: number; lateMinutes: number; presentDays: number; absentDays: number };
}

export const attendanceApi = {
  records: crud<AttendanceRecord>("/hr/attendance"),
  devices: crud<Device>("/hr/devices"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
  settings: () => api.get("/hr/attendance-settings").then((r) => r.data as AttendanceSettings),
  saveSettings: (body: Partial<AttendanceSettings>) => api.put("/hr/attendance-settings", body).then((r) => r.data as AttendanceSettings),
  timesheet: (employeeId: string, from: string, to: string) => api.get("/hr/attendance/timesheet", { params: { employeeId, from, to } }).then((r) => r.data as Timesheet),
  me: () => api.get("/hr/attendance/me").then((r) => r.data as { employee: { id: string; firstName: string; lastName: string }; today: AttendanceRecord | null }),
};

const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

function minutes(n: number): string {
  if (n <= 0) return "0h 0m";
  return `${Math.floor(n / 60)}h ${n % 60}m`;
}

// ─── Admin: attendance records ─────────────────────────────────────────────

function DecideCorrection({ r, refresh }: { r: AttendanceRecord; refresh: (r: AttendanceRecord) => void }) {
  const can = useCan("hr.attendanceRecord.edit");
  const [open, setOpen] = useState<"approve" | "reject" | null>(null);
  const run = useMutation({
    mutationFn: (note: string) => attendanceApi.post<AttendanceRecord>(`/hr/attendance/${r.id}/correction/decide`, { approve: open === "approve", note: note || undefined }),
    onSuccess: (updated) => { setOpen(null); toast.success(open === "approve" ? "Correction approved" : "Correction rejected"); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || r.correction?.status !== "pending") return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen("approve")}><Check size={15} /> Approve</button>
      <button className="btn-ghost" onClick={() => setOpen("reject")}><X size={15} /> Reject</button>
      <ConfirmDialog
        open={open !== null} title={open === "approve" ? "Approve this correction?" : "Reject this correction?"} confirmLabel={open === "approve" ? "Approve" : "Reject"}
        danger={open === "reject"} reason="optional" busy={run.isPending} onConfirm={(note) => run.mutate(note)} onClose={() => setOpen(null)}
      />
    </>
  );
}

function AttendanceExtra({ r }: { r: AttendanceRecord }) {
  const [current, setCurrent] = useState(r);
  return (
    <div className="space-y-6">
      {current.breaks.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="font-semibold px-4 pt-4 mb-2">Breaks</h2>
          <table className="table-base">
            <thead><tr><th>Start</th><th>End</th><th>Duration</th></tr></thead>
            <tbody>
              {current.breaks.map((b) => (
                <tr key={b.breakId}>
                  <td>{formatDateTime(b.start)}</td>
                  <td>{b.end ? formatDateTime(b.end) : "In progress"}</td>
                  <td>{b.end ? minutes(Math.round((Date.parse(b.end) - Date.parse(b.start)) / 60000)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {current.correction && (
        <section className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Correction request</h2>
            <StatusBadge status={current.correction.status} />
          </div>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between gap-4"><dt>Reason</dt><dd className="text-right">{current.correction.reason}</dd></div>
            {current.correction.requestedClockIn && <div className="flex justify-between gap-4"><dt>Requested clock-in</dt><dd>{formatDateTime(current.correction.requestedClockIn)}</dd></div>}
            {current.correction.requestedClockOut && <div className="flex justify-between gap-4"><dt>Requested clock-out</dt><dd>{formatDateTime(current.correction.requestedClockOut)}</dd></div>}
            {current.correction.decisionNote && <div className="flex justify-between gap-4"><dt>Decision note</dt><dd className="text-right">{current.correction.decisionNote}</dd></div>}
          </dl>
          <div className="flex gap-1 mt-3"><DecideCorrection r={current} refresh={setCurrent} /></div>
        </section>
      )}
    </div>
  );
}

export const attendanceRecords: MasterConfig<AttendanceRecord> = {
  entityType: "hr.attendanceRecord",
  permission: "hr.attendanceRecord",
  plural: "Attendance",
  singular: "Attendance record",
  description: "One day's attendance for one employee. Employees clock in and out themselves from My Attendance; use New only to record an absence or other exception.",
  route: "/hr/attendance-records",
  client: attendanceApi.records,
  defaultSort: "-date",
  columns: [
    { key: "employeeId", label: "Employee", render: (r) => <EmployeeLink id={r.employeeId} /> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "clockIn", label: "In", render: (r) => (r.clockIn ? formatDateTime(r.clockIn) : "—") },
    { key: "clockOut", label: "Out", render: (r) => (r.clockOut ? formatDateTime(r.clockOut) : "—") },
    { key: "method", label: "Method", render: (r) => humanize(r.method) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["present", "late", "early_leave", "half_day", "absent"]) }],
  fields: [
    { key: "employeeId", label: "Employee", type: "reference", reference: employeeOptions, required: true, createOnly: true },
    { key: "date", label: "Date", type: "date", required: true, createOnly: true },
    { key: "status", label: "Status", type: "select", options: opts(["present", "late", "early_leave", "half_day", "absent"]) },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  defaults: { status: "absent" },
  title: (r) => formatDate(r.date),
  subtitle: (r) => humanize(r.status),
  status: (r) => r.status,
  details: (r) => [
    { label: "Employee", value: <EmployeeLink id={r.employeeId} /> },
    { label: "Worked", value: minutes(r.workedMinutes) },
    { label: "Overtime", value: r.overtimeMinutes ? minutes(r.overtimeMinutes) : null },
    { label: "Late", value: r.lateMinutes ? minutes(r.lateMinutes) : null },
    { label: "Early leave", value: r.earlyLeaveMinutes ? minutes(r.earlyLeaveMinutes) : null },
    { label: "Device", value: r.deviceId },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <AttendanceExtra r={r} />,
};

function EmployeeLink({ id }: { id: string }) {
  const name = useEmployeeName();
  return <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/hr/employees/${id}`}>{name(id)}</Link>;
}

// ─── Admin: kiosk devices ───────────────────────────────────────────────────

function IssueKey({ d, refresh }: { d: Device; refresh: (d: Device) => void }) {
  const can = useCan("hr.device.edit");
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: () => attendanceApi.post<{ device: Device; key: string }>(`/hr/devices/${d.id}/issue-key`),
    onSuccess: (r) => { setKey(r.key); refresh(r.device); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => { setKey(null); setOpen(true); }}><KeyRound size={15} /> Issue key</button>
      <ConfirmDialog
        open={open} title="Kiosk device key" confirmLabel={key ? "Done" : "Issue a new key"} busy={run.isPending}
        onConfirm={() => (key ? setOpen(false) : run.mutate())} onClose={() => setOpen(false)}
      >
        {key ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-700 dark:text-amber-400">This key is shown once. Enter it into the kiosk device now; any previous key for this device stops working immediately.</p>
            <code className="block select-all break-all rounded bg-slate-100 dark:bg-slate-800 p-2 text-sm">{key}</code>
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">This retires the device&apos;s current key, if any. Continue?</p>
        )}
      </ConfirmDialog>
    </>
  );
}

function RevokeDevice({ d, refresh }: { d: Device; refresh: (d: Device) => void }) {
  const can = useCan("hr.device.edit");
  const [open, setOpen] = useState(false);
  const run = useMutation({
    mutationFn: () => attendanceApi.post<Device>(`/hr/devices/${d.id}/revoke`),
    onSuccess: (updated) => { setOpen(false); toast.success("Device revoked"); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || d.status !== "active") return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><Ban size={15} /> Revoke</button>
      <ConfirmDialog open={open} title="Revoke this device?" body="Its key stops working immediately; it can be reissued a new one later." confirmLabel="Revoke" danger busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)} />
    </>
  );
}

export const devices: MasterConfig<Device> = {
  entityType: "hr.device",
  permission: "hr.device",
  plural: "Attendance devices",
  singular: "Device",
  description: "Kiosks (gate tablets, scanners) that clock employees in and out by QR code or PIN, authenticated with their own bearer key rather than a user login.",
  route: "/hr/devices",
  client: attendanceApi.devices,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "lastSeenAt", label: "Last seen", render: (r) => (r.lastSeenAt ? formatDateTime(r.lastSeenAt) : "Never") },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["active", "revoked"]) }],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "branchId", label: "Branch", type: "reference", reference: branchOptions },
  ],
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => r.status,
  actions: (r, refresh) => (
    <>
      <IssueKey d={r} refresh={refresh} />
      <RevokeDevice d={r} refresh={refresh} />
    </>
  ),
  details: (r) => [
    { label: "Status", value: <StatusBadge status={r.status} /> },
    { label: "Last seen", value: r.lastSeenAt ? formatDateTime(r.lastSeenAt) : "Never" },
  ],
};

export const ATTENDANCE_SCREENS: Record<string, MasterConfig<never>> = {
  "attendance-records": attendanceRecords as unknown as MasterConfig<never>,
  devices: devices as unknown as MasterConfig<never>,
};

// ─── Self-service: My Attendance ───────────────────────────────────────────

function RequestCorrection({ record, onDone }: { record: AttendanceRecord; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const run = useMutation({
    mutationFn: () => attendanceApi.post(`/hr/attendance/${record.id}/correction`, { reason }),
    onSuccess: () => { setOpen(false); setReason(""); toast.success("Correction requested"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (record.correction?.status === "pending") return <p className="text-sm text-slate-500">A correction request is pending review.</p>;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>Request a correction</button>
      <ConfirmDialog open={open} title="Request a correction" confirmLabel="Send request" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <Field label="What should it be?" required><textarea className="input-base" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Clocked in at 9:05, not 9:40" /></Field>
      </ConfirmDialog>
    </>
  );
}

export function MyAttendancePage() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["hr-attendance-me"], queryFn: attendanceApi.me });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["hr-attendance-me"] });
  const action = useMutation({
    mutationFn: (path: string) => attendanceApi.post<AttendanceRecord>(`/hr/attendance/${path}`),
    onSuccess: () => refresh(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <div className="p-6"><Spinner /></div>;
  if (q.isError) return <ErrorState message="Could not load your attendance. Make sure you have an employee record linked to your account." />;

  const today = q.data!.today;
  const openBreak = today?.breaks.find((b) => !b.end) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="My Attendance" subtitle={`${q.data!.employee.firstName} ${q.data!.employee.lastName} · ${today ? formatDate(today.date) : "Today"}`} />
      <section className="card p-6 space-y-4">
        {!today || !today.clockIn ? (
          <button className="btn-primary" disabled={action.isPending} onClick={() => action.mutate("clock-in")}><LogIn size={16} /> Clock in</button>
        ) : !today.clockOut ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2"><StatusBadge status={today.status} /><span className="text-sm text-slate-500">Clocked in at {formatDateTime(today.clockIn)}</span></div>
            <div className="flex flex-wrap gap-2">
              {!openBreak ? (
                <button className="btn-secondary" disabled={action.isPending} onClick={() => action.mutate("break/start")}><Coffee size={15} /> Start break</button>
              ) : (
                <button className="btn-secondary" disabled={action.isPending} onClick={() => action.mutate("break/end")}><Coffee size={15} /> End break</button>
              )}
              <button className="btn-primary" disabled={action.isPending || !!openBreak} onClick={() => action.mutate("clock-out")}><LogOut size={16} /> Clock out</button>
            </div>
            {openBreak && <p className="text-xs text-slate-500">End your break before clocking out.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2"><StatusBadge status={today.status} /><span className="text-sm text-slate-500">{formatDateTime(today.clockIn)} – {formatDateTime(today.clockOut)} · {minutes(today.workedMinutes)} worked</span></div>
            <RequestCorrection record={today} onDone={refresh} />
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Admin: timesheet report ────────────────────────────────────────────────

export function TimesheetPage() {
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const empName = useEmployeeName();
  const q = useQuery({
    queryKey: ["hr-timesheet", employeeId, from, to],
    queryFn: () => attendanceApi.timesheet(employeeId, from, to),
    enabled: !!employeeId,
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Timesheet" subtitle="Worked, overtime and late minutes for one employee over a date range." />
      <section className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <EmployeePicker value={employeeId} onChange={setEmployeeId} />
          <Field label="From"><input type="date" className="input-base" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className="input-base" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </section>
      {!employeeId ? (
        <p className="text-sm text-slate-500">Choose an employee to see their timesheet.</p>
      ) : q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState message="Could not load the timesheet" />
      ) : (
        <>
          <section className="card p-4 grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
            <div><p className="text-slate-500">Present</p><p className="text-lg font-semibold">{q.data!.totals.presentDays}d</p></div>
            <div><p className="text-slate-500">Absent</p><p className="text-lg font-semibold">{q.data!.totals.absentDays}d</p></div>
            <div><p className="text-slate-500">Worked</p><p className="text-lg font-semibold">{minutes(q.data!.totals.workedMinutes)}</p></div>
            <div><p className="text-slate-500">Overtime</p><p className="text-lg font-semibold">{minutes(q.data!.totals.overtimeMinutes)}</p></div>
            <div><p className="text-slate-500">Late</p><p className="text-lg font-semibold">{minutes(q.data!.totals.lateMinutes)}</p></div>
          </section>
          <section className="card overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Worked</th><th>Status</th></tr></thead>
              <tbody>
                {q.data!.records.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.clockIn ? formatDateTime(r.clockIn) : "—"}</td>
                    <td>{r.clockOut ? formatDateTime(r.clockOut) : "—"}</td>
                    <td>{minutes(r.workedMinutes)}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
                {q.data!.records.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-6">No records in this range.</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      )}
      <p className="text-xs text-slate-500">{empName(employeeId || null)}</p>
    </div>
  );
}

function EmployeePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const q = useQuery({ queryKey: employeeOptions.queryKey, queryFn: employeeOptions.load });
  return (
    <Field label="Employee">
      <select className="input-base" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {q.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

// ─── Admin: attendance settings ─────────────────────────────────────────────

export function AttendanceSettingsPage() {
  const can = useCan("hr.attendanceRecord.edit");
  const q = useQuery({ queryKey: ["hr-attendance-settings"], queryFn: attendanceApi.settings });
  const [form, setForm] = useState<AttendanceSettings | null>(null);
  const current = form ?? q.data ?? null;
  const save = useMutation({
    mutationFn: () => attendanceApi.saveSettings(current!),
    onSuccess: (r) => { setForm(r); toast.success("Saved"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return <ErrorState message="You do not have permission to view attendance settings." />;
  if (q.isLoading || !current) return <div className="p-6"><Spinner /></div>;
  const set = (patch: Partial<AttendanceSettings>) => setForm({ ...current, ...patch });
  return (
    <div className="space-y-6">
      <PageHeader title="Attendance settings" subtitle="The standard shift used to work out late arrivals, early leave and overtime, until Shifts is built." />
      <section className="card p-5 space-y-4 max-w-lg">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time"><input type="time" className="input-base" value={current.startTime} onChange={(e) => set({ startTime: e.target.value })} /></Field>
          <Field label="End time"><input type="time" className="input-base" value={current.endTime} onChange={(e) => set({ endTime: e.target.value })} /></Field>
          <Field label="Grace period (minutes)" hint="0–240"><input type="number" min={0} max={240} className="input-base" value={current.graceMinutes} onChange={(e) => set({ graceMinutes: Number(e.target.value) })} /></Field>
          <Field label="Standard day (minutes)" hint="60–960"><input type="number" min={60} max={960} className="input-base" value={current.standardMinutes} onChange={(e) => set({ standardMinutes: Number(e.target.value) })} /></Field>
        </div>
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Spinner size={14} className="text-white" />} Save</button>
      </section>
    </div>
  );
}
