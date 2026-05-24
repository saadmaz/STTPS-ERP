"use client";

import { useQuery } from "@tanstack/react-query";
import { eamApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader2, Wrench, AlertTriangle, ClipboardList, Cpu } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "badge-yellow",
  IN_PROGRESS: "badge-blue",
  ON_HOLD: "badge-gray",
  COMPLETED: "badge-green",
  CANCELLED: "badge-red",
};

export default function EamOverviewPage() {
  const { activeCompany } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["eam-dashboard", activeCompany?.id],
    queryFn: () => eamApi.dashboard(),
    enabled: !!activeCompany,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const cards = [
    { label: "Total Assets", value: data?.totalAssets ?? 0, sub: `${data?.activeAssets ?? 0} active`, icon: Wrench, color: "text-blue-600", bg: "bg-blue-50", href: "/eam/assets" },
    { label: "Open Work Orders", value: data?.openWorkOrders ?? 0, sub: "open & in-progress", icon: ClipboardList, color: "text-orange-600", bg: "bg-orange-50", href: "/eam/work-orders" },
    { label: "Overdue PM Plans", value: data?.overdueMaintenancePlans ?? 0, sub: "past due date", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", href: "/eam/plans" },
    { label: "Critical WOs", value: data?.criticalWorkOrders ?? 0, sub: "priority: critical", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", href: "/eam/work-orders" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Asset Management</h1>
          <p className="page-subtitle">Enterprise asset & maintenance overview for {activeCompany?.name}</p>
        </div>
        <Link href="/eam/work-orders" className="btn-primary">
          <ClipboardList size={16} /> New Work Order
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
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Work Orders by Status</h2>
          {data?.workOrdersByStatus?.length ? (
            <div className="space-y-2">
              {data.workOrdersByStatus.map((s: any) => (
                <div key={s.status} className="flex items-center justify-between py-1">
                  <span className={clsx("badge", STATUS_COLORS[s.status] ?? "badge-gray")}>{s.status}</span>
                  <span className="text-sm font-semibold text-slate-700">{s._count._all}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No work orders yet</p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Work Orders</h2>
          {data?.recentWorkOrders?.length ? (
            <div className="space-y-3">
              {data.recentWorkOrders.map((wo: any) => (
                <div key={wo.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{wo.number}</p>
                    <p className="text-xs text-slate-400">{wo.asset?.name} — {wo.type}</p>
                  </div>
                  <span className={clsx("badge", STATUS_COLORS[wo.status] ?? "badge-gray")}>{wo.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No recent work orders</p>
          )}
        </div>
      </div>
    </div>
  );
}
