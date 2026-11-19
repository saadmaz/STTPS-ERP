"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Banknote, CheckCircle2, FileMinus, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, EmptyState, ErrorState, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { procurementApi, useSupplierName } from "@/modules/procurement/config";
import { useAccounts } from "./config";

interface BillLine {
  lineId: string;
  orderLineId: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  taxCode: string | null;
  taxRate: number;
  net: number;
  tax: number;
  total: number;
  accountId: string | null;
  orderPrice: number | null;
}
export interface Bill extends BaseRecord {
  number: string;
  kind: "bill" | "debit_note";
  supplierId: string;
  supplierInvoiceNo: string;
  orderId: string | null;
  receiptId: string | null;
  creditedBillId: string | null;
  date: string;
  dueDate: string;
  currency: string;
  lines: BillLine[];
  totals: { subtotal: number; tax: number; total: number };
  match: { status: "matched" | "variance" | "not_applicable"; issues: string[] };
  overrideReason: string | null;
  amountPaid: number;
  balanceDue: number;
  status: string;
  journalId: string | null;
  notes: string | null;
}
export interface Payment extends BaseRecord {
  number: string;
  supplierId: string;
  date: string;
  currency: string;
  amount: number;
  method: string;
  reference: string | null;
  allocations: { billId: string; amount: number }[];
  unallocated: number;
  runId: string | null;
  status: string;
  journalId: string | null;
  notes: string | null;
}

export const apApi = {
  bills: crud<Bill>("/finance/bills"),
  payments: crud<Payment>("/finance/payments"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

const linkCls = "text-blue-700 dark:text-blue-400 hover:underline";
const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const qty = (n: number) => String(n / 1000);

function SupplierLink({ id }: { id: string }) {
  const name = useSupplierName();
  return <Link className={linkCls} href={`/finance/supplier-statement/${id}`}>{name(id)}</Link>;
}

function BillLines({ b }: { b: Bill }) {
  return (
    <section className="card overflow-x-auto">
      {b.match.status === "variance" && (
        <div className="p-4 text-sm bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800">
          <p className="font-medium">Does not match the order and receipts</p>
          <ul className="list-disc pl-5">{b.match.issues.map((i) => <li key={i}>{i}</li>)}</ul>
          {b.overrideReason && <p className="mt-1">Posted anyway: {b.overrideReason}</p>}
        </div>
      )}
      <table className="table-base">
        <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Order price</th><th>Tax</th><th className="text-right">Total</th></tr></thead>
        <tbody>
          {b.lines.map((l) => (
            <tr key={l.lineId}>
              <td>{l.description}</td><td>{qty(l.qty)}</td><td>{formatMoney(l.unitPrice, b.currency)}</td>
              <td className={l.orderPrice !== null && l.orderPrice !== l.unitPrice ? "text-amber-700 dark:text-amber-400" : ""}>{l.orderPrice !== null ? formatMoney(l.orderPrice, b.currency) : "—"}</td>
              <td>{l.taxCode ? `${l.taxCode} ${l.taxRate / 100}%` : "—"}</td><td className="text-right">{formatMoney(l.total, b.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto w-full max-w-xs p-4 space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(b.totals.subtotal, b.currency)}</dd></div>
        <div className="flex justify-between"><dt>Tax</dt><dd>{formatMoney(b.totals.tax, b.currency)}</dd></div>
        <div className="flex justify-between font-semibold border-t border-slate-200 dark:border-slate-800 pt-1"><dt>Total</dt><dd>{formatMoney(b.totals.total, b.currency)}</dd></div>
        <div className="flex justify-between font-semibold"><dt>{b.kind === "bill" ? "Still owed" : "Credit left"}</dt><dd>{formatMoney(b.balanceDue, b.currency)}</dd></div>
      </dl>
    </section>
  );
}

function PostBill({ b, refresh }: { b: Bill; refresh: (b: Bill) => void }) {
  const can = useCan("finance.bill.edit");
  const [asking, setAsking] = useState(false);
  const run = useMutation({
    mutationFn: (overrideReason: string) => apApi.post<Bill>(`/finance/bills/${b.id}/post`, overrideReason ? { overrideReason } : {}),
    onSuccess: (r) => { setAsking(false); toast.success("Posted"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  const variance = b.match.status === "variance";
  return (
    <>
      <button className="btn-primary" disabled={run.isPending} onClick={() => setAsking(true)}><CheckCircle2 size={15} /> Post</button>
      <ConfirmDialog
        open={asking} title={variance ? "Post a bill that does not match?" : "Post to the supplier's account?"} body={variance ? b.match.issues.join("; ") : undefined}
        confirmLabel="Post" danger={variance} reason={variance ? "required" : undefined} busy={run.isPending} onConfirm={(why) => run.mutate(why)} onClose={() => setAsking(false)}
      />
    </>
  );
}

function ApplyDebit({ dn, refresh }: { dn: Bill; refresh: (b: Bill) => void }) {
  const can = useCan("finance.bill.edit");
  const [open, setOpen] = useState(false);
  const [billId, setBillId] = useState("");
  const [amount, setAmount] = useState("");
  const bills = useQuery({ queryKey: ["finance.bill", "open-for", dn.supplierId], queryFn: () => apApi.bills.list({ where: `supplierId:${dn.supplierId}`, limit: 100 }), enabled: open });
  const run = useMutation({
    mutationFn: () => apApi.post<{ debitNote: Bill }>(`/finance/bills/${dn.id}/apply-debit`, { billId, amount }),
    onSuccess: (r) => { toast.success("Applied"); setOpen(false); refresh(r.debitNote); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  const choices = (bills.data?.items ?? []).filter((b) => b.kind === "bill" && ["posted", "partially_paid"].includes(b.status) && b.currency === dn.currency);
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><FileMinus size={15} /> Apply to bill</button>
      <ConfirmDialog open={open} title={`Apply ${dn.number}`} confirmLabel="Apply" busy={run.isPending} onConfirm={() => (billId && amount ? run.mutate() : toast.error("Choose a bill and amount"))} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Bill" required>
            <select className="input-base" value={billId} onChange={(e) => setBillId(e.target.value)}>
              <option value="">Choose…</option>
              {choices.map((b) => <option key={b.id} value={b.id}>{b.number} ({b.supplierInvoiceNo}) · {formatMoney(b.balanceDue, b.currency)}</option>)}
            </select>
          </Field>
          <Field label="Amount" required hint={`Up to ${formatMoney(dn.balanceDue, dn.currency)}`}><input className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

const bills: MasterConfig<Bill> = {
  entityType: "finance.bill",
  permission: "finance.bill",
  plural: "Supplier bills",
  singular: "Bill",
  route: "/finance/bills",
  client: apApi.bills,
  defaultSort: "-date",
  createHref: "/finance/new/bill",
  columns: [
    { key: "number", label: "Number" },
    { key: "supplierInvoiceNo", label: "Supplier's no." },
    { key: "supplierId", label: "Supplier", render: (r) => <SupplierLink id={r.supplierId} /> },
    { key: "dueDate", label: "Due", render: (r) => (r.kind === "bill" ? formatDate(r.dueDate) : "") },
    { key: "total", label: "Total", render: (r) => `${r.kind === "debit_note" ? "-" : ""}${formatMoney(r.totals.total, r.currency)}`, text: (r) => String(r.totals.total / 100) },
    { key: "match", label: "Match", render: (r) => (r.match.status === "not_applicable" ? "" : <StatusBadge status={r.match.status} />) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "kind", label: "Type", options: opts(["bill", "debit_note"]) },
    { key: "status", label: "Status", options: opts(["draft", "posted", "partially_paid", "paid", "cancelled"]) },
  ],
  fields: [
    { key: "dueDate", label: "Due date", type: "date" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => `${r.kind === "debit_note" ? "Debit note" : "Bill"} ${r.number}`,
  subtitle: (r) => `${r.supplierInvoiceNo} · ${formatMoney(r.totals.total, r.currency)}${r.kind === "bill" ? ` · due ${formatDate(r.dueDate)}` : ""}`,
  status: (r) => r.status,
  editable: (r) => r.status === "draft",
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && <PostBill b={r} refresh={refresh} />}
      {r.status === "draft" && <ActionCancel b={r} refresh={refresh} />}
      {r.kind === "bill" && ["posted", "partially_paid"].includes(r.status) && <Link className="btn-primary" href={`/finance/new/payment?supplier=${r.supplierId}&bill=${r.id}`}><Banknote size={15} /> Pay</Link>}
      {r.kind === "bill" && r.status !== "draft" && r.status !== "cancelled" && <Link className="btn-ghost" href={`/finance/new/bill?debit=${r.id}`}><FileMinus size={15} /> Debit note</Link>}
      {r.kind === "debit_note" && ["posted", "partially_paid"].includes(r.status) && <ApplyDebit dn={r} refresh={refresh} />}
    </>
  ),
  details: (r) => [
    { label: "Supplier", value: <SupplierLink id={r.supplierId} /> },
    { label: "Purchase order", value: r.orderId ? <Link className={linkCls} href={`/procurement/orders/${r.orderId}`}>Open order</Link> : null },
    { label: "Goods receipt", value: r.receiptId ? <Link className={linkCls} href={`/procurement/receipts/${r.receiptId}`}>Open receipt</Link> : null },
    { label: "Credits", value: r.creditedBillId ? <Link className={linkCls} href={`/finance/bills/${r.creditedBillId}`}>Original bill</Link> : null },
    { label: "Journal", value: r.journalId ? <Link className={linkCls} href={`/finance/journals/${r.journalId}`}>Open journal</Link> : null },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <BillLines b={r} />,
};

function ActionCancel({ b, refresh }: { b: Bill; refresh: (b: Bill) => void }) {
  const can = useCan("finance.bill.edit");
  const run = useMutation({ mutationFn: () => apApi.post<Bill>(`/finance/bills/${b.id}/cancel`), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  if (!can) return null;
  return <button className="btn-ghost" onClick={() => run.mutate()} disabled={run.isPending}><Ban size={15} /> Cancel</button>;
}

function PaymentAllocations({ p }: { p: Payment }) {
  const q = useQuery({ queryKey: ["finance.payment", "allocations", p.id], queryFn: () => Promise.all(p.allocations.map((a) => apApi.bills.get(a.billId))) });
  return (
    <section className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>Bill</th><th>Supplier&apos;s no.</th><th className="text-right">Paid</th></tr></thead>
        <tbody>
          {p.allocations.map((a, i) => (
            <tr key={a.billId}><td><Link className={linkCls} href={`/finance/bills/${a.billId}`}>{q.data?.[i]?.number ?? "…"}</Link></td><td>{q.data?.[i]?.supplierInvoiceNo ?? ""}</td><td className="text-right">{formatMoney(a.amount, p.currency)}</td></tr>
          ))}
          {p.unallocated > 0 && <tr><td colSpan={2}>Advance (on account)</td><td className="text-right">{formatMoney(p.unallocated, p.currency)}</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

const payments: MasterConfig<Payment> = {
  entityType: "finance.payment",
  permission: "finance.payment",
  plural: "Supplier payments",
  singular: "Payment",
  route: "/finance/payments",
  client: apApi.payments,
  defaultSort: "-date",
  createHref: "/finance/new/payment",
  columns: [
    { key: "number", label: "Number" },
    { key: "supplierId", label: "Supplier", render: (r) => <SupplierLink id={r.supplierId} /> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "method", label: "Method", render: (r) => humanize(r.method) },
    { key: "amount", label: "Amount", render: (r) => formatMoney(r.amount, r.currency), text: (r) => String(r.amount / 100) },
  ],
  fields: [{ key: "notes", label: "Notes", type: "textarea", wide: true }],
  title: (r) => r.number,
  subtitle: (r) => `${formatMoney(r.amount, r.currency)} · ${formatDate(r.date)}${r.reference ? ` · ${r.reference}` : ""}`,
  status: (r) => r.status,
  details: (r) => [
    { label: "Supplier", value: <SupplierLink id={r.supplierId} /> },
    { label: "Method", value: humanize(r.method) },
    { label: "Reference", value: r.reference },
    { label: "Payment run", value: r.runId },
    { label: "Journal", value: r.journalId ? <Link className={linkCls} href={`/finance/journals/${r.journalId}`}>Open journal</Link> : null },
  ],
  extra: (r) => <PaymentAllocations p={r} />,
};

export const AP_SCREENS: Record<string, MasterConfig<never>> = {
  bills: bills as unknown as MasterConfig<never>,
  payments: payments as unknown as MasterConfig<never>,
};

// ─── Forms ────────────────────────────────────────────────────────────────────

function useSuppliers() {
  const q = useQuery({ queryKey: ["options", "procurement.suppliers"], queryFn: () => procurementApi.suppliers.list({ limit: 200, sort: "nameLower" }) });
  return q.data?.items ?? [];
}

interface LineForm { description: string; qty: string; unitPrice: string; taxCode: string; accountId: string }
const blank = (): LineForm => ({ description: "", qty: "1", unitPrice: "", taxCode: "", accountId: "" });

function NewBillInner() {
  const router = useRouter();
  const params = useSearchParams();
  const debitOf = params.get("debit") ?? "";
  const suppliers = useSuppliers();
  const accounts = useAccounts().filter((a) => !a.isGroup && !a.isControl && (a.type === "expense" || a.type === "asset"));
  const original = useQuery({ queryKey: ["finance.bill", "one", debitOf], queryFn: () => apApi.bills.get(debitOf), enabled: !!debitOf });
  const taxes = useQuery({ queryKey: ["sales-settings"], queryFn: () => api.get("/sales/settings").then((r) => r.data as { taxRates: { code: string; name: string }[] }) });
  const [chosen, setSupplier] = useState("");
  const supplierId = chosen || original.data?.supplierId || "";
  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineForm[]>([blank()]);
  const set = (i: number, patch: Partial<LineForm>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const save = useMutation({
    mutationFn: () => apApi.bills.create({
      supplierId, supplierInvoiceNo: invoiceNo, date, kind: debitOf ? "debit_note" : "bill", creditedBillId: debitOf || undefined, currency: original.data?.currency,
      lines: lines.filter((l) => l.description && l.unitPrice).map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, taxCode: l.taxCode || undefined, accountId: l.accountId || undefined })),
    }),
    onSuccess: (b) => { toast.success(`${b.number} saved as draft`); router.push(`/finance/bills/${b.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (debitOf && original.isLoading) return <Spinner />;
  return (
    <form className="max-w-5xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title={debitOf ? `Debit note for ${original.data?.number ?? ""}` : "New supplier bill"} subtitle="For goods received against an order, open the goods receipt and choose Bill instead." />
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Supplier" required>
          <select className="input-base" value={supplierId} onChange={(e) => setSupplier(e.target.value)} disabled={!!debitOf}>
            <option value="">Choose…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
        </Field>
        <Field label={debitOf ? "Supplier's credit note no." : "Supplier's invoice no."} required><input className="input-base" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></Field>
        <Field label="Date" required><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </section>
      <section className="card p-5 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input className="input-base col-span-12 sm:col-span-3" placeholder="Description" value={l.description} onChange={(e) => set(i, { description: e.target.value })} aria-label="Description" />
            <select className="input-base col-span-12 sm:col-span-3" value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })} aria-label="Account">
              <option value="">Account…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
            <input className="input-base col-span-3 sm:col-span-1" placeholder="Qty" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label="Quantity" />
            <input className="input-base col-span-4 sm:col-span-2" placeholder="Unit price" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} aria-label="Unit price" />
            <select className="input-base col-span-4 sm:col-span-2" value={l.taxCode} onChange={(e) => set(i, { taxCode: e.target.value })} aria-label="Tax">
              <option value="">Tax (none)</option>
              {(taxes.data?.taxRates ?? []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
            <button type="button" className="btn-ghost col-span-1" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" className="btn-ghost text-blue-600" onClick={() => setLines([...lines, blank()])}><Plus size={14} /> Line</button>
      </section>
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href="/finance/bills">Cancel</Link>
        <button className="btn-primary" disabled={!supplierId || !invoiceNo || save.isPending || !lines.some((l) => l.description && l.unitPrice && l.accountId)}>Save draft</button>
      </div>
    </form>
  );
}

function NewPaymentInner() {
  const router = useRouter();
  const params = useSearchParams();
  const suppliers = useSuppliers();
  const banks = useAccounts().filter((a) => !a.isGroup && (a.subtype === "bank" || a.subtype === "cash"));
  const billId = params.get("bill");
  const [supplierId, setSupplier] = useState(params.get("supplier") ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [bankAccountId, setBank] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const save = useMutation({
    mutationFn: () => apApi.payments.create({
      supplierId, date, amount, bankAccountId: bankAccountId || undefined, method, reference: reference || undefined,
      allocations: billId ? [{ billId, amount }] : undefined,
    }),
    onSuccess: (p) => { toast.success(`${p.number} recorded`); router.push(`/finance/payments/${p.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form className="max-w-3xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title="Pay a supplier" subtitle={billId ? "Applied to the chosen bill." : "Settles the oldest open bills first; any extra is kept as an advance."} />
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Supplier" required>
          <select className="input-base" value={supplierId} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">Choose…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
        </Field>
        <Field label="Date" required><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Amount" required><input className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="From">
          <select className="input-base" value={bankAccountId} onChange={(e) => setBank(e.target.value)}>
            <option value="">Default bank account</option>
            {banks.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
        <Field label="Method">
          <select className="input-base" value={method} onChange={(e) => setMethod(e.target.value)}>
            {["bank_transfer", "cash", "cheque", "card", "other"].map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
          </select>
        </Field>
        <Field label="Reference"><input className="input-base" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </section>
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href="/finance/payments">Cancel</Link>
        <button className="btn-primary" disabled={!supplierId || !amount || save.isPending}>Record payment</button>
      </div>
    </form>
  );
}

const NEW: Record<string, () => React.ReactElement> = { bill: NewBillInner, payment: NewPaymentInner };

export function NewApDocument({ kind }: { kind: string }) {
  const Form = NEW[kind];
  if (!Form) return null;
  return <Suspense fallback={<Spinner />}><Form /></Suspense>;
}

export const AP_FORM_KINDS = Object.keys(NEW);

// ─── Payment run, ageing and statements ───────────────────────────────────────

export function PaymentRunPage() {
  const router = useRouter();
  const name = useSupplierName();
  const [by, setBy] = useState(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [picked, setPicked] = useState<string[]>([]);
  const due = useQuery({ queryKey: ["finance-due", by], queryFn: () => api.get("/finance/payables/due", { params: { by } }).then((r) => r.data as Bill[]) });
  const run = useMutation({
    mutationFn: () => apApi.post<{ runId: string; payments: Payment[] }>("/finance/payments/run", { billIds: picked }),
    onSuccess: (r) => { toast.success(`${r.payments.length} payment${r.payments.length === 1 ? "" : "s"} made`); router.push(`/finance/payments?where=runId:${r.runId}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = due.data ?? [];
  const total = rows.filter((b) => picked.includes(b.id)).reduce((a, b) => a + b.balanceDue, 0);
  return (
    <div className="space-y-6">
      <PageHeader title="Payment run" subtitle="Choose bills to pay in full; one payment is made per supplier." actions={<label className="text-sm flex items-center gap-2">Due by<input type="date" className="input-base py-1" value={by} onChange={(e) => setBy(e.target.value)} /></label>} />
      {due.isLoading ? <Spinner /> : due.isError ? <ErrorState message={errorMessage(due.error)} /> : rows.length === 0 ? <EmptyState title="Nothing due" /> : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th><input type="checkbox" aria-label="All" checked={picked.length === rows.length} onChange={(e) => setPicked(e.target.checked ? rows.map((b) => b.id) : [])} /></th><th>Bill</th><th>Supplier</th><th>Due</th><th className="text-right">Open</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><input type="checkbox" aria-label={b.number} checked={picked.includes(b.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, b.id] : picked.filter((x) => x !== b.id))} /></td>
                  <td><Link className={linkCls} href={`/finance/bills/${b.id}`}>{b.number}</Link> <span className="text-slate-500">{b.supplierInvoiceNo}</span></td>
                  <td>{name(b.supplierId)}</td><td>{formatDate(b.dueDate)}</td><td className="text-right">{formatMoney(b.balanceDue, b.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 flex justify-end items-center gap-4">
            <span className="text-sm">{picked.length} selected · {formatMoney(total, rows[0]?.currency ?? "LKR")}</span>
            <button className="btn-primary" disabled={!picked.length || run.isPending} onClick={() => run.mutate()}><Banknote size={15} /> Pay selected</button>
          </div>
        </section>
      )}
    </div>
  );
}

interface Ageing { asOf: string; buckets: string[]; lines: { supplierId: string; buckets: Record<string, number>; credits: number; total: number }[]; totals: Record<string, number>; total: number }

export function PayablesAgeingPage() {
  const name = useSupplierName();
  const q = useQuery({ queryKey: ["finance-ap-ageing"], queryFn: () => api.get("/finance/payables/ageing").then((r) => r.data as Ageing) });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const a = q.data!;
  const m = (n: number) => (n ? formatMoney(n, "LKR") : "");
  return (
    <div className="space-y-6">
      <PageHeader title="Payables ageing" subtitle={`As at ${formatDate(a.asOf)} · days past due`} actions={<Link className="btn-primary" href="/finance/payment-run"><Banknote size={15} /> Payment run</Link>} />
      {a.lines.length === 0 ? <EmptyState title="Nothing owed" /> : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Supplier</th>{a.buckets.map((b) => <th key={b} className="text-right">{humanize(b)}</th>)}<th className="text-right">Advances</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {a.lines.map((l) => (
                <tr key={l.supplierId}>
                  <td><Link className={linkCls} href={`/finance/supplier-statement/${l.supplierId}`}>{name(l.supplierId)}</Link></td>
                  {a.buckets.map((b) => <td key={b} className="text-right">{m(l.buckets[b] ?? 0)}</td>)}
                  <td className="text-right">{l.credits ? `-${formatMoney(l.credits, "LKR")}` : ""}</td>
                  <td className="text-right font-medium">{formatMoney(l.total, "LKR")}</td>
                </tr>
              ))}
              <tr className="font-semibold"><td>Total</td>{a.buckets.map((b) => <td key={b} className="text-right">{m(a.totals[b] ?? 0)}</td>)}<td /><td className="text-right">{formatMoney(a.total, "LKR")}</td></tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

interface Statement {
  supplier: { id: string; name: string; code: string; currency: string };
  lines: { date: string; type: string; documentId: string; number: string; reference: string | null; currency: string; debit: number; credit: number; balance: number }[];
  balance: number;
}

export function SupplierStatementPage({ supplierId }: { supplierId: string }) {
  const q = useQuery({ queryKey: ["finance-supplier-statement", supplierId], queryFn: () => api.get(`/finance/payables/statement/${supplierId}`).then((r) => r.data as Statement) });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const s = q.data!;
  const href = (l: Statement["lines"][number]) => (l.type === "payment" ? `/finance/payments/${l.documentId}` : `/finance/bills/${l.documentId}`);
  return (
    <div className="space-y-6">
      <PageHeader title={`Supplier account: ${s.supplier.name}`} subtitle={`${s.supplier.code} · we owe ${formatMoney(s.balance, s.supplier.currency)}`} actions={<button className="btn-ghost print:hidden" onClick={() => window.print()}><FileText size={15} /> Print</button>} />
      <section className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Date</th><th>Document</th><th>Reference</th><th>Type</th><th className="text-right">Billed</th><th className="text-right">Paid / credited</th><th className="text-right">Balance</th></tr></thead>
          <tbody>
            {s.lines.map((l, i) => (
              <tr key={i}>
                <td>{formatDate(l.date)}</td><td><Link className={linkCls} href={href(l)}>{l.number}</Link></td><td>{l.reference ?? ""}</td><td>{humanize(l.type)}</td>
                <td className="text-right">{l.credit ? formatMoney(l.credit, l.currency) : ""}</td><td className="text-right">{l.debit ? formatMoney(l.debit, l.currency) : ""}</td>
                <td className="text-right">{formatMoney(l.balance, l.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

