"use client";

import { useQuery } from "@tanstack/react-query";
import { crmApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Users, BarChart3, Building2, Activity } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import Link from "next/link";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function CrmOverviewPage() {
  const { activeCompany } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["crm-dashboard", activeCompany?.id],
    queryFn: () => crmApi.dashboard(),
    enabled: !!activeCompany,
  });

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  const cards = [
    { label: "Total Leads", value: data?.totalLeads ?? 0, icon: Users, color: "text-blue-600", bg: "bg-blue-50", href: "/crm/leads" },
    { label: "Open Opportunities", value: data?.openOpportunities ?? 0, icon: BarChart3, color: "text-emerald-600", bg: "bg-emerald-50", href: "/crm/opportunities" },
    { label: "Accounts", value: data?.totalAccounts ?? 0, icon: Building2, color: "text-violet-600", bg: "bg-violet-50", href: "/crm/accounts" },
    { label: "Contacts", value: data?.totalContacts ?? 0, icon: Users, color: "text-amber-600", bg: "bg-amber-50", href: "/crm/contacts" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">CRM</h1>
          <p className="page-subtitle">Customer relationship management for {activeCompany?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg}`}>
                <c.icon size={20} className={c.color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="text-sm text-slate-500 mt-1">{c.label}</p>
          </Link>
        ))}
      </div>

      {(data?.pipeline ?? []).length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Opportunity Pipeline</h2>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th className="text-right">Count</th>
                  <th className="text-right">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {(data?.pipeline ?? []).map((row: any) => (
                  <tr key={row.stage}>
                    <td>{row.stage}</td>
                    <td className="text-right">{row._count}</td>
                    <td className="text-right font-mono">{fmt(Number(row._sum?.amount ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(data?.recentActivities ?? []).length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Activities</h2>
          <div className="space-y-3">
            {(data?.recentActivities ?? []).map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                <Activity size={14} className="text-slate-400 shrink-0" />
                <span className="font-medium text-slate-700">{a.subject}</span>
                <span className="text-slate-400">{a.type}</span>
                <span className={`badge ml-auto ${a.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


