"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { EmptyState, ErrorState, Field, PageHeader, Spinner } from "@/components/ui/kit";
import { productsApi } from "@/modules/products/config";
import { crmApi } from "@/modules/crm/config";
import { useProductNames } from "@/modules/inventory/config";
import { SALES_SCREENS, salesApi } from "./config";

export function SalesList({ entity }: { entity: string }) {
  const config = SALES_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function SalesRecord({ entity, id }: { entity: string; id: string }) {
  const config = SALES_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}

// ─── Sales settings: tax codes, effective-dated rates, inclusive pricing ──────

interface SalesSettings {
  taxRates: { code: string; name: string; rate: number; effectiveRates?: { rate: number; effectiveDate: string }[] }[];
  defaultTaxCode: string | null;
  discountApprovalPct: number;
  pricesIncludeTax: boolean;
}
interface EffectiveRateForm { rate: string; effectiveDate: string }
interface TaxRateForm { code: string; name: string; rate: string; effectiveRates: EffectiveRateForm[] }

const toRateForm = (t: SalesSettings["taxRates"][number]): TaxRateForm => ({
  code: t.code, name: t.name, rate: String(t.rate / 100),
  effectiveRates: (t.effectiveRates ?? []).map((r) => ({ rate: String(r.rate / 100), effectiveDate: r.effectiveDate })),
});
const blankTaxRate = (): TaxRateForm => ({ code: "", name: "", rate: "", effectiveRates: [] });

export function SalesSettingsPage() {
  const qc = useQueryClient();
  const can = useCan("sales.settings.edit");
  const settings = useQuery({ queryKey: ["sales-settings-full"], queryFn: () => api.get("/sales/settings").then((r) => r.data as SalesSettings) });
  const [rates, setRates] = useState<TaxRateForm[] | null>(null);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put("/sales/settings", body).then((r) => r.data as SalesSettings),
    onSuccess: () => { toast.success("Sales settings saved"); setRates(null); qc.invalidateQueries({ queryKey: ["sales-settings-full"] }); qc.invalidateQueries({ queryKey: ["sales-settings"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (settings.isLoading) return <Spinner />;
  if (settings.isError) return <ErrorState message={errorMessage(settings.error)} />;
  const data = settings.data!;
  const rows = rates ?? data.taxRates.map(toRateForm);
  const setRow = (i: number, patch: Partial<TaxRateForm>) => setRates(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const saveRates = () =>
    save.mutate({
      taxRates: rows.filter((r) => r.code && r.name && r.rate).map((r) => ({
        code: r.code, name: r.name, rate: r.rate,
        effectiveRates: r.effectiveRates.filter((e) => e.rate && e.effectiveDate),
      })),
    });
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Sales settings" subtitle="Tax codes, effective-dated rate changes, discount approval and inclusive pricing." />
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Tax codes</h2>
        {rows.map((r, i) => (
          <div key={i} className="rounded border border-slate-200 dark:border-slate-800 p-3 space-y-2">
            <div className="grid grid-cols-12 gap-2">
              <input className="input-base col-span-2" placeholder="Code" value={r.code} disabled={!can} onChange={(e) => setRow(i, { code: e.target.value })} aria-label="Code" />
              <input className="input-base col-span-4" placeholder="Name" value={r.name} disabled={!can} onChange={(e) => setRow(i, { name: e.target.value })} aria-label="Name" />
              <input className="input-base col-span-2" placeholder="Rate %" value={r.rate} disabled={!can} onChange={(e) => setRow(i, { rate: e.target.value })} aria-label="Rate" />
              <div className="col-span-3 self-center text-xs text-slate-500">{r.effectiveRates.length ? `${r.effectiveRates.length} scheduled change(s)` : "No scheduled changes"}</div>
              {can && <button type="button" className="btn-ghost col-span-1" onClick={() => setRates(rows.filter((_, j) => j !== i))} aria-label="Remove tax code"><Trash2 size={15} /></button>}
            </div>
            {r.effectiveRates.map((e, j) => (
              <div key={j} className="grid grid-cols-12 gap-2 pl-4">
                <span className="col-span-2 self-center text-xs text-slate-500">From</span>
                <input type="date" className="input-base col-span-3" value={e.effectiveDate} disabled={!can} onChange={(ev) => setRow(i, { effectiveRates: r.effectiveRates.map((x, k) => (k === j ? { ...x, effectiveDate: ev.target.value } : x)) })} aria-label="Effective date" />
                <input className="input-base col-span-2" placeholder="New rate %" value={e.rate} disabled={!can} onChange={(ev) => setRow(i, { effectiveRates: r.effectiveRates.map((x, k) => (k === j ? { ...x, rate: ev.target.value } : x)) })} aria-label="New rate" />
                {can && <button type="button" className="btn-ghost col-span-1" onClick={() => setRow(i, { effectiveRates: r.effectiveRates.filter((_, k) => k !== j) })} aria-label="Remove scheduled change"><Trash2 size={14} /></button>}
              </div>
            ))}
            {can && (
              <button type="button" className="btn-ghost text-sm text-blue-600" onClick={() => setRow(i, { effectiveRates: [...r.effectiveRates, { rate: "", effectiveDate: "" }] })}>
                <Plus size={13} /> Scheduled change
              </button>
            )}
          </div>
        ))}
        {can && (
          <div className="flex items-center justify-between">
            <button type="button" className="btn-ghost text-blue-600" onClick={() => setRates([...rows, blankTaxRate()])}><Plus size={14} /> Tax code</button>
            <button type="button" className="btn-primary" disabled={save.isPending} onClick={saveRates}>Save tax codes</button>
          </div>
        )}
      </section>
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Default tax code">
          <select className="input-base" defaultValue={data.defaultTaxCode ?? ""} disabled={!can} onChange={(e) => save.mutate({ defaultTaxCode: e.target.value || null })}>
            <option value="">None</option>
            {data.taxRates.map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
          </select>
        </Field>
        <Field label="Discount needing approval over" hint="Percent">
          <input className="input-base" defaultValue={String(data.discountApprovalPct / 100)} disabled={!can} onBlur={(e) => e.target.value && save.mutate({ discountApprovalPct: e.target.value })} />
        </Field>
      </section>
      <section className="card p-5">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={data.pricesIncludeTax} disabled={!can || save.isPending} onChange={(e) => save.mutate({ pricesIncludeTax: e.target.checked })} />
          Quote and order prices are tax-inclusive; the exclusive net price is what gets stored
        </label>
      </section>
    </div>
  );
}

interface LineForm {
  productId: string;
  qty: string;
  unitPrice: string;
  discountPct: string;
  taxCode: string;
}

const blankLine = (): LineForm => ({ productId: "", qty: "1", unitPrice: "", discountPct: "", taxCode: "" });

/** New quote or sales order. Leave a price blank to use price lists and discount rules. */
export function NewSalesDocument({ kind }: { kind: string }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([blankLine()]);
  const accounts = useQuery({ queryKey: ["options", "crm.accounts"], queryFn: () => crmApi.accounts.list({ limit: 200, sort: "nameLower", where: "status:active" }) });
  const contacts = useQuery({ queryKey: ["crm.contact", "for", accountId], queryFn: () => crmApi.contacts.list({ where: `accountId:${accountId}`, limit: 100 }), enabled: !!accountId });
  const products = useQuery({ queryKey: ["options", "products.items"], queryFn: () => productsApi.items.list({ limit: 200 }) });
  const settings = useQuery({ queryKey: ["sales-settings"], queryFn: () => api.get("/sales/settings").then((r) => r.data as { taxRates: { code: string; name: string }[] }) });
  if (kind !== "quote" && kind !== "order") notFound();
  const isQuote = kind === "quote";

  const save = useMutation({
    mutationFn: (): Promise<{ id: string; number: string }> => {
      const body = {
        accountId,
        contactId: contactId || undefined,
        notes: notes || undefined,
        ...(isQuote ? {} : { customerReference: reference || undefined }),
        lines: lines.filter((l) => l.productId && l.qty).map((l) => ({
          productId: l.productId, qty: l.qty, unitPrice: l.unitPrice || undefined, discountPct: l.discountPct || undefined, taxCode: l.taxCode || undefined,
        })),
      };
      return isQuote ? salesApi.quotes.create(body) : salesApi.orders.create(body);
    },
    onSuccess: (doc) => {
      toast.success(`${doc.number} created`);
      router.push(`/sales/${isQuote ? "quotes" : "orders"}/${doc.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (i: number, patch: Partial<LineForm>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const sellable = (products.data?.items ?? []).filter((p) => p.isSellable && p.status === "active");

  return (
    <form className="max-w-5xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title={isQuote ? "New quote" : "New sales order"} subtitle="Prices left blank come from price lists and discount rules." />
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Customer" required>
          <select className="input-base" value={accountId} onChange={(e) => { setAccountId(e.target.value); setContactId(""); }}>
            <option value="">Choose…</option>
            {(accounts.data?.items ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
          </select>
        </Field>
        <Field label="Contact">
          <select className="input-base" value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={!accountId}>
            <option value="">None</option>
            {(contacts.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
          </select>
        </Field>
        {!isQuote && <Field label="Customer PO / reference"><input className="input-base" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
        <div className="sm:col-span-3"><Field label="Internal notes"><input className="input-base" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      </section>
      <section className="card p-5 space-y-2">
        <h2 className="font-semibold">Lines</h2>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <select className="input-base col-span-12 sm:col-span-4" value={l.productId} onChange={(e) => set(i, { productId: e.target.value })} aria-label="Product">
              <option value="">Product…</option>
              {sellable.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku}) · {formatMoney(p.salesPrice, p.currency)}</option>)}
            </select>
            <input className="input-base col-span-3 sm:col-span-2" placeholder="Qty" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label="Quantity" />
            <input className="input-base col-span-3 sm:col-span-2" placeholder="Price (auto)" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} aria-label="Unit price" />
            <input className="input-base col-span-2 sm:col-span-1" placeholder="Disc %" value={l.discountPct} onChange={(e) => set(i, { discountPct: e.target.value })} aria-label="Discount percent" />
            <select className="input-base col-span-3 sm:col-span-2" value={l.taxCode} onChange={(e) => set(i, { taxCode: e.target.value })} aria-label="Tax">
              <option value="">Tax (default)</option>
              {(settings.data?.taxRates ?? []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
            <button type="button" className="btn-ghost col-span-1" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" className="btn-ghost text-blue-600" onClick={() => setLines([...lines, blankLine()])}><Plus size={14} /> Line</button>
      </section>
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href={`/sales/${isQuote ? "quotes" : "orders"}`}>Cancel</Link>
        <button className="btn-primary" disabled={!accountId || save.isPending || !lines.some((l) => l.productId)}>Create {isQuote ? "quote" : "order"}</button>
      </div>
    </form>
  );
}

interface DeliveryView {
  id: string;
  number: string;
  lines: { productId: string; qty: number }[];
}

function NewReturnInner() {
  const router = useRouter();
  const params = useSearchParams();
  const deliveryId = params.get("delivery") ?? "";
  const name = useProductNames();
  const delivery = useQuery({ queryKey: ["sales.delivery", "one", deliveryId], queryFn: () => api.get(`/sales/deliveries/${deliveryId}`).then((r) => r.data as DeliveryView), enabled: !!deliveryId });
  const [reason, setReason] = useState("");
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const [damaged, setDamaged] = useState<Record<number, boolean>>({});
  const save = useMutation({
    mutationFn: () => salesApi.returns.create({
      deliveryId, reason,
      lines: Object.entries(qtys).filter(([, v]) => v).map(([i, v]) => ({ deliveryLineIndex: Number(i), qty: v, condition: damaged[Number(i)] ? "damaged" : "resellable" })),
    }),
    onSuccess: (r) => router.push(`/sales/returns/${r.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!deliveryId) return <EmptyState title="Open a delivery and choose Return" />;
  if (delivery.isLoading) return <Spinner />;
  if (delivery.isError) return <ErrorState message={errorMessage(delivery.error)} />;
  return (
    <form className="max-w-3xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title={`Return from ${delivery.data!.number}`} />
      <section className="card p-5 space-y-4">
        <Field label="Reason" required><input className="input-base" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <table className="table-base">
          <thead><tr><th>Product</th><th>Delivered</th><th>Return qty</th><th>Damaged</th></tr></thead>
          <tbody>
            {delivery.data!.lines.map((l, i) => (
              <tr key={i}>
                <td>{name(l.productId)}</td><td>{l.qty / 1000}</td>
                <td><input className="input-base w-24 py-1" value={qtys[i] ?? ""} onChange={(e) => setQtys({ ...qtys, [i]: e.target.value })} aria-label="Return quantity" /></td>
                <td><input type="checkbox" checked={!!damaged[i]} onChange={(e) => setDamaged({ ...damaged, [i]: e.target.checked })} aria-label="Damaged" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="flex justify-end"><button className="btn-primary" disabled={!reason || save.isPending}>Request return</button></div>
    </form>
  );
}

export function NewReturn() {
  return <Suspense fallback={<Spinner />}><NewReturnInner /></Suspense>;
}

interface PublicQuote {
  number: string;
  revision: number;
  company: { name: string; taxId: string | null };
  customer: { name: string };
  date: string;
  validUntil: string;
  expired: boolean;
  currency: string;
  lines: { description: string; qty: number; unitPrice: number; discountPct: number; taxRate: number; total: number }[];
  totals: { subtotal: number; discount: number; tax: number; total: number };
  terms: string | null;
  status: string;
}

/** What the customer sees from the emailed link. */
export function PublicQuotePage({ token }: { token: string }) {
  const [comment, setComment] = useState("");
  const quote = useQuery({ queryKey: ["public-quote", token], queryFn: () => api.get(`/public/quotes/${token}`).then((r) => r.data as PublicQuote), retry: false });
  const respond = useMutation({
    mutationFn: (accept: boolean) => api.post(`/public/quotes/${token}/${accept ? "accept" : "reject"}`, { comment: comment || undefined }),
    onSuccess: () => quote.refetch(),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (quote.isLoading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
  if (quote.isError) return <div className="min-h-screen flex items-center justify-center p-6"><ErrorState message={errorMessage(quote.error, "This link is not valid")} /></div>;
  const q = quote.data!;
  const open = q.status === "sent" && !q.expired;
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4">
      <div className="max-w-3xl mx-auto card p-6 sm:p-8 space-y-6">
        <header className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">{q.company.name}</p>
            {q.company.taxId && <p className="text-xs text-slate-500">Tax ID {q.company.taxId}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">Quotation</p>
            <p className="text-sm text-slate-500">{q.number}{q.revision > 1 ? ` rev ${q.revision}` : ""}</p>
            <p className="text-sm text-slate-500">{formatDate(q.date)} · valid until {formatDate(q.validUntil)}</p>
          </div>
        </header>
        <p className="text-sm">Prepared for <span className="font-medium">{q.customer.name}</span></p>
        <table className="table-base">
          <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Disc.</th><th>Tax</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {q.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td><td>{l.qty / 1000}</td><td>{formatMoney(l.unitPrice, q.currency)}</td>
                <td>{l.discountPct ? `${l.discountPct / 100}%` : "—"}</td><td>{l.taxRate ? `${l.taxRate / 100}%` : "—"}</td>
                <td className="text-right">{formatMoney(l.total, q.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto max-w-xs text-sm space-y-1">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(q.totals.subtotal, q.currency)}</dd></div>
          {q.totals.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>-{formatMoney(q.totals.discount, q.currency)}</dd></div>}
          <div className="flex justify-between"><dt>Tax</dt><dd>{formatMoney(q.totals.tax, q.currency)}</dd></div>
          <div className="flex justify-between text-base font-semibold border-t pt-1"><dt>Total</dt><dd>{formatMoney(q.totals.total, q.currency)}</dd></div>
        </dl>
        {q.terms && <section className="text-sm whitespace-pre-line text-slate-600 dark:text-slate-300"><h2 className="font-semibold mb-1">Terms</h2>{q.terms}</section>}
        {open ? (
          <section className="space-y-3 border-t pt-4">
            <textarea className="input-base" rows={2} placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" disabled={respond.isPending} onClick={() => respond.mutate(false)}>Decline</button>
              <button className="btn-primary" disabled={respond.isPending} onClick={() => respond.mutate(true)}>Accept quotation</button>
            </div>
          </section>
        ) : (
          <p className="border-t pt-4 text-sm font-medium">{q.expired ? "This quotation has expired." : `You ${humanize(q.status).toLowerCase()} this quotation. Thank you.`}</p>
        )}
        <button className="btn-ghost print:hidden" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
    </main>
  );
}
