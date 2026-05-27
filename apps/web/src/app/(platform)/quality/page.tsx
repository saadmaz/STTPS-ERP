"use client";

import { useQuery } from "@tanstack/react-query";
import { qualityApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ShieldCheck, ClipboardList, FileText, AlertTriangle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import Link from "next/link";
import { clsx } from "clsx";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "badge-green",
  MEDIUM: "badge-yellow",
  HIGH: "badge-red",
  CRITICAL: "badge-red",
};

export default function QualityOverviewPage() {
  const { activeCompany } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["quality-dashboard", activeCompany?.id],
    queryFn: () => qualityApi.dashboard(),
    enabled: !!activeCompany,
  });

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  const cards = [
    { label: "Total Inspections", value: data?.totalInspections ?? 0, sub: "all time", icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-50", href: "/quality/inspections" },
    { label: "Passed Inspections", value: data?.passedInspections ?? 0, sub: "result: PASS", icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50", href: "/quality/inspections" },
    { label: "Open NCRs", value: data?.openNCRs ?? 0, sub: "non-conformances", icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-50", href: "/quality/ncr" },
    { label: "Planned Audits", value: data?.plannedAudits ?? 0, sub: "upcoming / in-progress", icon: FileText, color: "text-violet-600", bg: "bg-violet-50", href: "/quality/audits" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Quality Management</h1>
          <p className="page-subtitle">Quality operations for {activeCompany?.name}</p>
        </div>
        <Link href="/quality/inspections" className="btn-primary">
          <ClipboardList size={16} /> New Inspection
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-5 hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} mb-3`}>
              <c.icon size={20} className={c.color} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="text-sm font-medium text-slate-700 mt-1">{c.label}</p>
            <p className="text-xs text-slate-400">{c.sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Open NCRs by Severity</h2>
          {data?.ncrsBySeverity?.length ? (
            <div className="space-y-2">
              {data.ncrsBySeverity.map((s: any) => (
                <div key={s.severity} className="flex items-center justify-between py-1">
                  <span className={clsx("badge", SEVERITY_COLORS[s.severity] ?? "badge-gray")}>{s.severity}</span>
                  <span className="text-sm font-semibold text-slate-700">{s._count._all}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No open NCRs</p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Non-Conformances</h2>
          {data?.recentNCRs?.length ? (
            <div className="space-y-3">
              {data.recentNCRs.map((n: any) => (
                <div key={n.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{n.number}</p>
                    <p className="text-xs text-slate-400">{n.title}</p>
                  </div>
                  <span className={clsx("badge", SEVERITY_COLORS[n.severity] ?? "badge-gray")}>{n.severity}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No NCRs yet</p>
          )}
        </div>
      </div>
    </div>
  );
}


