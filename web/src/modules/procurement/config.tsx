"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, FileCheck, Mail, PackageCheck, PackagePlus, PencilLine, RotateCcw, Truck } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { StatusBadge } from "@/components/ui/kit";
import { useProductNames, useWarehouseName } from "@/modules/inventory/config";
import { Action } from "@/modules/sales/config";

export interface Supplier extends BaseRecord {
  code: string;
  name: string;
  category: string | null;
  status: "active" | "on_hold" | "blocked";
  email: string | null;
  phone: string | null;
  taxId: string | null;
  currency: string;
  paymentTermsDays: number;
  preferred: boolean;
  leadTimeDays: number | null;
  performanceScore: number | null;
  receiptsCount: number;
  onTimeCount: number;
  acceptedQty: number;
  receivedQty: number;
  bank: { bankName: string | null; accountName: string | null; accountNo: string | null; branch: string | null; swift: string | null } | null;
  notes: string | null;
}
export interface ReqLine {
  lineId: string;
  productId: string | null;
  description: string;
  qty: number;
  uom: string;
  estimatedPrice: number;
  suggestedSupplierId: string | null;
}
export interface Requisition extends BaseRecord {
  number: string;
  requesterId: string;
  departmentId: string | null;
  requiredDate: string | null;
  justification: string | null;
  currency: string;
  lines: ReqLine[];
  estimatedTotal: number;
  status: string;
  orderIds: string[];
}
export interface Rfq extends BaseRecord {
  number: string;
  requisitionId: string | null;
  lines: ReqLine[];
  supplierIds: string[];
  quotes: { supplierId: string; receivedAt: string; prices: Record<string, number>; leadTimeDays: number | null; notes: string | null }[];
  dueDate: string | null;
  status: string;
  awardedSupplierId: string | null;
  awardReason: string | null;
  orderId: string | null;
}
export interface PurchaseLine {
  lineId: string;
  productId: string;
  description: string;
  qty: number;
  unitPrice: number;
  taxCode: string | null;
  taxRate: number;
  net: number;
  tax: number;
  total: number;
  received: number;
  rejected: number;
  returned: number;
  stocked: boolean;
}
export interface PurchaseOrder extends BaseRecord {
  number: string;
  supplierId: string;
  requisitionId: string | null;
  rfqId: string | null;
  currency: string;
  date: string;
  expectedDate: string | null;
  warehouseId: string;
  paymentTermsDays: number;
  lines: PurchaseLine[];
  totals: { subtotal: number; tax: number; total: number };
  status: string;
  amendment: number;
  supplierConfirmedAt: string | null;
  supplierReference: string | null;
  cancelReason: string | null;
  notes: string | null;
}
export interface GoodsReceipt extends BaseRecord {
  number: string;
  orderId: string;
  supplierId: string;
  warehouseId: string;
  date: string;
  supplierDeliveryNote: string | null;
  lines: { orderLineId: string; productId: string; received: number; accepted: number; rejected: number; rejectReason: string | null; lotNo: string | null; unitCost?: number }[];
  status: string;
  postedAt: string | null;
  notes: string | null;
}
interface SupplierReturn extends BaseRecord {
  number: string;
  receiptId: string;
  orderId: string;
  supplierId: string;
  reason: string;
  lines: { receiptLineIndex: number; productId: string; qty: number }[];
  status: string;
  shippedAt: string | null;
}

export const procurementApi = {
  suppliers: crud<Supplier>("/procurement/suppliers"),
  requisitions: crud<Requisition>("/procurement/requisitions"),
  rfqs: crud<Rfq>("/procurement/rfqs"),
  orders: crud<PurchaseOrder>("/procurement/orders"),
  receipts: crud<GoodsReceipt>("/procurement/receipts"),
  returns: crud<SupplierReturn>("/procurement/returns"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

const qty = (n: number) => String(n / 1000);
const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const linkCls = "text-blue-700 dark:text-blue-400 hover:underline";

export function useSupplierName() {
  const { data } = useQuery({ queryKey: ["options", "procurement.suppliers"], queryFn: () => procurementApi.suppliers.list({ limit: 200, sort: "nameLower" }) });
  return (id: string | null) => (id ? data?.items.find((s) => s.id === id)?.name ?? "…" : "—");
}

function SupplierLink({ id }: { id: string }) {
  const name = useSupplierName();
  return <Link className={linkCls} href={`/procurement/suppliers/${id}`}>{name(id)}</Link>;
}

function WarehouseName({ id }: { id: string }) {
  const name = useWarehouseName();
  return <>{name(id)}</>;
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

const suppliers: MasterConfig<Supplier> = {
  entityType: "procurement.supplier",
  permission: "procurement.supplier",
  plural: "Suppliers",
  singular: "Supplier",
  route: "/procurement/suppliers",
  client: procurementApi.suppliers,
  defaultSort: "nameLower",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "category", label: "Category" },
    { key: "performanceScore", label: "Score", render: (r) => (r.performanceScore === null ? "—" : `${r.performanceScore}`) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["active", "on_hold", "blocked"]) }],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "code", label: "Code", type: "text", placeholder: "Automatic", createOnly: true },
    { key: "category", label: "Category", type: "text" },
    { key: "status", label: "Status", type: "select", options: opts(["active", "on_hold", "blocked"]) },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "taxId", label: "Tax ID / VAT number", type: "text" },
    { key: "currency", label: "Currency", type: "text", placeholder: "LKR" },
    { key: "paymentTermsDays", label: "Payment terms (days)", type: "number" },
    { key: "leadTimeDays", label: "Lead time (days)", type: "number" },
    { key: "preferred", label: "Preferred supplier", type: "boolean" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  defaults: { status: "active", currency: "LKR", paymentTermsDays: 30 },
  title: (r) => r.name,
  subtitle: (r) => `${r.code}${r.category ? ` · ${r.category}` : ""}`,
  status: (r) => r.status,
  details: (r) => [
    { label: "Email", value: r.email },
    { label: "Phone", value: r.phone },
    { label: "Tax ID", value: r.taxId },
    { label: "Terms", value: `${r.paymentTermsDays} days · ${r.currency}` },
    { label: "Lead time", value: r.leadTimeDays !== null ? `${r.leadTimeDays} days` : null },
    { label: "Performance", value: r.receiptsCount ? `${r.performanceScore}/100 · ${r.onTimeCount} of ${r.receiptsCount} receipts on time · ${Math.round((r.acceptedQty / Math.max(1, r.receivedQty)) * 100)}% accepted` : "No receipts yet" },
    { label: "Bank", value: r.bank?.bankName ? `${r.bank.bankName} ${r.bank.branch ?? ""} · ${r.bank.accountName ?? ""} ${r.bank.accountNo ?? ""}` : null },
    { label: "Notes", value: r.notes },
  ],
};

// ─── Requisitions ─────────────────────────────────────────────────────────────

function RequisitionLines({ r }: { r: Requisition }) {
  const name = useProductNames();
  const supplier = useSupplierName();
  return (
    <section className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>Item</th><th>Qty</th><th>Est. price</th><th>Suggested supplier</th><th className="text-right">Est. total</th></tr></thead>
        <tbody>
          {r.lines.map((l) => (
            <tr key={l.lineId}>
              <td><div>{l.description}</div>{l.productId && <div className="text-xs text-slate-500">{name(l.productId)}</div>}</td>
              <td>{qty(l.qty)} {l.uom}</td>
              <td>{formatMoney(l.estimatedPrice, r.currency)}</td>
              <td>{supplier(l.suggestedSupplierId)}</td>
              <td className="text-right">{formatMoney(Math.round((l.qty * l.estimatedPrice) / 1000), r.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-4 text-right text-sm font-semibold">Estimated total {formatMoney(r.estimatedTotal, r.currency)}</p>
    </section>
  );
}

const requisitions: MasterConfig<Requisition> = {
  entityType: "procurement.requisition",
  permission: "procurement.requisition",
  plural: "Requisitions",
  singular: "Requisition",
  route: "/procurement/requisitions",
  client: procurementApi.requisitions,
  defaultSort: "-createdAt",
  createHref: "/procurement/new/requisition",
  columns: [
    { key: "number", label: "Number" },
    { key: "justification", label: "Purpose" },
    { key: "requiredDate", label: "Needed by", render: (r) => formatDate(r.requiredDate) },
    { key: "estimatedTotal", label: "Estimate", render: (r) => formatMoney(r.estimatedTotal, r.currency), text: (r) => String(r.estimatedTotal / 100) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "pending_approval", "approved", "rejected", "ordered", "cancelled"]) }],
  fields: [
    { key: "justification", label: "Purpose", type: "textarea", wide: true },
    { key: "requiredDate", label: "Needed by", type: "date" },
  ],
  title: (r) => r.number,
  subtitle: (r) => `${formatMoney(r.estimatedTotal, r.currency)}${r.requiredDate ? ` · needed by ${formatDate(r.requiredDate)}` : ""}`,
  status: (r) => r.status,
  editable: (r) => ["draft", "rejected"].includes(r.status),
  actions: (r, refresh) => (
    <>
      {["draft", "rejected"].includes(r.status) && <Action<Requisition> label="Submit" icon={FileCheck} path={`/procurement/requisitions/${r.id}/submit`} permission="procurement.requisition.edit" onDone={refresh} />}
      {r.status === "approved" && <Link className="btn-primary" href={`/procurement/new/rfq?requisition=${r.id}`}><Mail size={15} /> Request quotes</Link>}
      {r.status === "approved" && <Link className="btn-ghost" href={`/procurement/new/order?requisition=${r.id}`}><PackagePlus size={15} /> Order directly</Link>}
      {["draft", "rejected", "approved"].includes(r.status) && <Action<Requisition> label="Cancel" icon={Ban} path={`/procurement/requisitions/${r.id}/cancel`} permission="procurement.requisition.edit" onDone={refresh} danger confirm="Cancel this requisition?" />}
    </>
  ),
  details: (r) => [
    { label: "Purpose", value: r.justification },
    { label: "Needed by", value: formatDate(r.requiredDate) },
    { label: "Orders", value: r.orderIds.length ? <span className="flex gap-2">{r.orderIds.map((id, i) => <Link key={id} className={linkCls} href={`/procurement/orders/${id}`}>Order {i + 1}</Link>)}</span> : null },
  ],
  extra: (r) => <RequisitionLines r={r} />,
};

// ─── RFQs ─────────────────────────────────────────────────────────────────────

interface Comparison {
  supplierId: string;
  complete: boolean;
  total: number;
  leadTimeDays: number | null;
  lines: { lineId: string; description: string; unitPrice: number | null }[];
}

function RfqComparison({ r }: { r: Rfq }) {
  const supplier = useSupplierName();
  const cmp = useQuery({ queryKey: ["procurement.rfq", "compare", r.id, r.version], queryFn: () => api.get(`/procurement/rfqs/${r.id}/compare`).then((x) => x.data as Comparison[]) });
  const rows = cmp.data ?? [];
  return (
    <section className="card overflow-x-auto">
      <h2 className="px-4 pt-4 font-semibold">Quote comparison</h2>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">No quotes yet. Invited: {r.supplierIds.map((s) => supplier(s)).join(", ")}</p>
      ) : (
        <table className="table-base">
          <thead>
            <tr><th>Item</th><th>Qty</th>{rows.map((c) => <th key={c.supplierId}>{supplier(c.supplierId)}{r.awardedSupplierId === c.supplierId ? " ✓" : ""}</th>)}</tr>
          </thead>
          <tbody>
            {r.lines.map((l) => {
              const prices = rows.map((c) => c.lines.find((x) => x.lineId === l.lineId)?.unitPrice ?? null);
              const best = Math.min(...prices.filter((p): p is number => p !== null));
              return (
                <tr key={l.lineId}>
                  <td>{l.description}</td><td>{qty(l.qty)}</td>
                  {prices.map((p, i) => <td key={i} className={p === best ? "font-semibold text-emerald-700 dark:text-emerald-400" : ""}>{p === null ? "—" : formatMoney(p, "LKR")}</td>)}
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td>Total</td><td />
              {rows.map((c) => <td key={c.supplierId}>{formatMoney(c.total, "LKR")}{c.complete ? "" : " (partial)"}</td>)}
            </tr>
            <tr className="text-xs text-slate-500">
              <td>Lead time</td><td />
              {rows.map((c) => <td key={c.supplierId}>{c.leadTimeDays !== null ? `${c.leadTimeDays} days` : "—"}</td>)}
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

const rfqs: MasterConfig<Rfq> = {
  entityType: "procurement.rfq",
  permission: "procurement.rfq",
  plural: "Requests for quotation",
  singular: "RFQ",
  route: "/procurement/rfqs",
  client: procurementApi.rfqs,
  defaultSort: "-createdAt",
  createHref: "/procurement/new/rfq",
  columns: [
    { key: "number", label: "Number" },
    { key: "supplierIds", label: "Invited", render: (r) => `${r.supplierIds.length} suppliers` },
    { key: "quotes", label: "Quotes", render: (r) => String(r.quotes.length) },
    { key: "dueDate", label: "Due", render: (r) => formatDate(r.dueDate) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["open", "awarded", "cancelled"]) }],
  fields: [{ key: "dueDate", label: "Quotes due", type: "date" }],
  title: (r) => r.number,
  subtitle: (r) => `${r.quotes.length} of ${r.supplierIds.length} quoted${r.dueDate ? ` · due ${formatDate(r.dueDate)}` : ""}`,
  status: (r) => r.status,
  editable: (r) => r.status === "open",
  actions: (r) => (
    <>
      {r.status === "open" && <Link className="btn-primary" href={`/procurement/rfq/${r.id}/quote`}><PencilLine size={15} /> Record quote / award</Link>}
    </>
  ),
  details: (r) => [
    { label: "Requisition", value: r.requisitionId ? <Link className={linkCls} href={`/procurement/requisitions/${r.requisitionId}`}>Open requisition</Link> : null },
    { label: "Awarded to", value: r.awardedSupplierId ? <SupplierLink id={r.awardedSupplierId} /> : null },
    { label: "Award reason", value: r.awardReason },
    { label: "Order", value: r.orderId ? <Link className={linkCls} href={`/procurement/orders/${r.orderId}`}>Open order</Link> : null },
  ],
  extra: (r) => <RfqComparison r={r} />,
};

// ─── Purchase orders ──────────────────────────────────────────────────────────

function PurchaseLines({ o }: { o: PurchaseOrder }) {
  const name = useProductNames();
  const showReceipt = !["draft", "pending_approval"].includes(o.status);
  return (
    <section className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Item</th><th>Qty</th><th>Price</th><th>Tax</th><th className="text-right">Total</th>
            {showReceipt && <><th>Received</th><th>Rejected</th><th>Returned</th></>}
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l) => (
            <tr key={l.lineId}>
              <td><div>{l.description}</div><div className="text-xs text-slate-500">{name(l.productId)}</div></td>
              <td>{qty(l.qty)}</td>
              <td>{formatMoney(l.unitPrice, o.currency)}</td>
              <td>{l.taxCode ? `${l.taxCode} ${l.taxRate / 100}%` : "—"}</td>
              <td className="text-right">{formatMoney(l.total, o.currency)}</td>
              {showReceipt && <><td>{qty(l.received)}</td><td>{qty(l.rejected)}</td><td>{qty(l.returned)}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto w-full max-w-xs p-4 space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(o.totals.subtotal, o.currency)}</dd></div>
        <div className="flex justify-between"><dt>Tax</dt><dd>{formatMoney(o.totals.tax, o.currency)}</dd></div>
        <div className="flex justify-between font-semibold border-t border-slate-200 dark:border-slate-800 pt-1"><dt>Total</dt><dd>{formatMoney(o.totals.total, o.currency)}</dd></div>
      </dl>
    </section>
  );
}

function AmendOrder({ o, refresh }: { o: PurchaseOrder; refresh: (o: PurchaseOrder) => void }) {
  const router = useRouter();
  const can = useCan("procurement.order.edit");
  const run = useMutation({
    mutationFn: () => procurementApi.post<PurchaseOrder>(`/procurement/orders/${o.id}/amend`),
    onSuccess: (row) => { refresh(row); router.push(`/procurement/new/order?amend=${row.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return <button className="btn-ghost" disabled={run.isPending} onClick={() => run.mutate()}><PencilLine size={15} /> Amend</button>;
}

const orders: MasterConfig<PurchaseOrder> = {
  entityType: "procurement.order",
  permission: "procurement.order",
  plural: "Purchase orders",
  singular: "Purchase order",
  route: "/procurement/orders",
  client: procurementApi.orders,
  defaultSort: "-createdAt",
  createHref: "/procurement/new/order",
  columns: [
    { key: "number", label: "Number", render: (r) => `${r.number}${r.amendment ? ` A${r.amendment}` : ""}` },
    { key: "supplierId", label: "Supplier", render: (r) => <SupplierLink id={r.supplierId} /> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "expectedDate", label: "Expected", render: (r) => formatDate(r.expectedDate) },
    { key: "total", label: "Total", render: (r) => formatMoney(r.totals.total, r.currency), text: (r) => String(r.totals.total / 100) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "pending_approval", "approved", "sent", "confirmed", "partially_received", "received", "cancelled", "closed"]) }],
  fields: [
    { key: "expectedDate", label: "Expected delivery", type: "date" },
    { key: "notes", label: "Notes to supplier", type: "textarea", wide: true },
  ],
  title: (r) => `${r.number}${r.amendment ? ` (amendment ${r.amendment})` : ""}`,
  subtitle: (r) => `${formatMoney(r.totals.total, r.currency)} · ${formatDate(r.date)}`,
  status: (r) => r.status,
  editable: (r) => r.status === "draft",
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && <Action<PurchaseOrder> label="Submit" icon={FileCheck} path={`/procurement/orders/${r.id}/submit`} permission="procurement.order.edit" onDone={refresh} />}
      {r.status === "approved" && <Action<PurchaseOrder> label="Mark sent" icon={Mail} path={`/procurement/orders/${r.id}/send`} permission="procurement.order.edit" onDone={refresh} />}
      {["approved", "sent"].includes(r.status) && (
        <Action<PurchaseOrder> label="Supplier confirmed" icon={CheckCircle2} path={`/procurement/orders/${r.id}/confirm`} permission="procurement.order.edit" onDone={refresh} danger confirm="Supplier's order reference (optional)" reason="optional" body={(ref) => ({ supplierReference: ref || undefined })} />
      )}
      {["approved", "sent", "confirmed", "partially_received"].includes(r.status) && <Link className="btn-primary" href={`/procurement/new/receipt?order=${r.id}`}><PackageCheck size={15} /> Receive</Link>}
      {["approved", "sent", "confirmed"].includes(r.status) && r.lines.every((l) => l.received === 0) && <AmendOrder o={r} refresh={refresh} />}
      {!["received", "cancelled", "closed"].includes(r.status) && (
        <Action<PurchaseOrder> label={r.lines.some((l) => l.received > 0) ? "Close" : "Cancel"} icon={Ban} path={`/procurement/orders/${r.id}/cancel`} permission="procurement.order.delete" onDone={refresh} danger confirm="Cancel the rest of this order?" reason="required" />
      )}
    </>
  ),
  details: (r) => [
    { label: "Supplier", value: <SupplierLink id={r.supplierId} /> },
    { label: "Deliver to", value: <WarehouseName id={r.warehouseId} /> },
    { label: "Expected", value: formatDate(r.expectedDate) },
    { label: "Payment terms", value: `${r.paymentTermsDays} days` },
    { label: "Supplier confirmed", value: r.supplierConfirmedAt ? `${formatDateTime(r.supplierConfirmedAt)}${r.supplierReference ? ` · ref ${r.supplierReference}` : ""}` : null },
    { label: "Requisition", value: r.requisitionId ? <Link className={linkCls} href={`/procurement/requisitions/${r.requisitionId}`}>Open requisition</Link> : null },
    { label: "RFQ", value: r.rfqId ? <Link className={linkCls} href={`/procurement/rfqs/${r.rfqId}`}>Open RFQ</Link> : null },
    { label: "Notes", value: r.notes },
    { label: "Cancelled because", value: r.cancelReason },
  ],
  extra: (r) => <PurchaseLines o={r} />,
};

// ─── Receipts and returns ─────────────────────────────────────────────────────

function ReceiptLines({ g }: { g: GoodsReceipt }) {
  const name = useProductNames();
  return (
    <section className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>#</th><th>Product</th><th>Received</th><th>Rejected</th><th>Accepted</th><th>Lot</th><th>Unit cost</th></tr></thead>
        <tbody>
          {g.lines.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td><td>{name(l.productId)}</td><td>{qty(l.received)}</td>
              <td>{l.rejected ? `${qty(l.rejected)} · ${l.rejectReason}` : "—"}</td><td>{qty(l.accepted)}</td>
              <td>{l.lotNo ?? "—"}</td><td>{l.unitCost !== undefined ? formatMoney(l.unitCost, "LKR") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const receipts: MasterConfig<GoodsReceipt> = {
  entityType: "procurement.receipt",
  permission: "procurement.receipt",
  plural: "Goods receipts",
  singular: "Goods receipt",
  description: "Receive goods from an approved purchase order.",
  route: "/procurement/receipts",
  client: procurementApi.receipts,
  defaultSort: "-createdAt",
  createHref: "/procurement/orders",
  columns: [
    { key: "number", label: "Number" },
    { key: "supplierId", label: "Supplier", render: (r) => <SupplierLink id={r.supplierId} /> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "supplierDeliveryNote", label: "Delivery note" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "posted", "cancelled"]) }],
  fields: [{ key: "notes", label: "Notes", type: "textarea", wide: true }],
  title: (r) => r.number,
  subtitle: (r) => `${formatDate(r.date)}${r.supplierDeliveryNote ? ` · DN ${r.supplierDeliveryNote}` : ""}`,
  status: (r) => r.status,
  editable: (r) => r.status === "draft",
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && <Action<GoodsReceipt> label="Post to stock" icon={PackageCheck} path={`/procurement/receipts/${r.id}/post`} permission="procurement.receipt.edit" onDone={refresh} confirm="Put the accepted goods into stock?" />}
      {r.status === "draft" && <Action<GoodsReceipt> label="Cancel" icon={Ban} path={`/procurement/receipts/${r.id}/cancel`} permission="procurement.receipt.edit" onDone={refresh} danger confirm="Cancel this receipt?" />}
      {r.status === "posted" && <Link className="btn-ghost" href={`/procurement/new/return?receipt=${r.id}`}><RotateCcw size={15} /> Return to supplier</Link>}
    </>
  ),
  details: (r) => [
    { label: "Order", value: <Link className={linkCls} href={`/procurement/orders/${r.orderId}`}>Open order</Link> },
    { label: "Warehouse", value: <WarehouseName id={r.warehouseId} /> },
    { label: "Posted", value: formatDateTime(r.postedAt) },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <ReceiptLines g={r} />,
};

const returns: MasterConfig<SupplierReturn> = {
  entityType: "procurement.supplierReturn",
  permission: "procurement.receipt",
  plural: "Supplier returns",
  singular: "Supplier return",
  description: "Start a return from a posted goods receipt.",
  route: "/procurement/returns",
  client: procurementApi.returns,
  defaultSort: "-createdAt",
  createHref: "/procurement/receipts",
  columns: [
    { key: "number", label: "Number" },
    { key: "supplierId", label: "Supplier", render: (r) => <SupplierLink id={r.supplierId} /> },
    { key: "reason", label: "Reason" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "shipped", "cancelled"]) }],
  fields: [{ key: "reason", label: "Reason", type: "text", required: true }],
  title: (r) => r.number,
  subtitle: (r) => r.reason,
  status: (r) => r.status,
  editable: (r) => r.status === "draft",
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && <Action<SupplierReturn> label="Ship" icon={Truck} path={`/procurement/returns/${r.id}/ship`} permission="procurement.receipt.edit" onDone={refresh} confirm="Send the goods back? Stock leaves the warehouse." />}
      {r.status === "draft" && <Action<SupplierReturn> label="Cancel" icon={Ban} path={`/procurement/returns/${r.id}/cancel`} permission="procurement.receipt.edit" onDone={refresh} danger />}
    </>
  ),
  details: (r) => [
    { label: "Receipt", value: <Link className={linkCls} href={`/procurement/receipts/${r.receiptId}`}>Open receipt</Link> },
    { label: "Shipped", value: formatDateTime(r.shippedAt) },
    { label: "Lines", value: r.lines.map((l) => `Line ${l.receiptLineIndex + 1}: ${qty(l.qty)}`).join("\n") },
  ],
};

export const PROCUREMENT_SCREENS: Record<string, MasterConfig<never>> = {
  suppliers: suppliers as unknown as MasterConfig<never>,
  requisitions: requisitions as unknown as MasterConfig<never>,
  rfqs: rfqs as unknown as MasterConfig<never>,
  orders: orders as unknown as MasterConfig<never>,
  receipts: receipts as unknown as MasterConfig<never>,
  returns: returns as unknown as MasterConfig<never>,
};
