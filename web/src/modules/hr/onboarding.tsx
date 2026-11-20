"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Ban, Check, SkipForward, UserCog } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";
import { employeeOptions, useEmployeeName } from "./config";

export interface ChecklistItem {
  itemId: string;
  title: string;
  category: string;
  assigneeUserId: string | null;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
}
export interface Checklist extends BaseRecord {
  employeeId: string;
  type: string;
  startedAt: string;
  targetDate: string | null;
  status: string;
  items: ChecklistItem[];
  notes: string | null;
}

export const onboardingApi = {
  checklists: crud<Checklist>("/hr/checklists"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const linkCls = "text-blue-700 dark:text-blue-400 hover:underline";

function EmployeeLink({ id }: { id: string }) {
  const name = useEmployeeName();
  return <Link className={linkCls} href={`/hr/employees/${id}`}>{name(id)}</Link>;
}

function CancelChecklist({ c, refresh }: { c: Checklist; refresh: (c: Checklist) => void }) {
  const can = useCan("hr.checklist.edit");
  const [open, setOpen] = useState(false);
  const run = useMutation({
    mutationFn: (reason: string) => onboardingApi.post<Checklist>(`/hr/checklists/${c.id}/cancel`, { reason: reason || undefined }),
    onSuccess: (r) => { setOpen(false); toast.success("Cancelled"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || c.status !== "in_progress") return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><Ban size={15} /> Cancel</button>
      <ConfirmDialog open={open} title="Cancel this checklist?" confirmLabel="Cancel checklist" danger reason="optional" busy={run.isPending} onConfirm={(why) => run.mutate(why)} onClose={() => setOpen(false)} />
    </>
  );
}

function AssignItem({ c, item, refresh }: { c: Checklist; item: ChecklistItem; refresh: (c: Checklist) => void }) {
  const can = useCan("hr.checklist.edit");
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const run = useMutation({
    mutationFn: () => onboardingApi.post<Checklist>(`/hr/checklists/${c.id}/items/${item.itemId}/assign`, { userId: userId || undefined }),
    onSuccess: (r) => { setOpen(false); toast.success("Assigned"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || c.status !== "in_progress") return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><UserCog size={15} /></button>
      <ConfirmDialog open={open} title={`Assign “${item.title}”`} confirmLabel="Assign" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <Field label="User ID" hint="The platform user responsible"><input className="input-base" value={userId} onChange={(e) => setUserId(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  );
}

function ItemStatus({ c, item, refresh }: { c: Checklist; item: ChecklistItem; refresh: (c: Checklist) => void }) {
  const can = useCan("hr.checklist.edit");
  const run = useMutation({
    mutationFn: (status: "done" | "skipped") => onboardingApi.post<Checklist>(`/hr/checklists/${c.id}/items/${item.itemId}/status`, { status }),
    onSuccess: (r) => { toast.success("Saved"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || c.status !== "in_progress" || item.status !== "pending") return null;
  return (
    <>
      <button className="btn-ghost" disabled={run.isPending} onClick={() => run.mutate("done")}><Check size={15} /> Done</button>
      <button className="btn-ghost" disabled={run.isPending} onClick={() => run.mutate("skipped")}><SkipForward size={15} /> Skip</button>
    </>
  );
}

function ChecklistExtra({ c }: { c: Checklist }) {
  const [current, setCurrent] = useState(c);
  const empName = useEmployeeName();
  return (
    <section className="card overflow-x-auto">
      <h2 className="font-semibold px-4 pt-4 mb-2">Items</h2>
      <table className="table-base">
        <thead><tr><th>Item</th><th>Category</th><th>Due</th><th>Assignee</th><th>Status</th><th /></tr></thead>
        <tbody>
          {current.items.map((i) => (
            <tr key={i.itemId}>
              <td>{i.title}{i.notes ? <span className="block text-xs text-slate-500">{i.notes}</span> : null}</td>
              <td>{humanize(i.category)}</td><td>{i.dueDate ? formatDate(i.dueDate) : "—"}</td>
              <td>{i.assigneeUserId ? empName(i.assigneeUserId) : "—"}</td>
              <td><StatusBadge status={i.status} /></td>
              <td className="flex gap-1"><ItemStatus c={current} item={i} refresh={setCurrent} /><AssignItem c={current} item={i} refresh={setCurrent} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export const checklists: MasterConfig<Checklist> = {
  entityType: "hr.checklist",
  permission: "hr.checklist",
  plural: "Onboarding & offboarding",
  singular: "Checklist",
  description: "A hire or exit checklist for one employee. Account, access and equipment items are reminders for action elsewhere (Settings → Users, the Assets register), not automated.",
  route: "/hr/checklists",
  client: onboardingApi.checklists,
  defaultSort: "-createdAt",
  columns: [
    { key: "employeeId", label: "Employee", render: (r) => <EmployeeLink id={r.employeeId} /> },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "startedAt", label: "Started", render: (r) => formatDate(r.startedAt) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "type", label: "Type", options: opts(["onboarding", "offboarding"]) },
    { key: "status", label: "Status", options: opts(["in_progress", "completed", "cancelled"]) },
  ],
  fields: [
    { key: "employeeId", label: "Employee", type: "reference", reference: employeeOptions, required: true, createOnly: true },
    { key: "type", label: "Type", type: "select", options: opts(["onboarding", "offboarding"]), required: true, createOnly: true },
    { key: "targetDate", label: "Target date", type: "date" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => `${humanize(r.type)} checklist`,
  subtitle: (r) => `Started ${formatDate(r.startedAt)}`,
  status: (r) => r.status,
  editable: (r) => r.status === "in_progress",
  actions: (r, refresh) => <CancelChecklist c={r} refresh={refresh} />,
  details: (r) => [
    { label: "Employee", value: <EmployeeLink id={r.employeeId} /> },
    { label: "Target date", value: r.targetDate ? formatDate(r.targetDate) : null },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <ChecklistExtra c={r} />,
};

export const ONBOARDING_SCREENS: Record<string, MasterConfig<never>> = {
  checklists: checklists as unknown as MasterConfig<never>,
};
