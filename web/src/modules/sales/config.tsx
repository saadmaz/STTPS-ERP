"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Copy, FileCheck, PackageCheck, Repeat, RotateCcw, Send, ShoppingCart, Truck } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, StatusBadge } from "@/components/ui/kit";
import { useProductNames } from "@/modules/inventory/config";

export interface SalesLine {
  lineId: string;
  productId: string;
  description: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  taxCode: string | null;
  taxRate: number;
  net: number;
  tax: number;
  total: number;
  reserved?: number;
  delivered?: number;
  returned?: number;
}
interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}
export interface Quote extends BaseRecord {
  number: string;
  revision: number;
  accountId: string;
  contactId: string | null;
  currency: string;
  date: string;
  validUntil: string;
  lines: SalesLine[];
  totals: Totals;
  terms: string | null;
  notes: string | null;
  status: string;
  customerComment: string | null;
  orderId: string | null;
}
export interface Order extends BaseRecord {
  number: string;
  accountId: string;
  quoteId: string | null;
  customerReference: string | null;
  currency: string;
  date: string;
  requestedDate: string | null;
  warehouseId: string;
  lines: SalesLine[];
  totals: Totals;
  status: string;
  holdReasons: string[];
  cancelReason: string | null;
}
interface Delivery extends BaseRecord {
  number: string;
  orderId: string;
  accountId: string;
  lines: { orderLineId: string; productId: string; qty: number; lotNo: string | null; serialNos: string[] }[];
  status: string;
  carrier: string | null;
  trackingNo: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  receivedBy: string | null;
  exception: string | null;
}
interface SalesReturn extends BaseRecord {
  number: string;
  deliveryId: string;
  orderId: string;
  reason: string;
  lines: { deliveryLineIndex: number; productId: string; qty: number; condition: string }[];
  status: string;
}

export const salesApi = {
  quotes: crud<Quote>("/sales/quotes"),
  orders: crud<Order>("/sales/orders"),
  deliveries: crud<Delivery>("/sales/deliveries"),
  returns: crud<SalesReturn>("/sales/returns"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

const qty = (n: number) => String(n / 1000);
const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

function Customer({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ["crm.account", "one", id], queryFn: () => api.get(`/crm/accounts/${id}`).then((r) => r.data as { name: string }) });
  return <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/crm/accounts/${id}`}>{data?.name ?? "…"}</Link>;
}

export function LinesSummary({ lines, totals, currency, showFulfilment }: { lines: SalesLine[]; totals: Totals; currency: string; showFulfilment?: boolean }) {
  const name = useProductNames();
  return (
    <section className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Item</th><th>Qty</th><th>Price</th><th>Disc.</th><th>Tax</th><th className="text-right">Total</th>
            {showFulfilment && <><th>Reserved</th><th>Delivered</th><th>Returned</th></>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.lineId}>
              <td><div>{l.description}</div><div className="text-xs text-slate-500">{name(l.productId)}</div></td>
              <td>{qty(l.qty)}</td>
              <td>{formatMoney(l.unitPrice, currency)}</td>
              <td>{l.discountPct ? `${l.discountPct / 100}%` : "—"}</td>
              <td>{l.taxCode ? `${l.taxCode} ${l.taxRate / 100}%` : "—"}</td>
              <td className="text-right">{formatMoney(l.total, currency)}</td>
              {showFulfilment && <><td>{qty(l.reserved ?? 0)}</td><td>{qty(l.delivered ?? 0)}</td><td>{qty(l.returned ?? 0)}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto w-full max-w-xs p-4 space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(totals.subtotal, currency)}</dd></div>
        {totals.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>-{formatMoney(totals.discount, currency)}</dd></div>}
        <div className="flex justify-between"><dt>Tax</dt><dd>{formatMoney(totals.tax, currency)}</dd></div>
        <div className="flex justify-between font-semibold border-t border-slate-200 dark:border-slate-800 pt-1"><dt>Total</dt><dd>{formatMoney(totals.total, currency)}</dd></div>
      </dl>
    </section>
  );
}

/** One action button posting to the API; `confirm` asks first, optionally for a reason. */
export function Action<T>({
  label, icon: Icon, path, permission, onDone, danger, confirm, reason, body,
}: {
  label: string; icon: React.ElementType; path: string; permission: string; onDone: (row: T) => void;
  danger?: boolean; confirm?: string; reason?: "required" | "optional"; body?: (reason: string) => object;
}) {
  const can = useCan(permission);
  const [asking, setAsking] = useState(false);
  const run = useMutation({
    mutationFn: (why: string) => salesApi.post<T>(path, body ? body(why) : reason ? { reason: why } : {}),
    onSuccess: (row) => { setAsking(false); onDone(row); toast.success(`${label}: done`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return (
    <>
      <button className={danger ? "btn-ghost" : "btn-primary"} disabled={run.isPending} onClick={() => (confirm || reason ? setAsking(true) : run.mutate(""))}>
        <Icon size={15} /> {label}
      </button>
      <ConfirmDialog open={asking} title={confirm ?? `${label}?`} confirmLabel={label} danger={danger} reason={reason} busy={run.isPending} onConfirm={(why) => run.mutate(why)} onClose={() => setAsking(false)} />
    </>
  );
}

function SendQuote({ quote, refresh }: { quote: Quote; refresh: (q: Quote) => void }) {
  const can = useCan("sales.quote.edit");
  const send = useMutation({
    mutationFn: () => salesApi.post<{ quote: Quote; link: string; emailedTo: string | null }>(`/sales/quotes/${quote.id}/send`),
    onSuccess: async (r) => {
      refresh(r.quote);
      const link = r.link.startsWith("http") ? r.link : `${window.location.origin}${r.link}`;
      try { await navigator.clipboard.writeText(link); } catch { /* clipboard unavailable */ }
      toast.success(r.emailedTo ? `Emailed to ${r.emailedTo}; link copied` : "Customer link copied to the clipboard");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return <button className="btn-primary" onClick={() => send.mutate()} disabled={send.isPending}>{quote.status === "sent" ? <Copy size={15} /> : <Send size={15} />} {quote.status === "sent" ? "New link" : "Send"}</button>;
}

function ConvertQuote({ quote }: { quote: Quote }) {
  const router = useRouter();
  const can = useCan("sales.order.create");
  const run = useMutation({ mutationFn: () => salesApi.post<Order>(`/sales/quotes/${quote.id}/convert`), onSuccess: (o) => router.push(`/sales/orders/${o.id}`), onError: (e) => toast.error(errorMessage(e)) });
  if (!can) return null;
  return <button className="btn-primary" onClick={() => run.mutate()} disabled={run.isPending}><ShoppingCart size={15} /> Create order</button>;
}

function ReviseQuote({ quote }: { quote: Quote }) {
  const router = useRouter();
  const can = useCan("sales.quote.edit");
  const run = useMutation({ mutationFn: () => salesApi.post<Quote>(`/sales/quotes/${quote.id}/revise`), onSuccess: (q) => router.push(`/sales/quotes/${q.id}`), onError: (e) => toast.error(errorMessage(e)) });
  if (!can) return null;
  return <button className="btn-ghost" onClick={() => run.mutate()} disabled={run.isPending}><Repeat size={15} /> Revise</button>;
}

const quotes: MasterConfig<Quote> = {
  entityType: "sales.quote",
  permission: "sales.quote",
  plural: "Quotes",
  singular: "Quote",
  route: "/sales/quotes",
  client: salesApi.quotes,
  defaultSort: "-createdAt",
  createHref: "/sales/new/quote",
  columns: [
    { key: "number", label: "Number", render: (r) => `${r.number}${r.revision > 1 ? ` rev ${r.revision}` : ""}` },
    { key: "accountId", label: "Customer", render: (r) => <Customer id={r.accountId} /> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "validUntil", label: "Valid until", render: (r) => formatDate(r.validUntil) },
    { key: "total", label: "Total", render: (r) => formatMoney(r.totals.total, r.currency), text: (r) => String(r.totals.total / 100) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "converted", "superseded"]) }],
  fields: [],
  title: (r) => `${r.number}${r.revision > 1 ? ` (rev ${r.revision})` : ""}`,
  subtitle: (r) => `${formatMoney(r.totals.total, r.currency)} · valid until ${formatDate(r.validUntil)}`,
  status: (r) => r.status,
  editable: () => false,
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && <Action<Quote> label="Submit" icon={FileCheck} path={`/sales/quotes/${r.id}/submit`} permission="sales.quote.edit" onDone={refresh} />}
      {(r.status === "approved" || r.status === "sent") && <SendQuote quote={r} refresh={refresh} />}
      {r.status === "accepted" && <ConvertQuote quote={r} />}
      {["draft", "approved", "sent", "rejected"].includes(r.status) && <ReviseQuote quote={r} />}
    </>
  ),
  details: (r) => [
    { label: "Customer", value: <Customer id={r.accountId} /> },
    { label: "Date", value: formatDate(r.date) },
    { label: "Order", value: r.orderId ? <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/sales/orders/${r.orderId}`}>Open order</Link> : null },
    { label: "Customer comment", value: r.customerComment },
    { label: "Terms", value: r.terms },
    { label: "Internal notes", value: r.notes },
  ],
  extra: (r) => <LinesSummary lines={r.lines} totals={r.totals} currency={r.currency} />,
};

function InvoiceDelivery({ deliveryId }: { deliveryId: string }) {
  const router = useRouter();
  const can = useCan("finance.invoice.create");
  const run = useMutation({
    mutationFn: () => salesApi.post<{ id: string }>(`/finance/invoices/from-delivery/${deliveryId}`),
    onSuccess: (inv) => router.push(`/finance/invoices/${inv.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return <button className="btn-ghost" onClick={() => run.mutate()} disabled={run.isPending}><FileCheck size={15} /> Invoice</button>;
}

function NewDelivery({ order }: { order: Order }) {
  const router = useRouter();
  const can = useCan("sales.delivery.create");
  const run = useMutation({ mutationFn: () => salesApi.deliveries.create({ orderId: order.id }), onSuccess: (d) => router.push(`/sales/deliveries/${d.id}`), onError: (e) => toast.error(errorMessage(e)) });
  if (!can) return null;
  return <button className="btn-primary" onClick={() => run.mutate()} disabled={run.isPending}><Truck size={15} /> Deliver</button>;
}

const orders: MasterConfig<Order> = {
  entityType: "sales.order",
  permission: "sales.order",
  plural: "Sales orders",
  singular: "Sales order",
  route: "/sales/orders",
  client: salesApi.orders,
  defaultSort: "-createdAt",
  createHref: "/sales/new/order",
  columns: [
    { key: "number", label: "Number" },
    { key: "accountId", label: "Customer", render: (r) => <Customer id={r.accountId} /> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "total", label: "Total", render: (r) => formatMoney(r.totals.total, r.currency), text: (r) => String(r.totals.total / 100) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "pending_approval", "confirmed", "partially_delivered", "delivered", "cancelled"]) }],
  fields: [],
  title: (r) => r.number,
  subtitle: (r) => `${formatMoney(r.totals.total, r.currency)} · ${formatDate(r.date)}`,
  status: (r) => r.status,
  editable: () => false,
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && <Action<Order> label="Confirm" icon={CheckCircle2} path={`/sales/orders/${r.id}/confirm`} permission="sales.order.edit" onDone={refresh} />}
      {["confirmed", "partially_delivered"].includes(r.status) && <NewDelivery order={r} />}
      {["confirmed", "partially_delivered"].includes(r.status) && r.lines.some((l) => l.qty - (l.delivered ?? 0) - (l.reserved ?? 0) > 0) && (
        <Action<Order> label="Reserve shortages" icon={PackageCheck} path={`/sales/orders/${r.id}/reserve`} permission="sales.order.edit" onDone={refresh} danger />
      )}
      {!["delivered", "cancelled", "closed"].includes(r.status) && (
        <Action<Order> label="Cancel" icon={Ban} path={`/sales/orders/${r.id}/cancel`} permission="sales.order.delete" onDone={refresh} danger confirm="Cancel this order? Reserved stock is released." reason="required" />
      )}
    </>
  ),
  details: (r) => [
    { label: "Customer", value: <Customer id={r.accountId} /> },
    { label: "Customer reference", value: r.customerReference },
    { label: "Requested", value: formatDate(r.requestedDate) },
    { label: "From quote", value: r.quoteId ? <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/sales/quotes/${r.quoteId}`}>Open quote</Link> : null },
    { label: "On hold for", value: r.holdReasons.length ? r.holdReasons.map(humanize).join(", ") : null },
    { label: "Cancelled because", value: r.cancelReason },
  ],
  extra: (r) => <LinesSummary lines={r.lines} totals={r.totals} currency={r.currency} showFulfilment />,
};

function DeliveryLines({ d }: { d: Delivery }) {
  const name = useProductNames();
  return (
    <section className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Lot</th><th>Serials</th></tr></thead>
        <tbody>{d.lines.map((l, i) => <tr key={i}><td>{i + 1}</td><td>{name(l.productId)}</td><td>{qty(l.qty)}</td><td>{l.lotNo ?? "—"}</td><td>{l.serialNos.join(", ") || "—"}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

const deliveries: MasterConfig<Delivery> = {
  entityType: "sales.delivery",
  permission: "sales.delivery",
  plural: "Deliveries",
  singular: "Delivery",
  description: "Create deliveries from a confirmed order.",
  route: "/sales/deliveries",
  client: salesApi.deliveries,
  defaultSort: "-createdAt",
  createHref: "/sales/orders",
  columns: [
    { key: "number", label: "Number" },
    { key: "accountId", label: "Customer", render: (r) => <Customer id={r.accountId} /> },
    { key: "dispatchedAt", label: "Dispatched", render: (r) => formatDateTime(r.dispatchedAt) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "picked", "packed", "dispatched", "delivered", "failed", "cancelled"]) }],
  fields: [
    { key: "carrier", label: "Carrier", type: "text" },
    { key: "trackingNo", label: "Tracking number", type: "text" },
  ],
  title: (r) => r.number,
  subtitle: (r) => (r.carrier ? `${r.carrier}${r.trackingNo ? ` · ${r.trackingNo}` : ""}` : "Own delivery"),
  status: (r) => r.status,
  editable: (r) => !["delivered", "cancelled"].includes(r.status),
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && <Action<Delivery> label="Picked" icon={PackageCheck} path={`/sales/deliveries/${r.id}/pick`} permission="sales.delivery.edit" onDone={refresh} danger />}
      {r.status === "picked" && <Action<Delivery> label="Packed" icon={PackageCheck} path={`/sales/deliveries/${r.id}/pack`} permission="sales.delivery.edit" onDone={refresh} danger />}
      {["draft", "picked", "packed"].includes(r.status) && <Action<Delivery> label="Dispatch" icon={Truck} path={`/sales/deliveries/${r.id}/dispatch`} permission="sales.delivery.edit" onDone={refresh} confirm="Dispatch now? Stock leaves the warehouse." />}
      {r.status === "dispatched" && <Action<Delivery> label="Delivered" icon={CheckCircle2} path={`/sales/deliveries/${r.id}/deliver`} permission="sales.delivery.edit" onDone={refresh} confirm="Who received the goods?" reason="required" body={(why) => ({ receivedBy: why })} />}
      {r.status === "dispatched" && <Action<Delivery> label="Failed" icon={Ban} path={`/sales/deliveries/${r.id}/fail`} permission="sales.delivery.edit" onDone={refresh} danger confirm="What went wrong?" reason="required" />}
      {["dispatched", "delivered"].includes(r.status) && <InvoiceDelivery deliveryId={r.id} />}
      {["dispatched", "delivered", "failed"].includes(r.status) && <Link className="btn-ghost" href={`/sales/new/return?delivery=${r.id}`}><RotateCcw size={15} /> Return</Link>}
    </>
  ),
  details: (r) => [
    { label: "Customer", value: <Customer id={r.accountId} /> },
    { label: "Order", value: <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/sales/orders/${r.orderId}`}>Open order</Link> },
    { label: "Dispatched", value: formatDateTime(r.dispatchedAt) },
    { label: "Delivered", value: r.deliveredAt ? `${formatDateTime(r.deliveredAt)} · received by ${r.receivedBy}` : null },
    { label: "Exception", value: r.exception },
  ],
  extra: (r) => <DeliveryLines d={r} />,
};

const returns: MasterConfig<SalesReturn> = {
  entityType: "sales.return",
  permission: "sales.return",
  plural: "Returns",
  singular: "Return",
  description: "Start a return from a dispatched delivery.",
  route: "/sales/returns",
  client: salesApi.returns,
  defaultSort: "-createdAt",
  createHref: "/sales/deliveries",
  columns: [
    { key: "number", label: "Number" },
    { key: "reason", label: "Reason" },
    { key: "createdAt", label: "Requested", render: (r) => formatDate(r.createdAt) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["requested", "approved", "received", "rejected"]) }],
  fields: [{ key: "reason", label: "Reason", type: "text", required: true }],
  title: (r) => r.number,
  subtitle: (r) => r.reason,
  status: (r) => r.status,
  editable: (r) => r.status === "requested",
  actions: (r, refresh) => (
    <>
      {r.status === "requested" && <Action<SalesReturn> label="Approve" icon={CheckCircle2} path={`/sales/returns/${r.id}/approve`} permission="sales.return.edit" onDone={refresh} />}
      {r.status === "approved" && <Action<SalesReturn> label="Receive goods" icon={PackageCheck} path={`/sales/returns/${r.id}/receive`} permission="sales.return.edit" onDone={refresh} confirm="Receive the goods back into stock?" />}
      {["requested", "approved"].includes(r.status) && <Action<SalesReturn> label="Reject" icon={Ban} path={`/sales/returns/${r.id}/reject`} permission="sales.return.edit" onDone={refresh} danger reason="required" />}
    </>
  ),
  details: (r) => [
    { label: "Delivery", value: <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/sales/deliveries/${r.deliveryId}`}>Open delivery</Link> },
    { label: "Lines", value: r.lines.map((l) => `Line ${l.deliveryLineIndex + 1}: ${qty(l.qty)} (${l.condition})`).join("\n") },
  ],
};

export const SALES_SCREENS: Record<string, MasterConfig<never>> = {
  quotes: quotes as unknown as MasterConfig<never>,
  orders: orders as unknown as MasterConfig<never>,
  deliveries: deliveries as unknown as MasterConfig<never>,
  returns: returns as unknown as MasterConfig<never>,
};
