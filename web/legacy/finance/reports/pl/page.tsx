"use client";

import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });
const currentYear = new Date().getFullYear();

export default function PlReportPage() {
  const { activeCompany } = useAuth();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [fromPeriod, setFromPeriod] = useState(1);
  const [toPeriod, setToPeriod] = useState(12);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pl-report", activeCompany?.id, fiscalYear, fromPeriod, toPeriod],
    queryFn: () => reportsApi.pl(fiscalYear, fromPeriod, toPeriod),
    enabled: !!activeCompany,
  });

  const revenue = data?.revenue || [];
  const expenses = data?.expenses || [];
  const totalRevenue = data?.totalRevenue || 0;
  const totalExpenses = data?.totalExpenses || 0;
  const netProfit = data?.netProfit || 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Profit & Loss Statement</h1>
          <p className="page-subtitle">Revenue and expense summary for {activeCompany?.name}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6 p-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="form-label mb-1">Fiscal Year</label>
            <input
              type="number"
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              className="input-base w-28"
              min={2020}
              max={2030}
            />
          </div>
          <div>
            <label className="form-label mb-1">From Period</label>
            <select value={fromPeriod} onChange={(e) => setFromPeriod(Number(e.target.value))} className="input-base">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>Period {p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label mb-1">To Period</label>
            <select value={toPeriod} onChange={(e) => setToPeriod(Number(e.target.value))} className="input-base">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>Period {p}</option>
              ))}
            </select>
          </div>
          <div className="pt-5">
            <button onClick={() => refetch()} className="btn-primary">Run Report</button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="text-green-500" />
                <span className="text-sm text-slate-500">Total Revenue</span>
              </div>
              <p className="text-2xl font-bold font-mono text-green-600">{fmt(totalRevenue)}</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={16} className="text-red-500" />
                <span className="text-sm text-slate-500">Total Expenses</span>
              </div>
              <p className="text-2xl font-bold font-mono text-red-600">{fmt(totalExpenses)}</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Minus size={16} className={netProfit >= 0 ? "text-blue-500" : "text-red-500"} />
                <span className="text-sm text-slate-500">Net Profit</span>
              </div>
              <p className={`text-2xl font-bold font-mono ${netProfit >= 0 ? "text-blue-600" : "text-red-600"}`}>{fmt(netProfit)}</p>
            </div>
          </div>

          {/* Revenue */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-green-50">
              <h3 className="font-semibold text-green-800 text-sm">Revenue</h3>
            </div>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th className="text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {revenue.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 text-sm font-mono text-slate-500">{r.code}</td>
                    <td className="px-4 py-2 text-sm text-slate-800">{r.name}</td>
                    <td className="px-4 py-2 text-sm text-right font-mono">{fmt(r.debit)}</td>
                    <td className="px-4 py-2 text-sm text-right font-mono">{fmt(r.credit)}</td>
                    <td className="px-4 py-2 text-sm text-right font-mono font-medium text-green-700">{fmt(r.net)}</td>
                  </tr>
                ))}
                {revenue.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-slate-400 text-sm">No revenue accounts with activity</td></tr>}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-green-200 bg-green-50">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-green-800">Total Revenue</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-green-800">{fmt(totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Expenses */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-red-50">
              <h3 className="font-semibold text-red-800 text-sm">Expenses</h3>
            </div>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th className="text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e: any) => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 text-sm font-mono text-slate-500">{e.code}</td>
                    <td className="px-4 py-2 text-sm text-slate-800">{e.name}</td>
                    <td className="px-4 py-2 text-sm text-right font-mono">{fmt(e.debit)}</td>
                    <td className="px-4 py-2 text-sm text-right font-mono">{fmt(e.credit)}</td>
                    <td className="px-4 py-2 text-sm text-right font-mono font-medium text-red-700">{fmt(e.net)}</td>
                  </tr>
                ))}
                {expenses.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-slate-400 text-sm">No expense accounts with activity</td></tr>}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-red-200 bg-red-50">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-red-800">Total Expenses</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-red-800">{fmt(totalExpenses)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Net Profit Summary */}
          <div className={`card p-5 border-2 ${netProfit >= 0 ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold text-lg ${netProfit >= 0 ? "text-blue-800" : "text-red-800"}`}>
                {netProfit >= 0 ? "Net Profit" : "Net Loss"}
              </span>
              <span className={`text-2xl font-bold font-mono ${netProfit >= 0 ? "text-blue-800" : "text-red-800"}`}>
                {fmt(Math.abs(netProfit))}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


