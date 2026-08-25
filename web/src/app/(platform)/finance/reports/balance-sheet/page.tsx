"use client";

import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });
const currentYear = new Date().getFullYear();

function Section({ title, rows, total, colorClass }: { title: string; rows: any[]; total: number; colorClass: string }) {
  return (
    <div className="card overflow-hidden">
      <div className={`px-4 py-3 border-b border-slate-100 ${colorClass}`}>
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <table className="table-base">
        <thead>
          <tr>
            <th>Code</th>
            <th>Account</th>
            <th className="text-right">Debit</th>
            <th className="text-right">Credit</th>
            <th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-2 text-sm font-mono text-slate-500">{r.code}</td>
              <td className="px-4 py-2 text-sm text-slate-800">{r.name}</td>
              <td className="px-4 py-2 text-sm text-right font-mono">{fmt(r.debit)}</td>
              <td className="px-4 py-2 text-sm text-right font-mono">{fmt(r.credit)}</td>
              <td className="px-4 py-2 text-sm text-right font-mono font-medium">{fmt(r.net)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-slate-400 text-sm">No accounts with activity</td></tr>}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200">
            <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-slate-700">Total {title}</td>
            <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{fmt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function BalanceSheetPage() {
  const { activeCompany } = useAuth();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [asOfPeriod, setAsOfPeriod] = useState(12);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["balance-sheet", activeCompany?.id, fiscalYear, asOfPeriod],
    queryFn: () => reportsApi.balanceSheet(fiscalYear, asOfPeriod),
    enabled: !!activeCompany,
  });

  const assets = data?.assets || [];
  const liabilities = data?.liabilities || [];
  const equity = data?.equity || [];
  const totalAssets = data?.totalAssets || 0;
  const totalLiabilities = data?.totalLiabilities || 0;
  const totalEquity = data?.totalEquity || 0;
  const isBalanced = data?.isBalanced ?? true;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Balance Sheet</h1>
          <p className="page-subtitle">Financial position of {activeCompany?.name}</p>
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
            <label className="form-label mb-1">As of Period</label>
            <select value={asOfPeriod} onChange={(e) => setAsOfPeriod(Number(e.target.value))} className="input-base">
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
          {/* Balance Check */}
          <div className={`card p-4 flex items-center gap-3 ${isBalanced ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            {isBalanced ? (
              <><CheckCircle size={18} className="text-green-600" /><span className="text-sm font-medium text-green-800">Balance sheet is balanced — Assets = Liabilities + Equity</span></>
            ) : (
              <><AlertCircle size={18} className="text-red-600" /><span className="text-sm font-medium text-red-800">Warning: Balance sheet is not balanced</span></>
            )}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="text-sm text-slate-500 mb-1">Total Assets</p>
              <p className="text-2xl font-bold font-mono text-blue-600">{fmt(totalAssets)}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-slate-500 mb-1">Total Liabilities</p>
              <p className="text-2xl font-bold font-mono text-red-600">{fmt(totalLiabilities)}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-slate-500 mb-1">Total Equity</p>
              <p className="text-2xl font-bold font-mono text-green-600">{fmt(totalEquity)}</p>
            </div>
          </div>

          <Section title="Assets" rows={assets} total={totalAssets} colorClass="bg-blue-50 text-blue-800" />
          <Section title="Liabilities" rows={liabilities} total={totalLiabilities} colorClass="bg-red-50 text-red-800" />
          <Section title="Equity" rows={equity} total={totalEquity} colorClass="bg-green-50 text-green-800" />

          {/* L + E Total */}
          <div className="card p-5 border-2 border-slate-200">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">Liabilities + Equity</span>
              <span className="text-2xl font-bold font-mono text-slate-900">{fmt(totalLiabilities + totalEquity)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


