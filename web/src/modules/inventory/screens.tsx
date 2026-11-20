"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, errorMessage, Page } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { Drawer, EmptyState, ErrorState, Field, PageHeader, Spinner, StatusBadge, Tabs } from "@/components/ui/kit";
import {
  INVENTORY_SCREENS,
  inventoryApi,
  LineForm,
  LinesEditor,
  qty,
  toLineBody,
  useAdjustmentReasons,
  useProductNames,
  useWarehouseName,
  warehouseOptions,
} from "./config";

export function InventoryList({ entity }: { entity: string }) {
  const config = INVENTORY_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function InventoryRecord({ entity, id }: { entity: string; id: string }) {
  const config = INVENTORY_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}

function WarehouseSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { data = [] } = useQuery({ queryKey: warehouseOptions.queryKey, queryFn: warehouseOptions.load });
  return (
    <Field label={label} required>
      <select className="input-base" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {data.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
      </select>
    </Field>
  );
}

/** New adjustment or transfer with a line editor. */
export function NewStockDocument({ kind }: { kind: string }) {
  const router = useRouter();
  const reasons = useAdjustmentReasons();
  const [warehouseId, setWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineForm[]>([{ productId: "", qty: "", unitCost: "", lotNo: "", expiryDate: "", serials: "" }]);
  if (kind !== "adjustment" && kind !== "transfer") notFound();
  const isAdj = kind === "adjustment";
  const save = useMutation({
    mutationFn: (): Promise<{ id: string; number: string }> =>
      isAdj
        ? inventoryApi.adjustments.create({ warehouseId, reason, note: note || undefined, lines: toLineBody(lines) })
        : inventoryApi.transfers.create({ fromWarehouseId: warehouseId, toWarehouseId, note: note || undefined, lines: toLineBody(lines).map(({ unitCost: _u, ...l }) => l) }),
    onSuccess: (doc) => {
      toast.success(`${doc.number} saved as draft`);
      router.push(`/inventory/${isAdj ? "adjustments" : "transfers"}/${doc.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form
      className="max-w-4xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <PageHeader title={isAdj ? "New stock adjustment" : "New stock transfer"} subtitle="Saved as a draft; post it from the next page." />
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <WarehouseSelect label={isAdj ? "Warehouse" : "From warehouse"} value={warehouseId} onChange={setWarehouseId} />
        {isAdj ? (
          <Field label="Reason" required>
            <select className="input-base" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose…</option>
              {(reasons.data?.adjustmentReasons ?? []).map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
            </select>
          </Field>
        ) : (
          <WarehouseSelect label="To warehouse" value={toWarehouseId} onChange={setToWarehouseId} />
        )}
        <div className="sm:col-span-2">
          <Field label="Note"><input className="input-base" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </section>
      <section className="card p-5">
        <h2 className="font-semibold mb-1">Lines</h2>
        {isAdj && <p className="text-xs text-slate-500 mb-3">Positive quantities add stock, negative remove it. Leave the cost blank to use the current average.</p>}
        <LinesEditor value={lines} onChange={setLines} signed={isAdj} />
      </section>
      <div className="flex justify-end gap-2">
        <Link href={`/inventory/${isAdj ? "adjustments" : "transfers"}`} className="btn-secondary">Cancel</Link>
        <button className="btn-primary" disabled={save.isPending || !warehouseId || (isAdj ? !reason : !toWarehouseId)}>Save draft</button>
      </div>
    </form>
  );
}

interface Summary {
  productId: string;
  onHand: number;
  reserved: number;
  available: number;
  inTransit: number;
  value: number;
  avgCost: number;
  reorderPoint: number;
  suggestedQty?: number;
  lastIssueAt: string | null;
}
interface Balance {
  productId: string;
  warehouseId: string;
  lotNo: string | null;
  expiryDate: string | null;
  onHand: number;
}
interface Movement extends BaseRecord {
  number: string;
  type: string;
  productId: string;
  warehouseId: string;
  qty: number;
  value: number;
  currency: string;
  postedAt: string;
  reference: { entityType: string; entityId: string; label: string } | null;
}

type StockTab = "valuation" | "reorder" | "expiring" | "ledger";

/** Stock position, value, reorder needs, expiring lots and the ledger. */
export function StockOverview() {
  const [tab, setTab] = useState<StockTab>("valuation");
  const canValue = useCan("inventory.valuation.view");
  const product = useProductNames();
  const warehouse = useWarehouseName();
  const valuation = useQuery({ queryKey: ["inv", "valuation"], queryFn: () => api.get("/inventory/reports/valuation").then((r) => r.data as { items: Summary[]; totalValue: number }), enabled: tab === "valuation" && canValue });
  const reorder = useQuery({ queryKey: ["inv", "reorder"], queryFn: () => api.get("/inventory/reports/reorder").then((r) => r.data as Summary[]), enabled: tab === "reorder" });
  const expiring = useQuery({ queryKey: ["inv", "expiring"], queryFn: () => api.get("/inventory/reports/expiring", { params: { days: 60 } }).then((r) => r.data as Balance[]), enabled: tab === "expiring" });
  const ledger = useQuery({ queryKey: ["inv", "ledger"], queryFn: () => api.get("/inventory/movements", { params: { limit: 100 } }).then((r) => r.data as Page<Movement>), enabled: tab === "ledger" });

  const body = () => {
    const q = { valuation, reorder, expiring, ledger }[tab];
    if (tab === "valuation" && !canValue) return <EmptyState title="You can see quantities but not values" />;
    if (q.isLoading) return <Spinner />;
    if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
    if (tab === "valuation") {
      const d = valuation.data!;
      return (
        <div className="card overflow-x-auto">
          <p className="px-5 py-3 text-sm border-b border-slate-200 dark:border-slate-800">Total stock value: <span className="font-semibold">{formatMoney(d.totalValue, "LKR")}</span></p>
          <table className="table-base">
            <thead><tr><th>Product</th><th>On hand</th><th>Reserved</th><th>Available</th><th>In transit</th><th>Avg cost</th><th>Value</th></tr></thead>
            <tbody>
              {d.items.map((s) => (
                <tr key={s.productId}>
                  <td>{product(s.productId)}</td><td>{qty(s.onHand)}</td><td>{qty(s.reserved)}</td><td>{qty(s.available)}</td><td>{qty(s.inTransit)}</td>
                  <td>{formatMoney(s.avgCost, "LKR")}</td><td>{formatMoney(s.value, "LKR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (tab === "reorder") {
      if (reorder.data!.length === 0) return <EmptyState title="Nothing below its reorder point" />;
      return (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Product</th><th>Available</th><th>Reorder point</th><th>Suggested order</th></tr></thead>
            <tbody>{reorder.data!.map((s) => <tr key={s.productId}><td>{product(s.productId)}</td><td>{qty(s.available)}</td><td>{qty(s.reorderPoint)}</td><td>{qty(s.suggestedQty ?? 0)}</td></tr>)}</tbody>
          </table>
        </div>
      );
    }
    if (tab === "expiring") {
      if (expiring.data!.length === 0) return <EmptyState title="Nothing expires in the next 60 days" />;
      return (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Product</th><th>Warehouse</th><th>Lot</th><th>Expiry</th><th>On hand</th></tr></thead>
            <tbody>{expiring.data!.map((b) => <tr key={`${b.productId}-${b.warehouseId}-${b.lotNo}`}><td>{product(b.productId)}</td><td>{warehouse(b.warehouseId)}</td><td>{b.lotNo ?? "—"}</td><td>{formatDate(b.expiryDate)}</td><td>{qty(b.onHand)}</td></tr>)}</tbody>
          </table>
        </div>
      );
    }
    return (
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Number</th><th>When</th><th>Type</th><th>Product</th><th>Warehouse</th><th>Qty</th>{canValue && <th>Value</th>}<th>Source</th></tr></thead>
          <tbody>
            {ledger.data!.items.map((m) => (
              <tr key={m.id}>
                <td>{m.number}</td><td>{formatDateTime(m.postedAt)}</td><td>{humanize(m.type)}</td><td>{product(m.productId)}</td><td>{warehouse(m.warehouseId)}</td>
                <td className={m.qty < 0 ? "text-red-600" : "text-green-700"}>{qty(m.qty)}</td>
                {canValue && <td>{formatMoney(m.value, m.currency)}</td>}
                <td>{m.reference?.label ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Stock" subtitle="Positions, value and the stock ledger" />
      <Tabs<StockTab>
        tabs={[{ key: "valuation", label: "Stock & value" }, { key: "reorder", label: "Reorder" }, { key: "expiring", label: "Expiring" }, { key: "ledger", label: "Ledger" }]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-4">{body()}</div>
    </div>
  );
}

interface Count extends BaseRecord {
  number: string;
  warehouseId: string;
  status: string;
  lines: { productId: string; lotNo: string | null; expected: number; counted: number | null }[];
  startedAt: string;
  postedAt: string | null;
}

export function CountsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const canCreate = useCan("inventory.count.create");
  const warehouse = useWarehouseName();
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const counts = useQuery({ queryKey: ["counts"], queryFn: () => api.get("/inventory/counts", { params: { limit: 100 } }).then((r) => r.data as Page<Count>) });
  const start = useMutation({
    mutationFn: () => api.post("/inventory/counts", { warehouseId }).then((r) => r.data as Count),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ["counts"] });
      router.push(`/inventory/counts/${c.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <PageHeader title="Stock counts" subtitle="A warehouse is locked from the start of its count until it is posted." actions={canCreate && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Start count</button>} />
      {counts.isLoading ? <Spinner /> : counts.data!.items.length === 0 ? <EmptyState title="No counts yet" /> : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Number</th><th>Warehouse</th><th>Started</th><th>Lines</th><th>Status</th></tr></thead>
            <tbody>
              {counts.data!.items.map((c) => (
                <tr key={c.id}>
                  <td><Link className="font-medium text-blue-700 dark:text-blue-400 hover:underline" href={`/inventory/counts/${c.id}`}>{c.number}</Link></td>
                  <td>{warehouse(c.warehouseId)}</td><td>{formatDateTime(c.startedAt)}</td><td>{c.lines.length}</td><td><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Drawer open={open} title="Start a stock count" onClose={() => setOpen(false)} footer={<button className="btn-primary" disabled={!warehouseId || start.isPending} onClick={() => start.mutate()}>Start</button>}>
        <WarehouseSelect label="Warehouse" value={warehouseId} onChange={setWarehouseId} />
      </Drawer>
    </div>
  );
}

export function CountRecord({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const product = useProductNames();
  const warehouse = useWarehouseName();
  const canEdit = useCan("inventory.count.edit");
  const canPost = useCan("inventory.count.approve");
  const count = useQuery({ queryKey: ["count", id], queryFn: () => api.get(`/inventory/counts/${id}`).then((r) => r.data as Count) });
  const [entries, setEntries] = useState<Record<string, string>>({});
  const set = (row: Count) => queryClient.setQueryData(["count", id], row);
  const save = useMutation({
    mutationFn: () => api.put(`/inventory/counts/${id}/entries`, { entries: Object.entries(entries).filter(([, v]) => v !== "").map(([k, v]) => { const [productId, lotNo] = k.split("|"); return { productId, lotNo: lotNo || undefined, counted: v }; }) }).then((r) => r.data as Count),
    onSuccess: (row) => { set(row); setEntries({}); toast.success("Counts saved"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const post = useMutation({ mutationFn: () => api.post(`/inventory/counts/${id}/post`).then((r) => r.data as Count), onSuccess: (row) => { set(row); toast.success("Differences posted; warehouse unlocked"); }, onError: (e) => toast.error(errorMessage(e)) });
  const cancel = useMutation({ mutationFn: () => api.post(`/inventory/counts/${id}/cancel`).then((r) => r.data as Count), onSuccess: set, onError: (e) => toast.error(errorMessage(e)) });
  if (count.isLoading) return <Spinner />;
  if (count.isError) return <ErrorState message={errorMessage(count.error)} />;
  const c = count.data!;
  const open = c.status === "counting";
  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/inventory/counts" className="text-sm text-slate-500 hover:text-slate-800">← Stock counts</Link>
      <PageHeader
        title={c.number}
        subtitle={`${warehouse(c.warehouseId)} · started ${formatDateTime(c.startedAt)}`}
        actions={<>
          <StatusBadge status={c.status} />
          {open && canEdit && <button className="btn-secondary" disabled={save.isPending || Object.keys(entries).length === 0} onClick={() => save.mutate()}>Save counts</button>}
          {open && canPost && <button className="btn-primary" disabled={post.isPending} onClick={() => post.mutate()}><CheckCircle2 size={15} /> Post differences</button>}
          {open && canEdit && <button className="btn-ghost" onClick={() => cancel.mutate()}><XCircle size={15} /> Cancel</button>}
        </>}
      />
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Product</th><th>Lot</th><th>Expected</th><th>Counted</th><th>Difference</th></tr></thead>
          <tbody>
            {c.lines.map((l) => {
              const key = `${l.productId}|${l.lotNo ?? ""}`;
              const counted = l.counted === null ? null : l.counted;
              const diff = counted === null ? null : counted - l.expected;
              return (
                <tr key={key}>
                  <td>{product(l.productId)}</td>
                  <td>{l.lotNo ?? "—"}</td>
                  <td>{qty(l.expected)}</td>
                  <td>
                    {open && canEdit ? (
                      <input className="input-base w-28 py-1" placeholder={counted === null ? "" : qty(counted)} value={entries[key] ?? ""} onChange={(e) => setEntries({ ...entries, [key]: e.target.value })} aria-label={`Counted for ${product(l.productId)}`} />
                    ) : counted === null ? "—" : qty(counted)}
                  </td>
                  <td className={diff ? (diff < 0 ? "text-red-600" : "text-green-700") : undefined}>{diff === null ? "—" : qty(diff)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
