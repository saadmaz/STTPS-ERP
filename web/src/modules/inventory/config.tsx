"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Send, Trash2, Truck, PackageCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { StatusBadge } from "@/components/ui/kit";
import { productsApi } from "@/modules/products/config";

export interface Warehouse extends BaseRecord {
  code: string;
  name: string;
  type: string;
  branchId: string | null;
  allowNegative: boolean | null;
  isActive: boolean;
}
export interface DocLine {
  productId: string;
  qty: number;
  lotNo: string | null;
  expiryDate: string | null;
  serialNos: string[];
  unitCost: number | null;
}
interface Adjustment extends BaseRecord {
  number: string;
  warehouseId: string;
  reason: string;
  note: string | null;
  date: string;
  lines: DocLine[];
  status: string;
  estimatedValue: number;
  postedAt: string | null;
}
interface Transfer extends BaseRecord {
  number: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  date: string;
  note: string | null;
  lines: DocLine[];
  status: string;
}

export const inventoryApi = {
  warehouses: crud<Warehouse>("/inventory/warehouses"),
  adjustments: crud<Adjustment>("/inventory/adjustments"),
  transfers: crud<Transfer>("/inventory/transfers"),
  settings: () => api.get("/inventory/settings").then((r) => r.data as { allowNegative: boolean; adjustmentReasons: string[] }),
  action: (path: string) => api.post(path).then((r) => r.data),
};

export const qty = (thousandths: number) => String(thousandths / 1000);
const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const warehouseOptions = {
  queryKey: ["options", "inventory.warehouses"],
  load: async () => (await inventoryApi.warehouses.list({ limit: 200 })).items.filter((w) => w.isActive).map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` })),
};

export function useProductNames() {
  const { data } = useQuery({ queryKey: ["options", "products.items"], queryFn: () => productsApi.items.list({ limit: 200 }) });
  return (id: string) => {
    const p = data?.items.find((x) => x.id === id);
    return p ? `${p.name} (${p.sku})` : id;
  };
}

export function useWarehouseName() {
  const { data } = useQuery({ queryKey: warehouseOptions.queryKey, queryFn: warehouseOptions.load });
  return (id: string) => data?.find((w) => w.value === id)?.label ?? id;
}

function WarehouseLabel({ id }: { id: string }) {
  const name = useWarehouseName();
  return <>{name(id)}</>;
}

/** Editable list of document lines; values are decimal strings as the API expects. */
export function LinesEditor({ value, onChange, signed }: { value: LineForm[]; onChange: (v: LineForm[]) => void; signed: boolean }) {
  const products = useQuery({ queryKey: ["options", "products.items"], queryFn: () => productsApi.items.list({ limit: 200 }) });
  const set = (i: number, patch: Partial<LineForm>) => onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      {value.map((l, i) => {
        const p = products.data?.items.find((x) => x.id === l.productId);
        return (
          <div key={i} className="grid grid-cols-12 gap-2 items-start">
            <select className="input-base col-span-12 sm:col-span-5" value={l.productId} onChange={(e) => set(i, { productId: e.target.value })} aria-label="Product">
              <option value="">Product…</option>
              {(products.data?.items ?? []).filter((x) => x.type === "stock" || x.type === "manufactured").map((x) => <option key={x.id} value={x.id}>{x.name} ({x.sku})</option>)}
            </select>
            <input className="input-base col-span-4 sm:col-span-2" placeholder={signed ? "+/- qty" : "Qty"} value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label="Quantity" />
            {signed && <input className="input-base col-span-4 sm:col-span-2" placeholder="Unit cost" value={l.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} aria-label="Unit cost" />}
            {p?.trackLots && <input className="input-base col-span-4 sm:col-span-2" placeholder="Lot" value={l.lotNo} onChange={(e) => set(i, { lotNo: e.target.value })} aria-label="Lot" />}
            {p?.trackExpiry && <input className="input-base col-span-6 sm:col-span-3" type="date" value={l.expiryDate} onChange={(e) => set(i, { expiryDate: e.target.value })} aria-label="Expiry" />}
            {p?.trackSerials && <input className="input-base col-span-12 sm:col-span-5" placeholder="Serial numbers, comma separated" value={l.serials} onChange={(e) => set(i, { serials: e.target.value })} aria-label="Serial numbers" />}
            <button type="button" className="btn-ghost col-span-1" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 size={15} /></button>
          </div>
        );
      })}
      <button type="button" className="btn-ghost text-blue-600" onClick={() => onChange([...value, { productId: "", qty: "", unitCost: "", lotNo: "", expiryDate: "", serials: "" }])}>
        <Plus size={14} /> Line
      </button>
    </div>
  );
}

export interface LineForm {
  productId: string;
  qty: string;
  unitCost: string;
  lotNo: string;
  expiryDate: string;
  serials: string;
}

export const toLineBody = (lines: LineForm[]) =>
  lines
    .filter((l) => l.productId && l.qty)
    .map((l) => ({
      productId: l.productId,
      qty: l.qty,
      unitCost: l.unitCost || undefined,
      lotNo: l.lotNo || undefined,
      expiryDate: l.expiryDate || undefined,
      serialNos: l.serials ? l.serials.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    }));

function LinesTable({ lines, signed }: { lines: DocLine[]; signed?: boolean }) {
  const name = useProductNames();
  return (
    <section className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>Product</th><th>Qty</th><th>Lot</th><th>Expiry</th><th>Serials</th>{signed && <th>Unit cost</th>}</tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{name(l.productId)}</td>
              <td className={l.qty < 0 ? "text-red-600" : undefined}>{qty(l.qty)}</td>
              <td>{l.lotNo ?? "—"}</td>
              <td>{formatDate(l.expiryDate)}</td>
              <td>{l.serialNos.join(", ") || "—"}</td>
              {signed && <td>{l.unitCost === null ? "Average" : formatMoney(l.unitCost, "LKR")}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ActionButton({ label, icon: Icon, path, permission, refresh, danger }: { label: string; icon: React.ElementType; path: string; permission: string; refresh: (row: never) => void; danger?: boolean }) {
  const can = useCan(permission);
  const run = useMutation({
    mutationFn: () => inventoryApi.action(path),
    onSuccess: (row) => {
      refresh(row as never);
      toast.success(`${label}: done`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return (
    <button className={danger ? "btn-ghost" : "btn-primary"} onClick={() => run.mutate()} disabled={run.isPending}>
      <Icon size={15} /> {label}
    </button>
  );
}

const warehouses: MasterConfig<Warehouse> = {
  entityType: "inventory.warehouse",
  permission: "inventory.warehouse",
  plural: "Warehouses",
  singular: "Warehouse",
  route: "/inventory/warehouses",
  client: inventoryApi.warehouses,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code", sortable: true },
    { key: "name", label: "Name", sortable: true },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "allowNegative", label: "Negative stock", render: (r) => (r.allowNegative === null ? "Company policy" : r.allowNegative ? "Allowed" : "Blocked") },
    { key: "isActive", label: "Status", render: (r) => <StatusBadge status={r.isActive ? "active" : "inactive"} /> },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "type", label: "Type", type: "select", required: true, options: opts(["main", "store", "transit", "virtual"]) },
    { key: "isActive", label: "Active", type: "boolean" },
  ],
  defaults: { type: "main", isActive: true },
  title: (r) => r.name,
  subtitle: (r) => `${r.code} · ${humanize(r.type)}`,
  status: (r) => (r.isActive ? "active" : "inactive"),
  extra: (r) => <WarehouseStock warehouseId={r.id} />,
};

function WarehouseStock({ warehouseId }: { warehouseId: string }) {
  const name = useProductNames();
  const stock = useQuery({ queryKey: ["stock", warehouseId], queryFn: () => api.get("/inventory/stock", { params: { warehouseId } }).then((r) => r.data as Array<{ productId: string; lotNo: string | null; onHand: number; reserved: number; available: number }>) });
  return (
    <section className="card overflow-x-auto">
      <h3 className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm">Stock in this warehouse</h3>
      <table className="table-base">
        <thead><tr><th>Product</th><th>Lot</th><th>On hand</th><th>Reserved</th><th>Available</th></tr></thead>
        <tbody>
          {(stock.data ?? []).map((b) => (
            <tr key={`${b.productId}-${b.lotNo}`}>
              <td><Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/inventory/stock?product=${b.productId}`}>{name(b.productId)}</Link></td>
              <td>{b.lotNo ?? "—"}</td>
              <td>{qty(b.onHand)}</td>
              <td>{qty(b.reserved)}</td>
              <td>{qty(b.available)}</td>
            </tr>
          ))}
          {stock.data?.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500">No stock</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

const adjustments: MasterConfig<Adjustment> = {
  entityType: "inventory.adjustment",
  permission: "inventory.adjustment",
  plural: "Stock adjustments",
  singular: "Adjustment",
  description: "Add or remove stock with a reason. Large adjustments can require approval.",
  route: "/inventory/adjustments",
  client: inventoryApi.adjustments,
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "warehouseId", label: "Warehouse", render: (r) => <WarehouseLabel id={r.warehouseId} /> },
    { key: "reason", label: "Reason", render: (r) => humanize(r.reason) },
    { key: "lines", label: "Lines", render: (r) => r.lines.length, text: (r) => String(r.lines.length) },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "pending_approval", "posted", "rejected", "cancelled"]) }],
  fields: [],
  createHref: "/inventory/new/adjustment",
  title: (r) => r.number,
  subtitle: (r) => `${humanize(r.reason)} · ${formatDate(r.date)}`,
  status: (r) => r.status,
  editable: () => false,
  actions: (r, refresh) => (
    <>
      {(r.status === "draft" || r.status === "rejected") && <ActionButton label="Post" icon={Send} path={`/inventory/adjustments/${r.id}/submit`} permission="inventory.adjustment.create" refresh={refresh as never} />}
      {(r.status === "draft" || r.status === "rejected") && <ActionButton label="Cancel" icon={XCircle} path={`/inventory/adjustments/${r.id}/cancel`} permission="inventory.adjustment.edit" refresh={refresh as never} danger />}
    </>
  ),
  details: (r) => [
    { label: "Warehouse", value: <WarehouseLabel id={r.warehouseId} /> },
    { label: "Estimated value", value: r.estimatedValue ? formatMoney(r.estimatedValue, "LKR") : null },
    { label: "Posted", value: r.postedAt ? formatDateTime(r.postedAt) : null },
    { label: "Note", value: r.note },
  ],
  extra: (r) => <LinesTable lines={r.lines} signed />,
};

const transfers: MasterConfig<Transfer> = {
  entityType: "inventory.transfer",
  permission: "inventory.transfer",
  plural: "Stock transfers",
  singular: "Transfer",
  description: "Move stock between warehouses; it is in transit until received.",
  route: "/inventory/transfers",
  client: inventoryApi.transfers,
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "fromWarehouseId", label: "From", render: (r) => <WarehouseLabel id={r.fromWarehouseId} /> },
    { key: "toWarehouseId", label: "To", render: (r) => <WarehouseLabel id={r.toWarehouseId} /> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "in_transit", "received", "cancelled"]) }],
  fields: [],
  createHref: "/inventory/new/transfer",
  title: (r) => r.number,
  subtitle: (r) => formatDate(r.date),
  status: (r) => r.status,
  editable: () => false,
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && <ActionButton label="Ship" icon={Truck} path={`/inventory/transfers/${r.id}/ship`} permission="inventory.transfer.edit" refresh={refresh as never} />}
      {r.status === "in_transit" && <ActionButton label="Receive" icon={PackageCheck} path={`/inventory/transfers/${r.id}/receive`} permission="inventory.transfer.edit" refresh={refresh as never} />}
      {r.status === "draft" && <ActionButton label="Cancel" icon={XCircle} path={`/inventory/transfers/${r.id}/cancel`} permission="inventory.transfer.edit" refresh={refresh as never} danger />}
    </>
  ),
  details: (r) => [
    { label: "From", value: <WarehouseLabel id={r.fromWarehouseId} /> },
    { label: "To", value: <WarehouseLabel id={r.toWarehouseId} /> },
    { label: "Note", value: r.note },
  ],
  extra: (r) => <LinesTable lines={r.lines} />,
};

export const INVENTORY_SCREENS: Record<string, MasterConfig<never>> = {
  warehouses: warehouses as unknown as MasterConfig<never>,
  adjustments: adjustments as unknown as MasterConfig<never>,
  transfers: transfers as unknown as MasterConfig<never>,
};

export function useAdjustmentReasons() {
  return useQuery({ queryKey: ["inventory-settings"], queryFn: inventoryApi.settings });
}

