"use client";

import { useQuery } from "@tanstack/react-query";
import { ErrorState, PageHeader, Spinner } from "@/components/ui/kit";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { salesApi } from "./config";

interface Breakdown { revenue: number; margin: number }
interface SalesAnalytics {
  range: { from?: string; to?: string };
  orderCount: number;
  revenue: number;
  averageOrderValue: number;
  margin: number;
  marginPct: number;
  byProduct: (Breakdown & { productId: string })[];
  byCustomer: (Breakdown & { accountId: string })[];
  byRep: (Breakdown & { ownerUserId: string; orders: number })[];
  quotes: { sent: number; converted: number; conversionRatePct: number; averageResponseDays: number | null };
  note: string;
}

function RevenueBars({ rows, label }: { rows: { key: string; revenue: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <ul className="space-y-2">
      {rows.slice(0, 10).map((r) => (
        <li key={r.key} className="text-sm">
          <div className="flex justify-between"><span className="truncate">{r.key}</span><span className="text-slate-500">{formatMoney(r.revenue, "LKR")}</span></div>
          <div className="h-2 rounded bg-slate-100 dark:bg-slate-800 mt-1"><div className="h-2 rounded bg-blue-500" style={{ width: `${(r.revenue / max) * 100}%` }} /></div>
        </li>
      ))}
      {rows.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No {label} yet.</p>}
    </ul>
  );
}

export function SalesOverview() {
  const q = useQuery({ queryKey: ["sales-analytics"], queryFn: () => salesApi.analytics() as Promise<SalesAnalytics> });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const a = q.data!;
  const pct = (n: number) => `${(n / 100).toFixed(1)}%`;
  const kpis = [
    { label: "Orders", value: String(a.orderCount) },
    { label: "Revenue", value: formatMoney(a.revenue, "LKR") },
    { label: "Avg. order value", value: formatMoney(a.averageOrderValue, "LKR") },
    { label: "Margin", value: `${formatMoney(a.margin, "LKR")} (${pct(a.marginPct)})` },
    { label: "Quote conversion", value: pct(a.quotes.conversionRatePct) },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Sales" subtitle="Revenue, margin and quote conversion" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="stat-card">
            <p className="text-xl font-semibold">{k.value}</p>
            <p className="text-sm text-slate-500">{k.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Revenue by product</h2>
          <RevenueBars rows={a.byProduct.map((p) => ({ key: p.productId, revenue: p.revenue }))} label="products" />
        </section>
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Revenue by customer</h2>
          <RevenueBars rows={a.byCustomer.map((c) => ({ key: c.accountId, revenue: c.revenue }))} label="customers" />
        </section>
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Revenue by rep</h2>
          <RevenueBars rows={a.byRep.map((r) => ({ key: r.ownerUserId, revenue: r.revenue }))} label="reps" />
        </section>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{a.note}</p>
    </div>
  );
}
