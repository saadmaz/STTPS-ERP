"use client";

import { useQuery } from "@tanstack/react-query";
import { manufacturingApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader2, Factory, ClipboardList, Settings, BarChart3 } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "badge-gray",
  RELEASED: "badge-blue",
  IN_PROGRESS: "badge-yellow",
  COMPLETED: "badge-green",
  CANCELLED: "badge-red",
};

export default function ManufacturingOverviewPage() {
  const { activeCompany } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["manufacturing-dashboard", activeCompany?.id],
    queryFn: () => manufacturingApi.dashboard(),
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
    { label: "Active BOMs", value: data?.activeBOMs ?? 0, icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-50", href: "/manufacturing/bom" },
    { label: "Work Centers", value: data?.workCenters ?? 0, icon: Settings, color: "text-emerald-600", bg: "bg-emerald-50", href: "/manufacturing/work-centers" },
    { label: "Open Orders", value: data?.openOrders ?? 0, icon: Factory, color: "text-orange-600", bg: "bg-orange-50", href: "/manufacturing/orders" },
    { label: "Draft MRP Plans", value: data?.draftMRPs ?? 0, icon: BarChart3, color: "text-violet-600", bg: "bg-violet-50", href: "/manufacturing/mrp" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manufacturing</h1>
          <p className="page-subtitle">Production overview for {activeCompany?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-5 hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} mb-3`}>
              <c.icon size={20} className={c.color} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="text-sm text-slate-500 mt-1">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Orders by Status */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Orders by Status</h2>
          {data?.ordersByStatus?.length ? (
            <div className="space-y-2">
              {data.ordersByStatus.map((s: any) => (
                <div key={s.status} className="flex items-center justify-between py-1">
                  <span className={clsx("badge", STATUS_COLORS[s.status] ?? "badge-gray")}>{s.status}</span>
                  <span className="text-sm font-semibold text-slate-700">{s._count._all}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No production orders yet</p>
          )}
        </div>

        {/* Recent Orders */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Production Orders</h2>
          {data?.recentOrders?.length ? (
            <div className="space-y-3">
              {data.recentOrders.map((o: any) => (
                <div key={o.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{o.number}</p>
                    <p className="text-xs text-slate-400">{o.item?.name} — {o.plannedQty} {o.uom}</p>
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
