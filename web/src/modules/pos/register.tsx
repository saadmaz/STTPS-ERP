"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { crmApi } from "@/modules/crm/config";
import { productsApi } from "@/modules/products/config";
import { Field, PageHeader, Spinner } from "@/components/ui/kit";
import { openShiftOptions, PAYMENT_METHODS, posApi, PosSale } from "./config";

interface CartLine { productId: string; name: string; sku: string; qty: string; unitPrice: string; discountPct: string }
interface PaymentRow { method: (typeof PAYMENT_METHODS)[number]; amount: string }

export function RegisterPage() {
  const router = useRouter();
  const { data: shiftOptions } = useQuery({ queryKey: openShiftOptions.queryKey, queryFn: openShiftOptions.load });
  const [shiftId, setShiftId] = useState("");
  const [accountId, setAccountId] = useState("");
  const { data: accounts } = useQuery({
    queryKey: ["options", "crm.accounts.register"],
    queryFn: async () => (await crmApi.accounts.list({ limit: 200 })).items.map((a) => ({ value: a.id, label: a.name })),
  });

  const [search, setSearch] = useState("");
  const { data: matches } = useQuery({
    queryKey: ["pos.register.search", search],
    queryFn: async () => (search.trim() ? (await productsApi.items.list({ q: search, limit: 8 })).items : []),
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const addToCart = (p: { id: string; name: string; sku: string; salesPrice: number }) => {
    setCart((prev) => (prev.some((l) => l.productId === p.id) ? prev.map((l) => (l.productId === p.id ? { ...l, qty: String(Number(l.qty) + 1) } : l)) : [...prev, { productId: p.id, name: p.name, sku: p.sku, qty: "1", unitPrice: "", discountPct: "" }]));
    setSearch("");
  };
  const setLine = (i: number, patch: Partial<CartLine>) => setCart((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setCart((prev) => prev.filter((_, idx) => idx !== i));

  const [redeemPoints, setRedeemPoints] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: "cash", amount: "" }]);
  const setPayment = (i: number, patch: Partial<PaymentRow>) => setPayments((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const [receipt, setReceipt] = useState<PosSale | null>(null);
  const charge = useMutation({
    mutationFn: () =>
      posApi.post<PosSale>("/pos/sales", {
        shiftId, accountId: accountId || undefined,
        lines: cart.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice || undefined, discountPct: l.discountPct || undefined })),
        payments: payments.filter((p) => p.amount).map((p) => ({ method: p.method, amount: p.amount })),
        redeemPoints: redeemPoints ? Number(redeemPoints) : undefined,
      }),
    onSuccess: (sale) => { setReceipt(sale); setCart([]); setPayments([{ method: "cash", amount: "" }]); setRedeemPoints(""); toast.success(`Sale ${sale.number} completed`); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (receipt) {
    return (
      <div className="space-y-6">
        <PageHeader title="Receipt" subtitle={receipt.number} />
        <section className="card p-5 max-w-sm space-y-3">
          {receipt.lines.map((l) => (
            <div key={l.lineId} className="flex justify-between text-sm"><span>{l.description} × {(l.qty / 1000).toFixed(2)}</span><span>{formatMoney(l.total, receipt.currency)}</span></div>
          ))}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between font-semibold"><span>Total</span><span>{formatMoney(receipt.totals.total, receipt.currency)}</span></div>
          {receipt.loyaltyPointsEarned > 0 && <p className="text-xs text-slate-500">Earned {receipt.loyaltyPointsEarned} loyalty point(s).</p>}
          <div className="flex gap-2 pt-2">
            <button className="btn-primary" onClick={() => setReceipt(null)}>New sale</button>
            <button className="btn-ghost" onClick={() => router.push(`/pos/sales/${receipt.id}`)}>View sale</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Register" subtitle="Ring up a sale against an open shift." />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <section className="card p-4 grid sm:grid-cols-2 gap-4">
            <Field label="Shift" required>
              <select className="input-base" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                <option value="">Select an open shift…</option>
                {shiftOptions?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Customer (optional)">
              <select className="input-base" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Walk-in</option>
                {accounts?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </section>
          <section className="card p-4 space-y-3">
            <Field label="Find a product"><input className="input-base" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or SKU" /></Field>
            {matches && matches.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-200 dark:divide-slate-700">
                {matches.map((p) => (
                  <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex justify-between" onClick={() => addToCart(p)}>
                    <span>{p.name} <span className="text-slate-400">({p.sku})</span></span>
                    <span>{formatMoney(p.salesPrice, p.currency)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="card overflow-x-auto">
            <h2 className="font-semibold px-4 pt-4 mb-2">Cart</h2>
            <table className="table-base">
              <thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Discount %</th><th /></tr></thead>
              <tbody>
                {cart.map((l, i) => (
                  <tr key={l.productId}>
                    <td>{l.name}</td>
                    <td><input className="input-base w-20" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></td>
                    <td><input className="input-base w-28" placeholder="list price" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
                    <td><input className="input-base w-20" value={l.discountPct} onChange={(e) => setLine(i, { discountPct: e.target.value })} /></td>
                    <td><button className="btn-ghost" aria-label="Remove" onClick={() => removeLine(i)}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
                {cart.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-6">Search for a product to add it to the cart.</td></tr>}
              </tbody>
            </table>
          </section>
        </div>
        <div className="space-y-4">
          <section className="card p-4 space-y-3">
            <h2 className="font-semibold">Payment</h2>
            {payments.map((p, i) => (
              <div key={i} className="flex gap-2">
                <select className="input-base" value={p.method} onChange={(e) => setPayment(i, { method: e.target.value as (typeof PAYMENT_METHODS)[number] })}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <input className="input-base" placeholder="Amount" value={p.amount} onChange={(e) => setPayment(i, { amount: e.target.value })} />
                {payments.length > 1 && <button className="btn-ghost" onClick={() => setPayments((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>}
              </div>
            ))}
            <button className="btn-ghost" onClick={() => setPayments((prev) => [...prev, { method: "cash", amount: "" }])}>Split payment</button>
            {accountId && <Field label="Redeem loyalty points"><input className="input-base" value={redeemPoints} onChange={(e) => setRedeemPoints(e.target.value)} /></Field>}
            <button className="btn-primary w-full" disabled={!shiftId || cart.length === 0 || charge.isPending} onClick={() => charge.mutate()}>
              {charge.isPending && <Spinner size={14} className="text-white" />} Charge
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
