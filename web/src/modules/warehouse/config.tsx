"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDateTime, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { useProductNames, warehouseOptions } from "@/modules/inventory/config";
import { productsApi } from "@/modules/products/config";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";

export const TASK_TYPES = ["putaway", "pick", "count"] as const;
export const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
export const PICKING_STRATEGIES = ["fifo", "fefo", "zone"] as const;

export interface PutAwayRule extends BaseRecord {
  warehouseId: string; productId: string | null; categoryId: string | null; targetLocationId: string; priority: number;
}
export interface WarehouseTask extends BaseRecord {
  number: string; type: (typeof TASK_TYPES)[number]; status: (typeof TASK_STATUSES)[number]; warehouseId: string; locationId: string | null;
  productId: string; qty: number; assignedTo: string | null; reference: { entityType: string; entityId: string; label: string } | null;
  startedAt: string | null; completedAt: string | null; notes: string | null;
}
export interface PickSuggestion {
  productId: string; warehouseId: string; strategy: string; qtyRequested: number; qtyAllocated: number; shortfall: number;
  lines: { lotNo: string | null; expiryDate: string | null; qty: number }[]; locationId: string | null;
}

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const qty = (n: number) => (n / 1000).toFixed(3).replace(/\.?0+$/, "") || "0";

export const warehouseApi = {
  putAwayRules: crud<PutAwayRule>("/warehouse/put-away-rules"),
  tasks: crud<WarehouseTask>("/warehouse/tasks"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

const productOptions = {
  queryKey: ["options", "products.items"],
  load: async () => (await productsApi.items.list({ limit: 200 })).items.map((x) => ({ value: x.id, label: `${x.name} (${x.sku})` })),
};

function ProductLabel({ id }: { id: string }) {
  const name = useProductNames();
  return <>{name(id)}</>;
}

export const putAwayRules: MasterConfig<PutAwayRule> = {
  entityType: "warehouse.putAwayRule",
  permission: "warehouse.putAwayRule",
  plural: "Put-away rules",
  singular: "Put-away rule",
  description: "Where to place a received product by default; the most specific match wins.",
  route: "/warehouse/put-away-rules",
  client: warehouseApi.putAwayRules,
  columns: [
    { key: "warehouseId", label: "Warehouse" },
    { key: "productId", label: "Product", render: (r) => (r.productId ? <ProductLabel id={r.productId} /> : "Any product") },
    { key: "targetLocationId", label: "Target location" },
    { key: "priority", label: "Priority" },
  ],
  fields: [
    { key: "warehouseId", label: "Warehouse", type: "reference", reference: warehouseOptions, required: true },
    { key: "productId", label: "Product (optional)", type: "reference", reference: productOptions },
    { key: "targetLocationId", label: "Target location id", type: "text", required: true, hint: "Copy a location id from the warehouse's locations list" },
    { key: "priority", label: "Priority (ties only)", type: "number" },
  ],
  title: (r) => `${r.warehouseId} → ${r.targetLocationId}`,
  subtitle: (r) => (r.productId ? "Product rule" : "Default rule"),
};

function TaskActions({ r, refresh }: { r: WarehouseTask; refresh: (t: WarehouseTask) => void }) {
  const canEdit = useCan("warehouse.task.edit");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const assign = useMutation({
    mutationFn: () => warehouseApi.post<WarehouseTask>(`/warehouse/tasks/${r.id}/assign`, { assignedTo }),
    onSuccess: (t) => { setAssignOpen(false); toast.success("Assigned"); refresh(t); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const start = useMutation({
    mutationFn: () => warehouseApi.post<WarehouseTask>(`/warehouse/tasks/${r.id}/start`),
    onSuccess: (t) => { toast.success("Started"); refresh(t); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [completeOpen, setCompleteOpen] = useState(false);
  const [locationId, setLocationId] = useState(r.locationId ?? "");
  const complete = useMutation({
    mutationFn: () => warehouseApi.post<WarehouseTask>(`/warehouse/tasks/${r.id}/complete`, { locationId: locationId || undefined }),
    onSuccess: (t) => { setCompleteOpen(false); toast.success("Completed"); refresh(t); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => warehouseApi.post<WarehouseTask>(`/warehouse/tasks/${r.id}/cancel`),
    onSuccess: (t) => { toast.success("Cancelled"); refresh(t); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit || !["pending", "in_progress"].includes(r.status)) return null;
  return (
    <>
      {r.status === "pending" && (
        <>
          <button className="btn-ghost" onClick={() => setAssignOpen(true)}>Assign</button>
          <ConfirmDialog open={assignOpen} title="Assign this task" confirmLabel="Assign" busy={assign.isPending} onConfirm={() => assign.mutate()} onClose={() => setAssignOpen(false)}>
            <Field label="User id" required><input className="input-base" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} /></Field>
          </ConfirmDialog>
          <button className="btn-ghost" disabled={start.isPending} onClick={() => start.mutate()}>Start</button>
        </>
      )}
      <button className="btn-primary" onClick={() => setCompleteOpen(true)}>Complete</button>
      <ConfirmDialog open={completeOpen} title="Complete this task" confirmLabel="Complete" busy={complete.isPending} onConfirm={() => complete.mutate()} onClose={() => setCompleteOpen(false)}>
        <Field label="Location id"><input className="input-base" value={locationId} onChange={(e) => setLocationId(e.target.value)} /></Field>
      </ConfirmDialog>
      <button className="btn-ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel</button>
    </>
  );
}

export const tasks: MasterConfig<WarehouseTask> = {
  entityType: "warehouse.task",
  permission: "warehouse.task",
  plural: "Warehouse tasks",
  singular: "Warehouse task",
  description: "A put-away, pick or count job; scan its number on the Scan page to pull it up on a handheld device.",
  route: "/warehouse/tasks",
  client: warehouseApi.tasks,
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "productId", label: "Product", render: (r) => <ProductLabel id={r.productId} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(TASK_STATUSES) },
    { key: "type", label: "Type", options: opts(TASK_TYPES) },
  ],
  fields: [
    { key: "type", label: "Type", type: "select", options: opts(TASK_TYPES), required: true, createOnly: true },
    { key: "warehouseId", label: "Warehouse", type: "reference", reference: warehouseOptions, required: true, createOnly: true },
    { key: "locationId", label: "Location id (optional)", type: "text", createOnly: true },
    { key: "productId", label: "Product", type: "reference", reference: productOptions, required: true, createOnly: true },
    { key: "qty", label: "Quantity", type: "number", required: true, createOnly: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true, createOnly: true },
  ],
  editable: () => false,
  title: (r) => r.number,
  subtitle: (r) => humanize(r.type),
  status: (r) => r.status,
  actions: (r, refresh) => <TaskActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Quantity", value: qty(r.qty) },
    { label: "Location", value: r.locationId },
    { label: "Assigned to", value: r.assignedTo },
    { label: "Started", value: r.startedAt ? formatDateTime(r.startedAt) : null },
    { label: "Completed", value: r.completedAt ? formatDateTime(r.completedAt) : null },
    { label: "Reference", value: r.reference?.label ?? null },
    { label: "Notes", value: r.notes },
  ],
};

export function ScanPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const scan = useMutation({
    mutationFn: () => warehouseApi.post<WarehouseTask>("/warehouse/tasks/scan", { code }),
    onSuccess: (t) => { setCode(""); router.push(`/warehouse/tasks/${t.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Scan" subtitle="Scan or type a task's code to pull it up." />
      <section className="card p-5 max-w-sm space-y-4">
        <Field label="Task code">
          <input
            autoFocus
            className="input-base"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && code.trim()) scan.mutate(); }}
            placeholder="WT-2026-000123"
          />
        </Field>
        <button className="btn-primary" disabled={!code.trim() || scan.isPending} onClick={() => scan.mutate()}>
          {scan.isPending && <Spinner size={14} className="text-white" />} Go
        </button>
      </section>
    </div>
  );
}

function PickingSuggestion({ s }: { s: PickSuggestion }) {
  return (
    <section className="card p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium"><ProductLabel id={s.productId} /></span>
        <span className={s.shortfall > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
          {qty(s.qtyAllocated)} of {qty(s.qtyRequested)} allocated{s.shortfall > 0 ? ` · short ${qty(s.shortfall)}` : ""}
        </span>
      </div>
      {s.locationId && <p className="text-xs text-slate-500">Suggested location: {s.locationId}</p>}
      <table className="table-base">
        <thead><tr><th>Lot</th><th>Expiry</th><th>Qty</th></tr></thead>
        <tbody>
          {s.lines.map((l, i) => <tr key={i}><td>{l.lotNo ?? "—"}</td><td>{l.expiryDate ?? "—"}</td><td>{qty(l.qty)}</td></tr>)}
          {s.lines.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500 py-4">No available stock.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

export function PickingPage() {
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [qtyInput, setQtyInput] = useState("1");
  const [strategy, setStrategy] = useState<(typeof PICKING_STRATEGIES)[number]>("fifo");
  const suggest = useMutation({
    mutationFn: () => warehouseApi.post<PickSuggestion>("/warehouse/picking/suggest", { productId, warehouseId, qty: Number(qtyInput), strategy }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const [deliveryIdsInput, setDeliveryIdsInput] = useState("");
  const wave = useMutation({
    mutationFn: () => warehouseApi.post<{ deliveryIds: string[]; picks: PickSuggestion[] }>("/warehouse/picking/wave", {
      deliveryIds: deliveryIdsInput.split(",").map((s) => s.trim()).filter(Boolean), strategy,
    }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Picking" subtitle="Suggests which lots to pick under a FIFO, FEFO or zone strategy, for one line or a combined wave across several deliveries." />
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Suggest a pick</h2>
        <div className="grid sm:grid-cols-4 gap-4">
          <Field label="Product id"><input className="input-base" value={productId} onChange={(e) => setProductId(e.target.value)} /></Field>
          <Field label="Warehouse id"><input className="input-base" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} /></Field>
          <Field label="Quantity"><input className="input-base" value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} /></Field>
          <Field label="Strategy">
            <select className="input-base" value={strategy} onChange={(e) => setStrategy(e.target.value as (typeof PICKING_STRATEGIES)[number])}>
              {PICKING_STRATEGIES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </select>
          </Field>
        </div>
        <button className="btn-primary" disabled={!productId || !warehouseId || suggest.isPending} onClick={() => suggest.mutate()}>Suggest</button>
        {suggest.data && <PickingSuggestion s={suggest.data} />}
      </section>
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Wave pick (combine several deliveries)</h2>
        <Field label="Delivery ids (comma-separated)"><input className="input-base" value={deliveryIdsInput} onChange={(e) => setDeliveryIdsInput(e.target.value)} /></Field>
        <button className="btn-primary" disabled={!deliveryIdsInput.trim() || wave.isPending} onClick={() => wave.mutate()}>Build wave pick list</button>
        {wave.data && <div className="space-y-3">{wave.data.picks.map((s, i) => <PickingSuggestion key={i} s={s} />)}</div>}
      </section>
    </div>
  );
}

export const WAREHOUSE_SCREENS: Record<string, MasterConfig<never>> = {
  "put-away-rules": putAwayRules as unknown as MasterConfig<never>,
  tasks: tasks as unknown as MasterConfig<never>,
};
