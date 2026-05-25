"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardApi, type Tenant } from "@/lib/api";
import { Building2, Users, Layers, TrendingUp } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: dashboardApi.getStats,
  });

  const stats = [
    { label: "Organizations", value: data?.tenants ?? 0, icon: Building2, color: "bg-blue-500" },
    { label: "Total Users", value: data?.users ?? 0, icon: Users, color: "bg-green-500" },
    { label: "Companies", value: data?.companies ?? 0, icon: Layers, color: "bg-purple-500" },
    { label: "Active Plans", value: data?.tenants ?? 0, icon: TrendingUp, color: "bg-orange-500" },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Platform Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Overview of all organizations on STTPS ERP</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 ${stat.color} rounded-lg flex items-center justify-center`}>
                <stat.icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium text-slate-600">{stat.label}</span>
            </div>
            <p className="text-3xl font-bold text-slate-900">
              {isLoading ? "—" : stat.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Organizations */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Recent Organizations</h2>
          <Link href="/tenants" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            View all
          </Link>
        </div>
        <div className="divide-y divide-slate-50">
          {isLoading ? (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">Loading...</div>
          ) : data?.recentTenants?.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">No organizations yet</div>
          ) : (
            data?.recentTenants?.map((tenant: Tenant) => (
              <Link
                key={tenant.id}
                href={`/tenants/${tenant.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-brand-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{tenant.name}</p>
                    <p className="text-xs text-slate-400">{tenant.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    tenant.status === "active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"
                  }`}>
                    {tenant.status}
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(tenant.createdAt)}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
