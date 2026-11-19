"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { useProductNames } from "@/modules/inventory/config";
import { productsApi } from "@/modules/products/config";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";

export const MACHINE_STATUSES = ["operational", "maintenance", "down"] as const;
export const BOM_STATUSES = ["draft", "active", "obsolete"] as const;
export const PRODUCTION_ORDER_STATUSES = ["planned", "released", "in_progress", "completed", "cancelled"] as const;

export interface WorkCentre extends BaseRecord {
  code: string; name: string; description: string | null; capacityHoursPerDay: number | null;
}
export interface Machine extends BaseRecord {
  code: string; name: string; workCentreId: string; status: (typeof MACHINE_STATUSES)[number];
}
export interface BomLine {
  componentProductId: string; qty: number; scrapPct: number; isAlternate: boolean; alternateGroup: string | null; laborMinutes: number;
}
export interface Bom extends BaseRecord {
  productId: string; revision: number; status: (typeof BOM_STATUSES)[number]; effectiveFrom: string; effectiveTo: string | null;
  lines: BomLine[]; notes: string | null;
}
export interface RoutingOperation {
  seq: number; name: string; workCentreId: string; setupMinutes: number; runMinutesPerUnit: number;
}
export interface Routing extends BaseRecord {
  productId: string; revision: number; status: (typeof BOM_STATUSES)[number]; operations: RoutingOperation[];
}
export interface ProductionMaterial { componentProductId: string; qtyRequired: number; qtyIssued: number }
export interface ProductionOperation {
  seq: number; name: string; workCentreId: string; machineId: string | null;
  status: "pending" | "in_progress" | "completed"; actualMinutes: number; downtimeMinutes: number;
}
export interface ProductionOrder extends BaseRecord {
  number: string; productId: string; bomId: string; routingId: string | null;
  qtyPlanned: number; qtyProduced: number; qtyScrapped: number; status: (typeof PRODUCTION_ORDER_STATUSES)[number];
  scheduledStart: string | null; scheduledEnd: string | null; actualStart: string | null; actualEnd: string | null;
  warehouseId: string | null; materials: ProductionMaterial[]; operations: ProductionOperation[]; notes: string | null;
}

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const qty = (n: number) => (n / 1000).toFixed(3).replace(/\.?0+$/, "") || "0";

export const manufacturingApi = {
  workCentres: crud<WorkCentre>("/manufacturing/work-centres"),
  machines: crud<Machine>("/manufacturing/machines"),
  boms: crud<Bom>("/manufacturing/boms"),
  routings: crud<Routing>("/manufacturing/routings"),
  productionOrders: crud<ProductionOrder>("/manufacturing/production-orders"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

const productOptions = {
  queryKey: ["options", "products.items"],
  load: async () => (await productsApi.items.list({ limit: 200 })).items.map((x) => ({ value: x.id, label: `${x.name} (${x.sku})` })),
};
const workCentreOptions = {
  queryKey: ["options", "manufacturing.workCentres"],
  load: async () => (await manufacturingApi.workCentres.list({ limit: 200 })).items.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` })),
};
const bomOptions = {
  queryKey: ["options", "manufacturing.boms"],
  load: async () => (await manufacturingApi.boms.list({ limit: 200 })).items.map((b) => ({ value: b.id, label: `${b.productId} v${b.revision} (${b.status})` })),
};
const routingOptions = {
  queryKey: ["options", "manufacturing.routings"],
  load: async () => (await manufacturingApi.routings.list({ limit: 200 })).items.map((r) => ({ value: r.id, label: `${r.productId} v${r.revision} (${r.status})` })),
};

function useWorkCentreName() {
  const { data } = useQuery({ queryKey: workCentreOptions.queryKey, queryFn: workCentreOptions.load });
  return (id: string) => data?.find((w) => w.value === id)?.label ?? id;
}
function ProductLabel({ id }: { id: string }) {
  const name = useProductNames();
  return <>{name(id)}</>;
}
function WorkCentreLabel({ id }: { id: string }) {
  const name = useWorkCentreName();
  return <>{name(id)}</>;
}

export const workCentres: MasterConfig<WorkCentre> = {
  entityType: "manufacturing.workCentre",
  permission: "manufacturing.workCentre",
  plural: "Work centres",
  singular: "Work centre",
  description: "A production area or line that machines and routing operations are assigned to.",
  route: "/manufacturing/work-centres",
  client: manufacturingApi.workCentres,
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "capacityHoursPerDay", label: "Capacity (h/day)", render: (r) => r.capacityHoursPerDay ?? "—" },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true, createOnly: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "capacityHoursPerDay", label: "Capacity (hours/day)", type: "number" },
    { key: "description", label: "Description", type: "textarea", wide: true },
  ],
  title: (r) => r.name,
  subtitle: (r) => r.code,
};

export const machines: MasterConfig<Machine> = {
  entityType: "manufacturing.machine",
  permission: "manufacturing.machine",
  plural: "Machines",
  singular: "Machine",
  route: "/manufacturing/machines",
  client: manufacturingApi.machines,
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "workCentreId", label: "Work centre", render: (r) => <WorkCentreLabel id={r.workCentreId} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(MACHINE_STATUSES) }],
  fields: [
    { key: "code", label: "Code", type: "text", required: true, createOnly: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "workCentreId", label: "Work centre", type: "reference", reference: workCentreOptions, required: true },
    { key: "status", label: "Status", type: "select", options: opts(MACHINE_STATUSES) },
  ],
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => r.status,
};

interface BomLineRow { componentProductId: string; qty: string; scrapPct: string; isAlternate: boolean; alternateGroup: string; laborMinutes: string }
const blankBomLine = (): BomLineRow => ({ componentProductId: "", qty: "1", scrapPct: "0", isAlternate: false, alternateGroup: "", laborMinutes: "0" });

function BomLinesEditor({ r }: { r: Bom }) {
  const canEdit = useCan("manufacturing.bom.edit");
  const [rows, setRows] = useState<BomLineRow[]>(
    r.lines.length
      ? r.lines.map((l) => ({
          componentProductId: l.componentProductId, qty: qty(l.qty), scrapPct: (l.scrapPct / 100).toString(),
          isAlternate: l.isAlternate, alternateGroup: l.alternateGroup ?? "", laborMinutes: String(l.laborMinutes),
        }))
      : [blankBomLine()],
  );
  const save = useMutation({
    mutationFn: () =>
      manufacturingApi.boms.update(
        r.id,
        {
          lines: rows
            .filter((row) => row.componentProductId)
            .map((row) => ({
              componentProductId: row.componentProductId, qty: Number(row.qty) || 0, scrapPct: Number(row.scrapPct) || 0,
              isAlternate: row.isAlternate, alternateGroup: row.alternateGroup || undefined, laborMinutes: Number(row.laborMinutes) || 0,
            })),
        },
        r.version,
      ),
    onSuccess: () => toast.success("Lines saved"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setRow = (i: number, patch: Partial<BomLineRow>) => setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  return (
    <section className="card p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Bill of materials lines</h2>
        {canEdit && (
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setRows((prev) => [...prev, blankBomLine()])}><Plus size={14} /> Add line</button>
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save lines</button>
          </div>
        )}
      </div>
      <table className="table-base">
        <thead><tr><th>Component product</th><th>Qty</th><th>Scrap %</th><th>Alternate</th><th>Alt. group</th><th>Labour min</th><th /></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td><input className="input-base" disabled={!canEdit} placeholder="Product id" value={row.componentProductId} onChange={(e) => setRow(i, { componentProductId: e.target.value })} /></td>
              <td><input className="input-base w-20" disabled={!canEdit} value={row.qty} onChange={(e) => setRow(i, { qty: e.target.value })} /></td>
              <td><input className="input-base w-20" disabled={!canEdit} value={row.scrapPct} onChange={(e) => setRow(i, { scrapPct: e.target.value })} /></td>
              <td><input type="checkbox" disabled={!canEdit} checked={row.isAlternate} onChange={(e) => setRow(i, { isAlternate: e.target.checked })} /></td>
              <td><input className="input-base w-24" disabled={!canEdit} value={row.alternateGroup} onChange={(e) => setRow(i, { alternateGroup: e.target.value })} /></td>
              <td><input className="input-base w-20" disabled={!canEdit} value={row.laborMinutes} onChange={(e) => setRow(i, { laborMinutes: e.target.value })} /></td>
              <td>{canEdit && <button className="btn-ghost" aria-label="Remove line" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mt-2">Product ids can be copied from the Products list. Qty is per one unit of the parent product.</p>
    </section>
  );
}

function BomActions({ r, refresh }: { r: Bom; refresh: (b: Bom) => void }) {
  const canEdit = useCan("manufacturing.bom.edit");
  const activate = useMutation({
    mutationFn: () => manufacturingApi.post<Bom>(`/manufacturing/boms/${r.id}/activate`),
    onSuccess: (b) => { toast.success("Activated"); refresh(b); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const obsolete = useMutation({
    mutationFn: () => manufacturingApi.post<Bom>(`/manufacturing/boms/${r.id}/obsolete`),
    onSuccess: (b) => { toast.success("Marked obsolete"); refresh(b); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit) return null;
  return (
    <>
      {r.status === "draft" && <button className="btn-primary" disabled={activate.isPending} onClick={() => activate.mutate()}>Activate</button>}
      {r.status === "active" && <button className="btn-ghost" disabled={obsolete.isPending} onClick={() => obsolete.mutate()}>Mark obsolete</button>}
    </>
  );
}

export const boms: MasterConfig<Bom> = {
  entityType: "manufacturing.bom",
  permission: "manufacturing.bom",
  plural: "Bills of materials",
  singular: "Bill of materials",
  description: "A versioned recipe of components for one product.",
  route: "/manufacturing/boms",
  client: manufacturingApi.boms,
  defaultSort: "-createdAt",
  columns: [
    { key: "productId", label: "Product", render: (r) => <ProductLabel id={r.productId} /> },
    { key: "revision", label: "Rev" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "effectiveFrom", label: "Effective from", render: (r) => formatDate(r.effectiveFrom) },
  ],
  filters: [{ key: "status", label: "Status", options: opts(BOM_STATUSES) }],
  fields: [
    { key: "productId", label: "Product", type: "reference", reference: productOptions, required: true, createOnly: true },
    { key: "effectiveFrom", label: "Effective from", type: "date", required: true },
    { key: "effectiveTo", label: "Effective to", type: "date" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  editable: (r) => r.status !== "obsolete",
  title: (r) => `${r.productId} rev. ${r.revision}`,
  subtitle: (r) => humanize(r.status),
  status: (r) => r.status,
  actions: (r, refresh) => <BomActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Revision", value: String(r.revision) },
    { label: "Effective to", value: r.effectiveTo ? formatDate(r.effectiveTo) : "Open-ended" },
    { label: "Lines", value: String(r.lines.length) },
  ],
  extra: (r) => <BomLinesEditor r={r} />,
};

interface RoutingOpRow { seq: string; name: string; workCentreId: string; setupMinutes: string; runMinutesPerUnit: string }
const blankRoutingOp = (nextSeq: number): RoutingOpRow => ({ seq: String(nextSeq), name: "", workCentreId: "", setupMinutes: "0", runMinutesPerUnit: "1" });

function RoutingOperationsEditor({ r }: { r: Routing }) {
  const canEdit = useCan("manufacturing.routing.edit");
  const [rows, setRows] = useState<RoutingOpRow[]>(
    r.operations.length
      ? r.operations.map((o) => ({ seq: String(o.seq), name: o.name, workCentreId: o.workCentreId, setupMinutes: String(o.setupMinutes), runMinutesPerUnit: String(o.runMinutesPerUnit) }))
      : [blankRoutingOp(1)],
  );
  const save = useMutation({
    mutationFn: () =>
      manufacturingApi.routings.update(
        r.id,
        {
          operations: rows
            .filter((row) => row.name && row.workCentreId)
            .map((row) => ({
              seq: Number(row.seq) || 1, name: row.name, workCentreId: row.workCentreId,
              setupMinutes: Number(row.setupMinutes) || 0, runMinutesPerUnit: Number(row.runMinutesPerUnit) || 0,
            })),
        },
        r.version,
      ),
    onSuccess: () => toast.success("Operations saved"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setRow = (i: number, patch: Partial<RoutingOpRow>) => setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  return (
    <section className="card p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Routing operations</h2>
        {canEdit && (
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setRows((prev) => [...prev, blankRoutingOp(prev.length + 1)])}><Plus size={14} /> Add operation</button>
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save operations</button>
          </div>
        )}
      </div>
      <table className="table-base">
        <thead><tr><th>Seq</th><th>Name</th><th>Work centre</th><th>Setup min</th><th>Run min/unit</th><th /></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td><input className="input-base w-14" disabled={!canEdit} value={row.seq} onChange={(e) => setRow(i, { seq: e.target.value })} /></td>
              <td><input className="input-base" disabled={!canEdit} value={row.name} onChange={(e) => setRow(i, { name: e.target.value })} /></td>
              <td><input className="input-base" disabled={!canEdit} placeholder="Work centre id" value={row.workCentreId} onChange={(e) => setRow(i, { workCentreId: e.target.value })} /></td>
              <td><input className="input-base w-20" disabled={!canEdit} value={row.setupMinutes} onChange={(e) => setRow(i, { setupMinutes: e.target.value })} /></td>
              <td><input className="input-base w-20" disabled={!canEdit} value={row.runMinutesPerUnit} onChange={(e) => setRow(i, { runMinutesPerUnit: e.target.value })} /></td>
              <td>{canEdit && <button className="btn-ghost" aria-label="Remove operation" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mt-2">Work centre ids can be copied from the Work centres list.</p>
    </section>
  );
}

function RoutingActions({ r, refresh }: { r: Routing; refresh: (rt: Routing) => void }) {
  const canEdit = useCan("manufacturing.routing.edit");
  const activate = useMutation({
    mutationFn: () => manufacturingApi.post<Routing>(`/manufacturing/routings/${r.id}/activate`),
    onSuccess: (rt) => { toast.success("Activated"); refresh(rt); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit || r.status !== "draft") return null;
  return <button className="btn-primary" disabled={activate.isPending} onClick={() => activate.mutate()}>Activate</button>;
}

export const routings: MasterConfig<Routing> = {
  entityType: "manufacturing.routing",
  permission: "manufacturing.routing",
  plural: "Routings",
  singular: "Routing",
  description: "A versioned sequence of operations for one product.",
  route: "/manufacturing/routings",
  client: manufacturingApi.routings,
  defaultSort: "-createdAt",
  columns: [
    { key: "productId", label: "Product", render: (r) => <ProductLabel id={r.productId} /> },
    { key: "revision", label: "Rev" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(BOM_STATUSES) }],
  fields: [
    { key: "productId", label: "Product", type: "reference", reference: productOptions, required: true, createOnly: true },
  ],
  editable: (r) => r.status !== "obsolete",
  title: (r) => `${r.productId} rev. ${r.revision}`,
  subtitle: (r) => humanize(r.status),
  status: (r) => r.status,
  actions: (r, refresh) => <RoutingActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Revision", value: String(r.revision) },
    { label: "Operations", value: String(r.operations.length) },
  ],
  extra: (r) => <RoutingOperationsEditor r={r} />,
};

function ProductionOrderActions({ r, refresh }: { r: ProductionOrder; refresh: (o: ProductionOrder) => void }) {
  const canEdit = useCan("manufacturing.productionOrder.edit");
  const release = useMutation({
    mutationFn: () => manufacturingApi.post<ProductionOrder>(`/manufacturing/production-orders/${r.id}/release`),
    onSuccess: (o) => { toast.success("Released"); refresh(o); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const start = useMutation({
    mutationFn: () => manufacturingApi.post<ProductionOrder>(`/manufacturing/production-orders/${r.id}/start`),
    onSuccess: (o) => { toast.success("Started"); refresh(o); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => manufacturingApi.post<ProductionOrder>(`/manufacturing/production-orders/${r.id}/cancel`),
    onSuccess: (o) => { toast.success("Cancelled"); refresh(o); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const [outputOpen, setOutputOpen] = useState(false);
  const [qtyGood, setQtyGood] = useState("");
  const [qtyScrap, setQtyScrap] = useState("");
  const recordOutput = useMutation({
    mutationFn: () => manufacturingApi.post<ProductionOrder>(`/manufacturing/production-orders/${r.id}/output`, { qtyGood, qtyScrap: qtyScrap || undefined }),
    onSuccess: (o) => { setOutputOpen(false); setQtyGood(""); setQtyScrap(""); toast.success("Output recorded"); refresh(o); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const [opOpen, setOpOpen] = useState(false);
  const [opSeq, setOpSeq] = useState("");
  const [opMinutes, setOpMinutes] = useState("");
  const completeOperation = useMutation({
    mutationFn: () => manufacturingApi.post<ProductionOrder>(`/manufacturing/production-orders/${r.id}/operations/complete`, { seq: Number(opSeq), actualMinutes: Number(opMinutes) }),
    onSuccess: (o) => { setOpOpen(false); setOpSeq(""); setOpMinutes(""); toast.success("Operation completed"); refresh(o); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const [downtimeOpen, setDowntimeOpen] = useState(false);
  const [dtSeq, setDtSeq] = useState("");
  const [dtMinutes, setDtMinutes] = useState("");
  const logDowntime = useMutation({
    mutationFn: () => manufacturingApi.post<ProductionOrder>(`/manufacturing/production-orders/${r.id}/downtime`, { seq: Number(dtSeq), minutes: Number(dtMinutes) }),
    onSuccess: (o) => { setDowntimeOpen(false); setDtSeq(""); setDtMinutes(""); toast.success("Downtime logged"); refresh(o); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!canEdit) return null;
  return (
    <>
      {r.status === "planned" && <button className="btn-primary" disabled={release.isPending} onClick={() => release.mutate()}>Release</button>}
      {r.status === "released" && <button className="btn-primary" disabled={start.isPending} onClick={() => start.mutate()}>Start</button>}
      {["released", "in_progress"].includes(r.status) && (
        <>
          <button className="btn-primary" onClick={() => setOutputOpen(true)}>Record output</button>
          <ConfirmDialog open={outputOpen} title="Record output" confirmLabel="Record" busy={recordOutput.isPending} onConfirm={() => recordOutput.mutate()} onClose={() => setOutputOpen(false)}>
            <div className="space-y-3">
              <Field label="Good quantity" required><input className="input-base" value={qtyGood} onChange={(e) => setQtyGood(e.target.value)} /></Field>
              <Field label="Scrap quantity"><input className="input-base" value={qtyScrap} onChange={(e) => setQtyScrap(e.target.value)} /></Field>
            </div>
          </ConfirmDialog>
          {r.operations.length > 0 && (
            <>
              <button className="btn-ghost" onClick={() => setOpOpen(true)}>Complete operation</button>
              <ConfirmDialog open={opOpen} title="Complete an operation" confirmLabel="Complete" busy={completeOperation.isPending} onConfirm={() => completeOperation.mutate()} onClose={() => setOpOpen(false)}>
                <div className="space-y-3">
                  <Field label="Operation seq" required><input className="input-base" value={opSeq} onChange={(e) => setOpSeq(e.target.value)} /></Field>
                  <Field label="Actual minutes" required><input className="input-base" value={opMinutes} onChange={(e) => setOpMinutes(e.target.value)} /></Field>
                </div>
              </ConfirmDialog>
              <button className="btn-ghost" onClick={() => setDowntimeOpen(true)}>Log downtime</button>
              <ConfirmDialog open={downtimeOpen} title="Log downtime" confirmLabel="Log" busy={logDowntime.isPending} onConfirm={() => logDowntime.mutate()} onClose={() => setDowntimeOpen(false)}>
                <div className="space-y-3">
                  <Field label="Operation seq" required><input className="input-base" value={dtSeq} onChange={(e) => setDtSeq(e.target.value)} /></Field>
                  <Field label="Minutes" required><input className="input-base" value={dtMinutes} onChange={(e) => setDtMinutes(e.target.value)} /></Field>
                </div>
              </ConfirmDialog>
            </>
          )}
        </>
      )}
      {["planned", "released", "in_progress"].includes(r.status) && <button className="btn-ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel</button>}
    </>
  );
}

function ProductionOrderExtra({ r }: { r: ProductionOrder }) {
  return (
    <div className="space-y-6">
      <section className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><p className="text-slate-500">Planned</p><p className="font-semibold">{qty(r.qtyPlanned)}</p></div>
        <div><p className="text-slate-500">Produced</p><p className="font-semibold">{qty(r.qtyProduced)}</p></div>
        <div><p className="text-slate-500">Scrapped</p><p className="font-semibold">{qty(r.qtyScrapped)}</p></div>
        <div><p className="text-slate-500">Warehouse</p><p className="font-semibold">{r.warehouseId ?? "—"}</p></div>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Materials</h2>
        <table className="table-base">
          <thead><tr><th>Component</th><th>Required</th><th>Issued</th></tr></thead>
          <tbody>
            {r.materials.map((m, i) => <tr key={i}><td><ProductLabel id={m.componentProductId} /></td><td>{qty(m.qtyRequired)}</td><td>{qty(m.qtyIssued)}</td></tr>)}
            {r.materials.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500 py-6">No materials on this order.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Operations</h2>
        <table className="table-base">
          <thead><tr><th>Seq</th><th>Name</th><th>Work centre</th><th>Status</th><th>Actual min</th><th>Downtime min</th></tr></thead>
          <tbody>
            {r.operations.map((o) => (
              <tr key={o.seq}>
                <td>{o.seq}</td><td>{o.name}</td><td><WorkCentreLabel id={o.workCentreId} /></td>
                <td><StatusBadge status={o.status} /></td><td>{o.actualMinutes}</td><td>{o.downtimeMinutes}</td>
              </tr>
            ))}
            {r.operations.length === 0 && <tr><td colSpan={6} className="text-center text-slate-500 py-6">No routing attached to this order.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export const productionOrders: MasterConfig<ProductionOrder> = {
  entityType: "manufacturing.productionOrder",
  permission: "manufacturing.productionOrder",
  plural: "Production orders",
  singular: "Production order",
  description: "One production run: materials consumed and output produced against a BOM and routing.",
  route: "/manufacturing/production-orders",
  client: manufacturingApi.productionOrders,
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "productId", label: "Product", render: (r) => <ProductLabel id={r.productId} /> },
    { key: "qtyPlanned", label: "Planned", render: (r) => qty(r.qtyPlanned) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(PRODUCTION_ORDER_STATUSES) },
  ],
  fields: [
    { key: "productId", label: "Product", type: "reference", reference: productOptions, required: true, createOnly: true },
    { key: "bomId", label: "Bill of materials (optional, resolves active one)", type: "reference", reference: bomOptions, createOnly: true },
    { key: "routingId", label: "Routing (optional, resolves active one)", type: "reference", reference: routingOptions, createOnly: true },
    { key: "qtyPlanned", label: "Quantity planned", type: "number", required: true, createOnly: true },
    { key: "scheduledStart", label: "Scheduled start", type: "date" },
    { key: "scheduledEnd", label: "Scheduled end", type: "date" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  editable: (r) => r.status === "planned",
  title: (r) => r.number,
  subtitle: (r) => `${qty(r.qtyPlanned)} planned`,
  status: (r) => r.status,
  actions: (r, refresh) => <ProductionOrderActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Scheduled start", value: r.scheduledStart ? formatDate(r.scheduledStart) : null },
    { label: "Scheduled end", value: r.scheduledEnd ? formatDate(r.scheduledEnd) : null },
    { label: "Actual start", value: r.actualStart },
    { label: "Actual end", value: r.actualEnd },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <ProductionOrderExtra r={r} />,
};

export const MANUFACTURING_SCREENS: Record<string, MasterConfig<never>> = {
  "work-centres": workCentres as unknown as MasterConfig<never>,
  machines: machines as unknown as MasterConfig<never>,
  boms: boms as unknown as MasterConfig<never>,
  routings: routings as unknown as MasterConfig<never>,
  "production-orders": productionOrders as unknown as MasterConfig<never>,
};
