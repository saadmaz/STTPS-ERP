"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDateTime, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { warehouseOptions } from "@/modules/inventory/config";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";

export const SHIFT_STATUSES = ["open", "closed"] as const;
export const SALE_STATUSES = ["completed", "partially_refunded", "refunded", "voided"] as const;
export const PAYMENT_METHODS = ["cash", "card", "qr"] as const;

export interface Terminal extends BaseRecord {
  code: string; name: string; warehouseId: string; branchId: string | null; isActive: boolean;
}
export interface CashierShift extends BaseRecord {
  terminalId: string; cashierId: string; status: (typeof SHIFT_STATUSES)[number]; openedAt: string; openingCash: number;
  closedAt: string | null; closingCash: number | null; expectedCash: number | null; variance: number | null; notes: string | null;
}
export interface PosSaleLine {
  lineId: string; productId: string; description: string; qty: number; unitPrice: number; discountPct: number; taxCode: string | null; taxRate: number; net: number; tax: number; total: number;
}
export interface PosPayment { method: (typeof PAYMENT_METHODS)[number]; amount: number }
export interface PosSale extends BaseRecord {
  number: string; shiftId: string; terminalId: string; warehouseId: string; accountId: string | null; currency: string;
  lines: PosSaleLine[]; totals: { subtotal: number; discount: number; tax: number; total: number }; payments: PosPayment[];
  status: (typeof SALE_STATUSES)[number]; loyaltyPointsEarned: number; loyaltyPointsRedeemed: number; notes: string | null;
}

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const posApi = {
  terminals: crud<Terminal>("/pos/terminals"),
  shifts: crud<CashierShift>("/pos/shifts"),
  sales: crud<PosSale>("/pos/sales"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

export const openShiftOptions = {
  queryKey: ["options", "pos.shifts.open"],
  load: async () => (await posApi.shifts.list({ limit: 50, where: "status:open" })).items.map((s) => ({ value: s.id, label: `Shift ${s.id.slice(0, 6)} (${s.terminalId})` })),
};

export const terminals: MasterConfig<Terminal> = {
  entityType: "pos.terminal",
  permission: "pos.terminal",
  plural: "Terminals",
  singular: "Terminal",
  route: "/pos/terminals",
  client: posApi.terminals,
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "warehouseId", label: "Warehouse" },
    { key: "isActive", label: "Active", render: (r) => (r.isActive ? "Yes" : "—") },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true, createOnly: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "warehouseId", label: "Warehouse", type: "reference", reference: warehouseOptions, required: true },
    { key: "isActive", label: "Active", type: "boolean" },
  ],
  title: (r) => r.name,
  subtitle: (r) => r.code,
};

function CloseShiftDialog({ r, refresh }: { r: CashierShift; refresh: (s: CashierShift) => void }) {
  const [open, setOpen] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");
  const close = useMutation({
    mutationFn: () => posApi.post<CashierShift>(`/pos/shifts/${r.id}/close`, { closingCash, notes: notes || undefined }),
    onSuccess: (s) => { setOpen(false); toast.success("Shift closed"); refresh(s); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Close shift</button>
      <ConfirmDialog open={open} title="Close this shift" confirmLabel="Close" busy={close.isPending} onConfirm={() => close.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Cash counted" required><input className="input-base" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="48500" /></Field>
          <Field label="Notes"><textarea className="input-base" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

export const shifts: MasterConfig<CashierShift> = {
  entityType: "pos.cashierShift",
  permission: "pos.cashierShift",
  plural: "Cashier shifts",
  singular: "Cashier shift",
  description: "Open with a starting float, close by counting cash against sales for the shift.",
  route: "/pos/shifts",
  client: posApi.shifts,
  defaultSort: "-createdAt",
  columns: [
    { key: "terminalId", label: "Terminal" },
    { key: "openedAt", label: "Opened", render: (r) => formatDateTime(r.openedAt) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "variance", label: "Variance", render: (r) => (r.variance != null ? formatMoney(r.variance, "LKR") : "—") },
  ],
  filters: [{ key: "status", label: "Status", options: opts(SHIFT_STATUSES) }],
  fields: [
    { key: "terminalId", label: "Terminal id", type: "text", required: true, createOnly: true },
    { key: "openingCash", label: "Opening cash", type: "text", required: true, createOnly: true },
  ],
  editable: () => false,
  title: (r) => `Shift · ${formatDateTime(r.openedAt)}`,
  subtitle: (r) => r.terminalId,
  status: (r) => r.status,
  actions: (r, refresh) => (r.status === "open" ? <CloseShiftDialog r={r} refresh={refresh} /> : null),
  details: (r) => [
    { label: "Cashier", value: r.cashierId },
    { label: "Opening cash", value: formatMoney(r.openingCash, "LKR") },
    { label: "Closing cash", value: r.closingCash != null ? formatMoney(r.closingCash, "LKR") : null },
    { label: "Expected cash", value: r.expectedCash != null ? formatMoney(r.expectedCash, "LKR") : null },
    { label: "Variance", value: r.variance != null ? formatMoney(r.variance, "LKR") : null },
    { label: "Notes", value: r.notes },
  ],
};

function RefundDialog({ r, refresh }: { r: PosSale; refresh: (s: PosSale) => void }) {
  const [open, setOpen] = useState(false);
  const [lineId, setLineId] = useState(r.lines[0]?.lineId ?? "");
  const [qty, setQty] = useState("1");
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("cash");
  const refund = useMutation({
    mutationFn: () => posApi.post<PosSale>(`/pos/sales/${r.id}/refund`, { lines: [{ lineId, qty }], method }),
    onSuccess: (s) => { setOpen(false); toast.success("Refunded"); refresh(s); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>Refund</button>
      <ConfirmDialog open={open} title="Refund a line" confirmLabel="Refund" busy={refund.isPending} onConfirm={() => refund.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Line">
            <select className="input-base" value={lineId} onChange={(e) => setLineId(e.target.value)}>
              {r.lines.map((l) => <option key={l.lineId} value={l.lineId}>{l.description} ({(l.qty / 1000).toFixed(2)})</option>)}
            </select>
          </Field>
          <Field label="Quantity to refund"><input className="input-base" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Refund via">
            <select className="input-base" value={method} onChange={(e) => setMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
            </select>
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function SaleActions({ r, refresh }: { r: PosSale; refresh: (s: PosSale) => void }) {
  const canEdit = useCan("pos.sale.edit");
  const void_ = useMutation({
    mutationFn: () => posApi.post<PosSale>(`/pos/sales/${r.id}/void`),
    onSuccess: (s) => { toast.success("Voided"); refresh(s); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit || !["completed", "partially_refunded"].includes(r.status)) return null;
  return (
    <>
      <RefundDialog r={r} refresh={refresh} />
      {r.status === "completed" && <button className="btn-ghost" disabled={void_.isPending} onClick={() => void_.mutate()}>Void</button>}
    </>
  );
}

function SaleExtra({ r }: { r: PosSale }) {
  return (
    <div className="space-y-6">
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Lines</h2>
        <table className="table-base">
          <thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Tax</th><th>Total</th></tr></thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.lineId}><td>{l.description}</td><td>{(l.qty / 1000).toFixed(2)}</td><td>{formatMoney(l.unitPrice, r.currency)}</td><td>{formatMoney(l.tax, r.currency)}</td><td>{formatMoney(l.total, r.currency)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><p className="text-slate-500">Subtotal</p><p className="font-semibold">{formatMoney(r.totals.subtotal, r.currency)}</p></div>
        <div><p className="text-slate-500">Tax</p><p className="font-semibold">{formatMoney(r.totals.tax, r.currency)}</p></div>
        <div><p className="text-slate-500">Total</p><p className="font-semibold">{formatMoney(r.totals.total, r.currency)}</p></div>
        <div><p className="text-slate-500">Points earned / redeemed</p><p className="font-semibold">{r.loyaltyPointsEarned} / {r.loyaltyPointsRedeemed}</p></div>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Payments</h2>
        <table className="table-base">
          <thead><tr><th>Method</th><th>Amount</th></tr></thead>
          <tbody>{r.payments.map((p, i) => <tr key={i}><td>{humanize(p.method)}</td><td>{formatMoney(p.amount, r.currency)}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}

export const sales: MasterConfig<PosSale> = {
  entityType: "pos.sale",
  permission: "pos.sale",
  plural: "Sales",
  singular: "Sale",
  description: "A register transaction; ring up a new one from the Register page.",
  route: "/pos/sales",
  client: posApi.sales,
  defaultSort: "-createdAt",
  createHref: "/pos/register",
  columns: [
    { key: "number", label: "Number" },
    { key: "totals", label: "Total", render: (r) => formatMoney(r.totals.total, r.currency) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(SALE_STATUSES) }],
  fields: [],
  editable: () => false,
  title: (r) => r.number,
  subtitle: (r) => formatMoney(r.totals.total, r.currency),
  status: (r) => r.status,
  actions: (r, refresh) => <SaleActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Shift", value: r.shiftId },
    { label: "Customer", value: r.accountId },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <SaleExtra r={r} />,
};

export const POS_SCREENS: Record<string, MasterConfig<never>> = {
  terminals: terminals as unknown as MasterConfig<never>,
  shifts: shifts as unknown as MasterConfig<never>,
  sales: sales as unknown as MasterConfig<never>,
};
