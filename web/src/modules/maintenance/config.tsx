"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";

export interface MaintenancePlan extends BaseRecord {
  assetId: string; name: string; frequency: "daily" | "weekly" | "monthly" | "custom"; intervalDays: number;
  lastDoneDate: string | null; nextDueDate: string; checklistTemplate: string[]; active: boolean; notes: string | null;
}
export interface WorkOrder extends BaseRecord {
  code: string; assetId: string; planId: string | null; type: "preventive" | "corrective" | "predictive" | "emergency"; title: string; description: string | null;
  priority: "low" | "medium" | "high" | "urgent"; status: "requested" | "scheduled" | "in_progress" | "completed" | "cancelled";
  assignedTo: string | null; scheduledDate: string | null; downtimeMinutes: number;
  parts: { productId: string; qty: number; unitCost: number | null; totalCost: number }[];
  laborHours: number; laborCost: number; partsCost: number; totalCost: number;
  checklist: { itemId: string; text: string; done: boolean }[]; notes: string | null;
}

const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const maintenanceApi = {
  plans: crud<MaintenancePlan>("/maintenance/plans"),
  workOrders: crud<WorkOrder>("/maintenance/work-orders"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

function GenerateWorkOrder({ plan }: { plan: MaintenancePlan }) {
  const can = useCan("maintenance.workOrder.create");
  const run = useMutation({
    mutationFn: () => maintenanceApi.post<WorkOrder>(`/maintenance/plans/${plan.id}/generate-work-order`),
    onSuccess: (wo) => toast.success(`Created ${wo.code}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || !plan.active) return null;
  return <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate()}>Generate work order</button>;
}

export const plans: MasterConfig<MaintenancePlan> = {
  entityType: "maintenance.plan",
  permission: "maintenance.plan",
  plural: "Maintenance plans",
  singular: "Maintenance plan",
  description: "A recurring preventive schedule for one asset.",
  route: "/maintenance/plans",
  client: maintenanceApi.plans,
  defaultSort: "nextDueDate",
  columns: [
    { key: "name", label: "Name" },
    { key: "frequency", label: "Frequency", render: (r) => humanize(r.frequency) },
    { key: "nextDueDate", label: "Next due", render: (r) => formatDate(r.nextDueDate) },
    { key: "active", label: "Active", render: (r) => (r.active ? "Yes" : "—") },
  ],
  fields: [
    { key: "assetId", label: "Asset id", type: "text", required: true, createOnly: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "frequency", label: "Frequency", type: "select", options: opts(["daily", "weekly", "monthly", "custom"]), required: true, createOnly: true },
    { key: "intervalDays", label: "Interval (days, for custom)", type: "number", createOnly: true },
    { key: "nextDueDate", label: "Next due date", type: "date", required: true, createOnly: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => r.name,
  subtitle: (r) => `Due ${formatDate(r.nextDueDate)}`,
  actions: (r) => <GenerateWorkOrder plan={r} />,
  details: (r) => [
    { label: "Last done", value: r.lastDoneDate ? formatDate(r.lastDoneDate) : null },
    { label: "Checklist", value: r.checklistTemplate.join(", ") || null },
  ],
};

function WorkOrderActions({ r, refresh }: { r: WorkOrder; refresh: (w: WorkOrder) => void }) {
  const can = useCan("maintenance.workOrder.edit");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const assign = useMutation({
    mutationFn: () => maintenanceApi.post<WorkOrder>(`/maintenance/work-orders/${r.id}/assign`, { assignedTo }),
    onSuccess: (w) => { setAssignOpen(false); toast.success("Assigned"); refresh(w); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const start = useMutation({
    mutationFn: () => maintenanceApi.post<WorkOrder>(`/maintenance/work-orders/${r.id}/start`),
    onSuccess: (w) => { toast.success("Started"); refresh(w); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [completeOpen, setCompleteOpen] = useState(false);
  const [downtime, setDowntime] = useState("");
  const complete = useMutation({
    mutationFn: () => maintenanceApi.post<WorkOrder>(`/maintenance/work-orders/${r.id}/complete`, { downtimeMinutes: downtime ? Number(downtime) : undefined }),
    onSuccess: (w) => { setCompleteOpen(false); toast.success("Completed"); refresh(w); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => maintenanceApi.post<WorkOrder>(`/maintenance/work-orders/${r.id}/cancel`),
    onSuccess: (w) => { toast.success("Cancelled"); refresh(w); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return (
    <>
      {["requested", "scheduled"].includes(r.status) && (
        <>
          <button className="btn-ghost" onClick={() => setAssignOpen(true)}>Assign</button>
          <ConfirmDialog open={assignOpen} title="Assign a technician" confirmLabel="Assign" busy={assign.isPending} onConfirm={() => assign.mutate()} onClose={() => setAssignOpen(false)}>
            <Field label="Technician (user id)" required><input className="input-base" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} /></Field>
          </ConfirmDialog>
          <button className="btn-ghost" disabled={start.isPending} onClick={() => start.mutate()}>Start</button>
        </>
      )}
      {["requested", "scheduled", "in_progress"].includes(r.status) && (
        <>
          <button className="btn-primary" onClick={() => setCompleteOpen(true)}>Complete</button>
          <ConfirmDialog open={completeOpen} title="Complete this work order" confirmLabel="Complete" busy={complete.isPending} onConfirm={() => complete.mutate()} onClose={() => setCompleteOpen(false)}>
            <Field label="Downtime (minutes)"><input className="input-base" value={downtime} onChange={(e) => setDowntime(e.target.value)} /></Field>
          </ConfirmDialog>
          <button className="btn-ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel</button>
        </>
      )}
    </>
  );
}

function AddPart({ wo, refresh }: { wo: WorkOrder; refresh: (w: WorkOrder) => void }) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const run = useMutation({
    mutationFn: () => maintenanceApi.post<WorkOrder>(`/maintenance/work-orders/${wo.id}/parts`, { productId, qty, unitCost: unitCost || undefined }),
    onSuccess: (w) => { setOpen(false); setProductId(""); setUnitCost(""); toast.success("Part added"); refresh(w); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>Add part</button>
      <ConfirmDialog open={open} title="Add a part used" confirmLabel="Add" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Product id" required><input className="input-base" value={productId} onChange={(e) => setProductId(e.target.value)} /></Field>
          <Field label="Quantity"><input className="input-base" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Unit cost"><input className="input-base" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="1500.00" /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function LogLabor({ wo, refresh }: { wo: WorkOrder; refresh: (w: WorkOrder) => void }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState("1");
  const [hourlyCost, setHourlyCost] = useState("");
  const run = useMutation({
    mutationFn: () => maintenanceApi.post<WorkOrder>(`/maintenance/work-orders/${wo.id}/labor`, { hours, hourlyCost: hourlyCost || undefined }),
    onSuccess: (w) => { setOpen(false); setHourlyCost(""); toast.success("Labour logged"); refresh(w); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>Log labour</button>
      <ConfirmDialog open={open} title="Log labour" confirmLabel="Save" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Hours"><input className="input-base" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
          <Field label="Hourly rate"><input className="input-base" value={hourlyCost} onChange={(e) => setHourlyCost(e.target.value)} placeholder="2000.00" /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function WorkOrderExtra({ r }: { r: WorkOrder }) {
  const [current, setCurrent] = useState(r);
  return (
    <div className="space-y-6">
      <section className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><p className="text-slate-500">Parts</p><p className="font-semibold">{formatMoney(current.partsCost, "LKR")}</p></div>
        <div><p className="text-slate-500">Labour</p><p className="font-semibold">{formatMoney(current.laborCost, "LKR")} ({(current.laborHours / 1000).toFixed(1)}h)</p></div>
        <div><p className="text-slate-500">Total cost</p><p className="font-semibold">{formatMoney(current.totalCost, "LKR")}</p></div>
        <div><p className="text-slate-500">Downtime</p><p className="font-semibold">{current.downtimeMinutes}m</p></div>
      </section>
      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4"><h2 className="font-semibold">Parts used</h2><AddPart wo={current} refresh={setCurrent} /></div>
        <table className="table-base">
          <thead><tr><th>Product</th><th>Qty</th><th>Cost</th></tr></thead>
          <tbody>
            {current.parts.map((p, i) => <tr key={i}><td>{p.productId}</td><td>{(p.qty / 1000).toFixed(2)}</td><td>{formatMoney(p.totalCost, "LKR")}</td></tr>)}
            {current.parts.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500 py-6">No parts recorded yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="card p-4">
        <div className="flex items-center justify-between mb-2"><h2 className="font-semibold">Labour</h2><LogLabor wo={current} refresh={setCurrent} /></div>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Checklist</h2>
        <table className="table-base">
          <tbody>{current.checklist.map((c) => <tr key={c.itemId}><td>{c.text}</td><td><StatusBadge status={c.done ? "completed" : "pending"} /></td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}

export const workOrders: MasterConfig<WorkOrder> = {
  entityType: "maintenance.workOrder",
  permission: "maintenance.workOrder",
  plural: "Work orders",
  singular: "Work order",
  description: "One maintenance event: trigger, technician, parts and labour, completion.",
  route: "/maintenance/work-orders",
  client: maintenanceApi.workOrders,
  defaultSort: "-createdAt",
  columns: [
    { key: "code", label: "Code" },
    { key: "title", label: "Title" },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(["requested", "scheduled", "in_progress", "completed", "cancelled"]) },
    { key: "type", label: "Type", options: opts(["preventive", "corrective", "predictive", "emergency"]) },
  ],
  fields: [
    { key: "assetId", label: "Asset id", type: "text", required: true, createOnly: true },
    { key: "title", label: "Title", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: opts(["preventive", "corrective", "predictive", "emergency"]) },
    { key: "priority", label: "Priority", type: "select", options: opts(["low", "medium", "high", "urgent"]) },
    { key: "scheduledDate", label: "Scheduled date", type: "date" },
    { key: "description", label: "Description", type: "textarea", wide: true },
  ],
  defaults: { type: "corrective", priority: "medium" },
  title: (r) => r.title,
  subtitle: (r) => r.code,
  status: (r) => r.status,
  editable: (r) => !["completed", "cancelled"].includes(r.status),
  actions: (r, refresh) => <WorkOrderActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Assigned to", value: r.assignedTo },
    { label: "Scheduled", value: r.scheduledDate ? formatDate(r.scheduledDate) : null },
    { label: "Total cost", value: formatMoney(r.totalCost, "LKR") },
  ],
  extra: (r) => <WorkOrderExtra r={r} />,
};

export const MAINTENANCE_SCREENS: Record<string, MasterConfig<never>> = {
  plans: plans as unknown as MasterConfig<never>,
  "work-orders": workOrders as unknown as MasterConfig<never>,
};
