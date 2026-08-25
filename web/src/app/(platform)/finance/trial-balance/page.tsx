"use client";

import { useQuery } from "@tanstack/react-query";
import { glApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { clsx } from "clsx";

const TYPE_COLORS: Record<string, string> = {
  ASSET: "text-blue-700",
  LIABILITY: "text-red-700",
  EQUITY: "text-green-700",
  REVENUE: "text-emerald-700",
  EXPENSE: "text-orange-700",
};

export default function TrialBalancePage() {
  const { activeCompany } = useAuth();
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);

  const { data: trialBalance = [], isLoading } = useQuery({
    queryKey: ["trial-balance", activeCompany?.id, fiscalYear],
    queryFn: () => glApi.trialBalance(fiscalYear),
    enabled: !!activeCompany,
  });

  const totalDebit = trialBalance.reduce((s: number, a: any) => s + a.debit, 0);
  const totalCredit = trialBalance.reduce((s: number, a: any) => s + a.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Trial Balance</h1>
          <p className="page-subtitle">All posted journals for fiscal year {fiscalYear}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={fiscalYear}
            onChange={(e) => setFiscalYear(Number(e.target.value))}
            className="input-base w-32"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account Name</th>
                  <th>Type</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th className="text-right">Net Balance</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.map((row: any) => (
                  <tr key={row.accountId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-sm">{row.code}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={clsx("text-xs font-semibold", TYPE_COLORS[row.type])}>
                        {row.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right font-mono text-slate-700">
                      {row.debit > 0 ? fmt(row.debit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right font-mono text-slate-700">
                      {row.credit > 0 ? fmt(row.credit) : "—"}
                    </td>
                    <td className={clsx(
                      "px-4 py-2.5 text-sm text-right font-mono font-medium",
                      row.balance >= 0 ? "text-slate-800" : "text-red-600",
                    )}>
                      {row.balance >= 0 ? fmt(row.balance) : `(${fmt(Math.abs(row.balance))})`}
                    </td>
                  </tr>
                ))}
                {trialBalance.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      No posted transactions for {fiscalYear}
                    </td>
                  </tr>
                )}
              </tbody>
              {trialBalance.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    <td colSpan={3} className="px-4 py-3 text-sm">Total</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">{fmt(totalDebit)}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">{fmt(totalCredit)}</td>
                    <td className={clsx(
                      "px-4 py-3 text-sm text-right font-mono",
                      isBalanced ? "text-green-700" : "text-red-700",
                    )}>
                      {isBalanced ? "✓ Balanced" : `✗ Diff: ${fmt(Math.abs(totalDebit - totalCredit))}`}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
