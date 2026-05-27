"use client";

import { useQuery } from "@tanstack/react-query";
import { arApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Clock } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { format } from "date-fns";
import { clsx } from "clsx";
import Link from "next/link";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function ArAgingPage() {
  const { activeCompany } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["ar-aging", activeCompany?.id],
    queryFn: () => arApi.aging(),
    enabled: !!activeCompany,
  });

  const buckets = data?.buckets || {};
  const rows = data?.rows || [];
  const total = data?.total || 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">AR Aging Report</h1>
          <p className="page-subtitle">Outstanding receivables by due date</p>
        </div>
        <Link href="/finance/ar" className="btn-secondary">Back to AR</Link>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <>
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              { label: "Current", key: "current", color: "text-green-600" },
              { label: "1–30 Days", key: "days30", color: "text-yellow-600" },
              { label: "31–60 Days", key: "days60", color: "text-orange-600" },
              { label: "61–90 Days", key: "days90", color: "text-red-500" },
              { label: "Over 90 Days", key: "over90", color: "text-red-700" },
            ].map((b) => (
              <div key={b.key} className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={14} className="text-slate-400" />
                  <span className="text-xs font-medium text-slate-500">{b.label}</span>
                </div>
                <p className={clsx("text-xl font-bold font-mono", b.color)}>{fmt(buckets[b.key] || 0)}</p>
              </div>
            ))}
          </div>

          <div className="card p-4 mb-6 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">Total Outstanding</span>
            <span className="text-2xl font-bold font-mono text-slate-900">{fmt(total)}</span>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Customer</th>
                    <th>Invoice Date</th>
                    <th>Due Date</th>
                    <th className="text-right">Balance</th>
                    <th className="text-right">Days Overdue</th>
                    <th>Bucket</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv: any) => (
                    <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3"><span className="font-mono text-sm text-blue-700">{inv.number}</span></td>
                      <td className="px-4 py-3 text-sm text-slate-800">{inv.customer?.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{format(new Date(inv.date), "dd MMM yyyy")}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{format(new Date(inv.dueDate), "dd MMM yyyy")}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono font-medium">{fmt(Number(inv.balance))}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className={clsx("font-medium", inv.daysOverdue > 90 ? "text-red-700" : inv.daysOverdue > 60 ? "text-red-500" : inv.daysOverdue > 30 ? "text-orange-600" : inv.daysOverdue > 0 ? "text-yellow-600" : "text-green-600")}>
                          {inv.daysOverdue <= 0 ? "Current" : `${inv.daysOverdue}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {inv.daysOverdue <= 0 ? "Current" : inv.daysOverdue <= 30 ? "1–30" : inv.daysOverdue <= 60 ? "31–60" : inv.daysOverdue <= 90 ? "61–90" : "90+"}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-slate-400">No outstanding receivables.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


