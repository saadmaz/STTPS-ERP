"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, FileMinus, FileText, Plus, ReceiptText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, EmptyState, ErrorState, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { crmApi } from "@/modules/crm/config";
import { Action } from "@/modules/sales/config";
import { useAccounts } from "./config";

export interface InvoiceLine {
  lineId: string;
  productId: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  taxCode: string | null;
  taxRate: number;
  net: number;
  tax: number;
  total: number;
}
export interface Invoice extends BaseRecord {
  number: string;
  kind: "invoice" | "credit_note";
  customerId: string;
  orderId: string | null;
  deliveryId: string | null;
  returnId: string | null;
  creditedInvoiceId: string | null;
  customerReference: string | null;
  date: string;
  dueDate: string;
  currency: string;
  lines: InvoiceLine[];
  totals: { subtotal: number; discount: number; tax: number; total: number };
  amountPaid: number;
  balanceDue: number;
  status: string;
  journalId: string | null;
  applications: { documentId: string; amount: number; date: string }[];
  notes: string | null;
}
export interface Receipt extends BaseRecord {
  number: string;
  customerId: string;
  date: string;
  currency: string;
  amount: number;
  method: string;
  reference: string | null;
  allocations: { invoiceId: string; amount: number }[];
  unallocated: number;
  status: string;
  journalId: string | null;
  notes: string | null;
}

export const arApi = {
  invoices: crud<Invoice>("/finance/invoices"),
  receipts: crud<Receipt>("/finance/receipts"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

const linkCls = "text-blue-700 dark:text-blue-400 hover:underline";
const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const qty = (n: number) => String(n / 1000);

export function useCustomerName() {
  const { data } = useQuery({ queryKey: ["options", "crm.accounts"], queryFn: () => crmApi.accounts.list({ limit: 200, sort: "nameLower" }) });
  return (id: string) => data?.items.find((a) => a.id === id)?.name ?? "…";
}

function CustomerLink({ id }: { id: string }) {
  const name = useCustomerName();
  return <Link className={linkCls} href={`/finance/statement/${id}`}>{name(id)}</Link>;
}

function InvoiceLines({ inv }: { inv: Invoice }) {
  return (
    <section className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Disc.</th><th>Tax</th><th className="text-right">Total</th></tr></thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.lineId}>
              <td>{l.description}</td><td>{qty(l.qty)}</td><td>{formatMoney(l.unitPrice, inv.currency)}</td>
              <td>{l.discountPct ? `${l.discountPct / 100}%` : "—"}</td><td>{l.taxCode ? `${l.taxCode} ${l.taxRate / 100}%` : "—"}</td>
              <td className="text-right">{formatMoney(l.total, inv.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto w-full max-w-xs p-4 space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(inv.totals.subtotal, inv.currency)}</dd></div>
        {inv.totals.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>-{formatMoney(inv.totals.discount, inv.currency)}</dd></div>}
        <div className="flex justify-between"><dt>Tax</dt><dd>{formatMoney(inv.totals.tax, inv.currency)}</dd></div>
        <div className="flex justify-between font-semibold border-t border-slate-200 dark:border-slate-800 pt-1"><dt>Total</dt><dd>{formatMoney(inv.totals.total, inv.currency)}</dd></div>
        <div className="flex justify-between"><dt>{inv.kind === "invoice" ? "Paid" : "Used"}</dt><dd>{formatMoney(inv.amountPaid, inv.currency)}</dd></div>
        <div className="flex justify-between font-semibold"><dt>{inv.kind === "invoice" ? "Balance due" : "Credit left"}</dt><dd>{formatMoney(inv.balanceDue, inv.currency)}</dd></div>
      </dl>
    </section>
  );
}

function ApplyCredit({ cn, refresh }: { cn: Invoice; refresh: (i: Invoice) => void }) {
  const can = useCan("finance.invoice.edit");
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const invoices = useQuery({
    queryKey: ["finance.invoice", "open-for", cn.customerId],
    queryFn: () => arApi.invoices.list({ where: `customerId:${cn.customerId}`, limit: 100 }),
    enabled: open,
  });
  const run = useMutation({
    mutationFn: () => arApi.post<{ creditNote: Invoice }>(`/finance/invoices/${cn.id}/apply-credit`, { invoiceId, amount }),
    onSuccess: (r) => { toast.success("Credit applied"); setOpen(false); refresh(r.creditNote); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  const choices = (invoices.data?.items ?? []).filter((i) => i.kind === "invoice" && ["posted", "partially_paid"].includes(i.status) && i.currency === cn.currency);
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><FileMinus size={15} /> Apply to invoice</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form className="card p-5 w-full max-w-md space-y-4 bg-white dark:bg-slate-900" onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
            <h2 className="font-semibold">Apply {cn.number}</h2>
            <Field label="Invoice" required>
              <select className="input-base" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                <option value="">Choose…</option>
                {choices.map((i) => <option key={i.id} value={i.id}>{i.number} · due {formatMoney(i.balanceDue, i.currency)}</option>)}
              </select>
            </Field>
            <Field label="Amount" required hint={`Up to ${formatMoney(cn.balanceDue, cn.currency)}`}><input className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={!invoiceId || !amount || run.isPending}>Apply</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function WriteOff({ inv, refresh }: { inv: Invoice; refresh: (i: Invoice) => void }) {
  const can = useCan("finance.invoice.delete");
  const accounts = useAccounts().filter((a) => a.type === "expense" && !a.isGroup);
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const run = useMutation({
    mutationFn: (reason: string) => arApi.post<Invoice>(`/finance/invoices/${inv.id}/write-off`, { accountId, reason }),
    onSuccess: (r) => { toast.success("Written off"); setOpen(false); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><Trash2 size={15} /> Write off</button>
      <ConfirmDialog
        open={open} title={`Write off ${formatMoney(inv.balanceDue, inv.currency)}?`} confirmLabel="Write off" danger reason="required" busy={run.isPending}
        onConfirm={(why) => (accountId ? run.mutate(why) : toast.error("Choose the bad-debt account"))} onClose={() => setOpen(false)}
      >
        <Field label="Bad-debt account" required>
          <select className="input-base" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Choose…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
      </ConfirmDialog>
    </>
  );
}

const invoices: MasterConfig<Invoice> = {
  entityType: "finance.invoice",
  permission: "finance.invoice",
  plural: "Invoices and credit notes",
  singular: "Invoice",
  route: "/finance/invoices",
  client: arApi.invoices,
  defaultSort: "-date",
  createHref: "/finance/new/invoice",
  columns: [
    { key: "number", label: "Number" },
    { key: "customerId", label: "Customer", render: (r) => <CustomerLink id={r.customerId} /> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "dueDate", label: "Due", render: (r) => (r.kind === "invoice" ? formatDate(r.dueDate) : "") },
    { key: "total", label: "Total", render: (r) => `${r.kind === "credit_note" ? "-" : ""}${formatMoney(r.totals.total, r.currency)}`, text: (r) => String(r.totals.total / 100) },
    { key: "balanceDue", label: "Open", render: (r) => formatMoney(r.balanceDue, r.currency), text: (r) => String(r.balanceDue / 100) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "kind", label: "Type", options: opts(["invoice", "credit_note"]) },
    { key: "status", label: "Status", options: opts(["draft", "posted", "partially_paid", "paid", "written_off", "cancelled"]) },
  ],
  fields: [
    { key: "dueDate", label: "Due date", type: "date" },
    { key: "customerReference", label: "Customer reference", type: "text" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => `${r.kind === "credit_note" ? "Credit note" : "Invoice"} ${r.number}`,
  subtitle: (r) => `${formatMoney(r.totals.total, r.currency)} · ${formatDate(r.date)}${r.kind === "invoice" ? ` · due ${formatDate(r.dueDate)}` : ""}`,
  status: (r) => r.status,
  editable: (r) => r.status === "draft",
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && <Action<Invoice> label="Post" icon={CheckCircle2} path={`/finance/invoices/${r.id}/post`} permission="finance.invoice.edit" onDone={refresh} confirm="Post to the customer's account?" />}
      {r.status === "draft" && <Action<Invoice> label="Cancel" icon={Ban} path={`/finance/invoices/${r.id}/cancel`} permission="finance.invoice.edit" onDone={refresh} danger />}
      {r.kind === "invoice" && ["posted", "partially_paid"].includes(r.status) && <Link className="btn-primary" href={`/finance/new/receipt?customer=${r.customerId}&invoice=${r.id}`}><ReceiptText size={15} /> Record payment</Link>}
      {r.kind === "invoice" && ["posted", "partially_paid", "paid"].includes(r.status) && <Link className="btn-ghost" href={`/finance/new/invoice?credit=${r.id}`}><FileMinus size={15} /> Credit note</Link>}
      {r.kind === "credit_note" && ["posted", "partially_paid"].includes(r.status) && <ApplyCredit cn={r} refresh={refresh} />}
      {r.kind === "invoice" && ["posted", "partially_paid"].includes(r.status) && <WriteOff inv={r} refresh={refresh} />}
    </>
  ),
  details: (r) => [
    { label: "Customer", value: <CustomerLink id={r.customerId} /> },
    { label: "Customer reference", value: r.customerReference },
    { label: "Sales order", value: r.orderId ? <Link className={linkCls} href={`/sales/orders/${r.orderId}`}>Open order</Link> : null },
    { label: "Delivery", value: r.deliveryId ? <Link className={linkCls} href={`/sales/deliveries/${r.deliveryId}`}>Open delivery</Link> : null },
    { label: "Credits", value: r.creditedInvoiceId ? <Link className={linkCls} href={`/finance/invoices/${r.creditedInvoiceId}`}>Original invoice</Link> : null },
    { label: "Journal", value: r.journalId ? <Link className={linkCls} href={`/finance/journals/${r.journalId}`}>Open journal</Link> : null },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <InvoiceLines inv={r} />,
};

function Allocations({ r }: { r: Receipt }) {
  const q = useQuery({ queryKey: ["finance.receipt", "allocations", r.id], queryFn: () => Promise.all(r.allocations.map((a) => arApi.invoices.get(a.invoiceId))) });
  return (
    <section className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>Invoice</th><th className="text-right">Settled</th></tr></thead>
        <tbody>
          {r.allocations.map((a, i) => (
            <tr key={a.invoiceId}><td><Link className={linkCls} href={`/finance/invoices/${a.invoiceId}`}>{q.data?.[i]?.number ?? "…"}</Link></td><td className="text-right">{formatMoney(a.amount, r.currency)}</td></tr>
          ))}
          {r.unallocated > 0 && <tr><td>On account (credit)</td><td className="text-right">{formatMoney(r.unallocated, r.currency)}</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

const receipts: MasterConfig<Receipt> = {
  entityType: "finance.receipt",
  permission: "finance.receipt",
  plural: "Customer receipts",
  singular: "Receipt",
  route: "/finance/receipts",
  client: arApi.receipts,
  defaultSort: "-date",
  createHref: "/finance/new/receipt",
  columns: [
    { key: "number", label: "Number" },
    { key: "customerId", label: "Customer", render: (r) => <CustomerLink id={r.customerId} /> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "method", label: "Method", render: (r) => humanize(r.method) },
    { key: "amount", label: "Amount", render: (r) => formatMoney(r.amount, r.currency), text: (r) => String(r.amount / 100) },
    { key: "unallocated", label: "Unallocated", render: (r) => (r.unallocated ? formatMoney(r.unallocated, r.currency) : "") },
  ],
  fields: [{ key: "notes", label: "Notes", type: "textarea", wide: true }],
  title: (r) => r.number,
  subtitle: (r) => `${formatMoney(r.amount, r.currency)} · ${formatDate(r.date)}${r.reference ? ` · ${r.reference}` : ""}`,
  status: (r) => r.status,
  details: (r) => [
    { label: "Customer", value: <CustomerLink id={r.customerId} /> },
    { label: "Method", value: humanize(r.method) },
    { label: "Reference", value: r.reference },
    { label: "Journal", value: r.journalId ? <Link className={linkCls} href={`/finance/journals/${r.journalId}`}>Open journal</Link> : null },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <Allocations r={r} />,
};

export const AR_SCREENS: Record<string, MasterConfig<never>> = {
  invoices: invoices as unknown as MasterConfig<never>,
  receipts: receipts as unknown as MasterConfig<never>,
};

// ─── Forms ────────────────────────────────────────────────────────────────────

function useCustomers() {
  const q = useQuery({ queryKey: ["options", "crm.accounts.active"], queryFn: () => crmApi.accounts.list({ limit: 200, sort: "nameLower", where: "status:active" }) });
  return q.data?.items ?? [];
}

interface LineForm { description: string; qty: string; unitPrice: string; taxCode: string }
const blank = (): LineForm => ({ description: "", qty: "1", unitPrice: "", taxCode: "" });

function NewInvoiceInner() {
  const router = useRouter();
  const params = useSearchParams();
  const creditOf = params.get("credit") ?? "";
  const customers = useCustomers();
  const credited = useQuery({ queryKey: ["finance.invoice", "one", creditOf], queryFn: () => arApi.invoices.get(creditOf), enabled: !!creditOf });
  const settings = useQuery({ queryKey: ["sales-settings"], queryFn: () => api.get("/sales/settings").then((r) => r.data as { taxRates: { code: string; name: string }[] }) });
  const [chosenCustomer, setCustomerId] = useState("");
  const customerId = chosenCustomer || credited.data?.customerId || "";
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<LineForm[]>([blank()]);
  const isCredit = !!creditOf;
  const save = useMutation({
    mutationFn: () => arApi.invoices.create({
      customerId, date, kind: isCredit ? "credit_note" : "invoice", creditedInvoiceId: creditOf || undefined, customerReference: reference || undefined,
      currency: credited.data?.currency,
      lines: lines.filter((l) => l.description && l.unitPrice).map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, taxCode: l.taxCode || undefined })),
    }),
    onSuccess: (inv) => { toast.success(`${inv.number} saved as draft`); router.push(`/finance/invoices/${inv.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (i: number, patch: Partial<LineForm>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  if (creditOf && credited.isLoading) return <Spinner />;
  return (
    <form className="max-w-5xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title={isCredit ? `Credit note for ${credited.data?.number ?? ""}` : "New invoice"} subtitle="Saved as a draft; post it to the customer's account from the invoice page." />
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Customer" required>
          <select className="input-base" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={isCredit}>
            <option value="">Choose…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        </Field>
        <Field label="Date" required><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Customer reference"><input className="input-base" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </section>
      <section className="card p-5 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input className="input-base col-span-12 sm:col-span-5" placeholder="Description" value={l.description} onChange={(e) => set(i, { description: e.target.value })} aria-label="Description" />
            <input className="input-base col-span-3 sm:col-span-1" placeholder="Qty" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label="Quantity" />
            <input className="input-base col-span-4 sm:col-span-2" placeholder="Unit price" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} aria-label="Unit price" />
            <select className="input-base col-span-4 sm:col-span-3" value={l.taxCode} onChange={(e) => set(i, { taxCode: e.target.value })} aria-label="Tax">
              <option value="">Tax (default)</option>
              {(settings.data?.taxRates ?? []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
            <button type="button" className="btn-ghost col-span-1" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" className="btn-ghost text-blue-600" onClick={() => setLines([...lines, blank()])}><Plus size={14} /> Line</button>
      </section>
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href="/finance/invoices">Cancel</Link>
        <button className="btn-primary" disabled={!customerId || save.isPending || !lines.some((l) => l.description && l.unitPrice)}>Save draft</button>
      </div>
    </form>
  );
}

function NewReceiptInner() {
  const router = useRouter();
  const params = useSearchParams();
  const customers = useCustomers();
  const banks = useAccounts().filter((a) => !a.isGroup && (a.subtype === "bank" || a.subtype === "cash"));
  const [customerId, setCustomerId] = useState(params.get("customer") ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [bankAccountId, setBank] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const invoiceId = params.get("invoice");
  const open = useQuery({
    queryKey: ["finance.invoice", "open-for", customerId],
    queryFn: () => arApi.invoices.list({ where: `customerId:${customerId}`, limit: 100 }),
    enabled: !!customerId,
  });
  const due = (open.data?.items ?? []).filter((i) => i.kind === "invoice" && ["posted", "partially_paid"].includes(i.status));
  const save = useMutation({
    mutationFn: () => arApi.receipts.create({
      customerId, date, amount, bankAccountId: bankAccountId || undefined, method, reference: reference || undefined,
      allocations: invoiceId ? [{ invoiceId, amount }] : undefined,
    }),
    onSuccess: (r) => { toast.success(`${r.number} recorded`); router.push(`/finance/receipts/${r.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form className="max-w-3xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title="Record a customer payment" subtitle={invoiceId ? "Applied to the chosen invoice." : "Settles the oldest open invoices first; any extra stays on account."} />
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Customer" required>
          <select className="input-base" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Choose…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        </Field>
        <Field label="Date" required><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Amount" required><input className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Into">
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
      {due.length > 0 && (
        <section className="card p-5 text-sm">
          <h2 className="font-semibold mb-2">Open invoices</h2>
          <ul className="space-y-1">{due.map((i) => <li key={i.id} className="flex justify-between"><span>{i.number} · due {formatDate(i.dueDate)}</span><span>{formatMoney(i.balanceDue, i.currency)}</span></li>)}</ul>
        </section>
      )}
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href="/finance/receipts">Cancel</Link>
        <button className="btn-primary" disabled={!customerId || !amount || save.isPending}>Record payment</button>
      </div>
    </form>
  );
}

const NEW: Record<string, () => React.ReactElement> = { invoice: NewInvoiceInner, receipt: NewReceiptInner };

export function NewArDocument({ kind }: { kind: string }) {
  const Form = NEW[kind];
  if (!Form) notFound();
  return <Suspense fallback={<Spinner />}><Form /></Suspense>;
}

// ─── Ageing and statements ────────────────────────────────────────────────────

interface Ageing {
  asOf: string;
  buckets: string[];
  lines: { customerId: string; buckets: Record<string, number>; credits: number; total: number }[];
  totals: Record<string, number>;
  total: number;
}

export function AgeingPage() {
  const name = useCustomerName();
  const q = useQuery({ queryKey: ["finance-ageing"], queryFn: () => api.get("/finance/receivables/ageing").then((r) => r.data as Ageing) });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const a = q.data!;
  const m = (n: number) => (n ? formatMoney(n, "LKR") : "");
  return (
    <div className="space-y-6">
      <PageHeader title="Receivables ageing" subtitle={`As at ${formatDate(a.asOf)} · days past due`} />
      {a.lines.length === 0 ? <EmptyState title="Nothing outstanding" /> : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Customer</th>{a.buckets.map((b) => <th key={b} className="text-right">{humanize(b)}</th>)}<th className="text-right">Credits</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {a.lines.map((l) => (
                <tr key={l.customerId}>
                  <td><Link className={linkCls} href={`/finance/statement/${l.customerId}`}>{name(l.customerId)}</Link></td>
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
  customer: { id: string; name: string; code: string; currency: string };
  lines: { date: string; type: string; documentId: string; number: string; currency: string; debit: number; credit: number; balance: number; dueDate: string | null }[];
  balance: number;
}

export function StatementPage({ customerId }: { customerId: string }) {
  const q = useQuery({ queryKey: ["finance-statement", customerId], queryFn: () => api.get(`/finance/receivables/statement/${customerId}`).then((r) => r.data as Statement) });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const s = q.data!;
  const href = (l: Statement["lines"][number]) => (l.type === "receipt" ? `/finance/receipts/${l.documentId}` : `/finance/invoices/${l.documentId}`);
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Statement: ${s.customer.name}`}
        subtitle={`${s.customer.code} · balance ${formatMoney(s.balance, s.customer.currency)}`}
        actions={<><Link className="btn-secondary" href={`/finance/new/receipt?customer=${customerId}`}><ReceiptText size={15} /> Record payment</Link><button className="btn-ghost print:hidden" onClick={() => window.print()}><FileText size={15} /> Print</button></>}
      />
      <section className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Date</th><th>Document</th><th>Type</th><th>Due</th><th className="text-right">Charges</th><th className="text-right">Credits</th><th className="text-right">Balance</th></tr></thead>
          <tbody>
            {s.lines.map((l, i) => (
              <tr key={i}>
                <td>{formatDate(l.date)}</td><td><Link className={linkCls} href={href(l)}>{l.number}</Link></td><td>{humanize(l.type)}</td><td>{formatDate(l.dueDate)}</td>
                <td className="text-right">{l.debit ? formatMoney(l.debit, l.currency) : ""}</td><td className="text-right">{l.credit ? formatMoney(l.credit, l.currency) : ""}</td>
                <td className="text-right">{formatMoney(l.balance, l.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
