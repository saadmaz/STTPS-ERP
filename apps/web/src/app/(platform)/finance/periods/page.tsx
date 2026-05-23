"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { glApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { Loader2, CheckCircle, Lock, Calendar } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";

const STATUS_BADGES: Record<string, string> = {
  OPEN: "badge-green",
  CLOSED: "badge-slate",
  LOCKED: "badge-red",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function PeriodsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["gl-periods", activeCompany?.id, fiscalYear],
    queryFn: () => glApi.periods.list(fiscalYear),
    enabled: !!activeCompany,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Fiscal Periods</h1>
          <p className="page-subtitle">Manage accounting periods for {activeCompany?.name}</p>
        </div>
      </div>

      {/* Year Selector */}
      <div className="card mb-6 p-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="form-label mb-1">Fiscal Year</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiscalYear(fiscalYear - 1)}
                className="btn-secondary px-3 py-1.5"
              >
                ‹
              </button>
              <input
                type="number"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(Number(e.target.value))}
                className="input-base w-24 text-center"
                min={2020}
                max={2030}
              />
              <button
                onClick={() => setFiscalYear(fiscalYear + 1)}
                className="btn-secondary px-3 py-1.5"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : periods.length === 0 ? (
        <div className="card p-10 text-center">
          <Calendar size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">No periods found for FY {fiscalYear}</p>
          <p className="text-sm text-slate-400 mt-1">
            Fiscal periods are created automatically when journal entries are posted. Use the seed data to initialize periods.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(periods as any[]).map((p: any) => (
            <div
              key={p.id}
              className={clsx(
                "card p-5 border-2",
                p.status === "OPEN" ? "border-green-200" : p.status === "LOCKED" ? "border-red-200" : "border-slate-200",
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {p.status === "LOCKED" ? (
                    <Lock size={14} className="text-red-500" />
                  ) : p.status === "OPEN" ? (
                    <CheckCircle size={14} className="text-green-500" />
                  ) : (
                    <Calendar size={14} className="text-slate-400" />
                  )}
                  <span className="font-semibold text-slate-900">
                    {MONTHS[p.period - 1]}
                  </span>
                </div>
                <span className={clsx("badge text-xs", STATUS_BADGES[p.status] || "badge-slate")}>
                  {p.status}
                </span>
              </div>
              <p className="text-xs text-slate-500">Period {p.period}</p>
              {p.startDate && (
                <p className="text-xs text-slate-400 mt-1">
                  {format(new Date(p.startDate), "d MMM")} – {format(new Date(p.endDate), "d MMM yyyy")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
