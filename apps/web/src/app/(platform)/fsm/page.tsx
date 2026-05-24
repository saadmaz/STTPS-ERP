"use client";

import { useQuery } from "@tanstack/react-query";
import { fsmApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader2, Truck, Users, FileText, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "badge-yellow",
  ASSIGNED: "badge-blue",
  IN_PROGRESS: "badge-blue",
  PENDING_PARTS: "badge-gray",
  COMPLETED: "badge-green",
  CANCELLED: "badge-red",
};

export default function FsmOverviewPage() {
  const { activeCompany } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["fsm-dashboard", activeCompany?.id],
    queryFn: () => fsmApi.dashboard(),
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
    { label: "Open Orders", value: data?.openOrders ?? 0, sub: "open, assigned, in-progress", icon: Truck, color: "text-blue-600", bg: "bg-blue-50", href: "/fsm/orders" },
    { label: "SLA Breaches", value: data?.overdueOrders ?? 0, sub: "past SLA deadline", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", href: "/fsm/orders" },
    { label: "Available Techs", value: data?.availableTechs ?? 0, sub: "ready to dispatch", icon: Users, color: "text-emerald-600", bg: "bg-emerald-50", href: "/fsm/technicians" },
    { label: "Active Contracts", value: data?.activeContracts ?? 0, sub: "service agreements", icon: FileText, color: "text-violet-600", bg: "bg-violet-50", href: "/fsm/contracts" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Field Service</h1>
          <p className="page-subtitle">Service operations overview for {activeCompany?.name}</p>
        </div>
        <Link href="/fsm/orders" className="btn-primary">
          <Truck size={16} /> New Service Order
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
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Orders by Status</h2>
          {data?.byStatus?.length ? (
            <div className="space-y-2">
              {data.byStatus.map((s: any) => (
                <div key={s.status} className="flex items-center justify-between py-1">
                  <span className={clsx("badge", STATUS_COLORS[s.status] ?? "badge-gray")}>{s.status}</span>
                  <span className="text-sm font-semibold text-slate-700">{s._count._all}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No service orders yet</p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Service Orders</h2>
          {data?.recentOrders?.length ? (
            <div className="space-y-3">
              {data.recentOrders.map((o: any) => (
                <div key={o.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{o.number}</p>
                    <p className="text-xs text-slate-400">{o.title} {o.technician ? `· ${o.technician.name}` : ""}</p>
                  </div>
                  <span className={clsx("badge", STATUS_COLORS[o.status] ?? "badge-gray")}>{o.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No recent orders</p>
          )}
        </div>
      </div>
    </div>
  );
}
