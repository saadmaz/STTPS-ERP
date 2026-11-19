"use client";

import { useQuery } from "@tanstack/react-query";
import { ehsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, ShieldCheck, FileText, HardHat } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import Link from "next/link";
import { clsx } from "clsx";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "badge-green",
  MEDIUM: "badge-yellow",
  HIGH: "badge-red",
  CRITICAL: "badge-red",
};

export default function EhsOverviewPage() {
  const { activeCompany } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["ehs-dashboard", activeCompany?.id],
    queryFn: () => ehsApi.dashboard(),
    enabled: !!activeCompany,
  });

  if (isLoading) return <PageLoader />;

  const cards = [
    { label: "Open Incidents", value: data?.openIncidents ?? 0, sub: "not yet closed", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", href: "/ehs/incidents" },
    { label: "30-Day Incidents", value: data?.recentIncidents ?? 0, sub: "last 30 days", icon: HardHat, color: "text-orange-600", bg: "bg-orange-50", href: "/ehs/incidents" },
    { label: "Active Risks", value: data?.activeRisks ?? 0, sub: "activated assessments", icon: ShieldCheck, color: "text-violet-600", bg: "bg-violet-50", href: "/ehs/risks" },
    { label: "Active Permits", value: data?.activePermits ?? 0, sub: "valid permits to work", icon: FileText, color: "text-emerald-600", bg: "bg-emerald-50", href: "/ehs/permits" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Environment, Health & Safety</h1>
          <p className="page-subtitle">EHS operations for {activeCompany?.name}</p>
        </div>
        <Link href="/ehs/incidents" className="btn-primary"><AlertTriangle size={16} /> Report Incident</Link>
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
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Incidents by Severity</h2>
          {data?.bySeverity?.length ? (
            <div className="space-y-2">
              {data.bySeverity.map((s: any) => (
                <div key={s.severity} className="flex items-center justify-between py-1">
                  <span className={clsx("badge", SEVERITY_COLORS[s.severity] ?? "badge-gray")}>{s.severity}</span>
                  <span className="text-sm font-semibold text-slate-700">{s._count._all}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No incidents recorded</p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Incidents</h2>
          {data?.recentIncidentList?.length ? (
            <div className="space-y-3">
              {data.recentIncidentList.map((i: any) => (
                <div key={i.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{i.number}</p>
                    <p className="text-xs text-slate-400">{i.title} · {i.incidentType}</p>
                  </div>
                  <span className={clsx("badge", SEVERITY_COLORS[i.severity] ?? "badge-gray")}>{i.severity}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No recent incidents</p>
          )}
        </div>
      </div>
    </div>
  );
}


