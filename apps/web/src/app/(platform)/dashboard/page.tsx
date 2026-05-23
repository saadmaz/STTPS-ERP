"use client";

import { useQuery } from "@tanstack/react-query";
import { glApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  DollarSign, FileText, TrendingUp, TrendingDown,
  Users, AlertCircle, CheckCircle2, Clock,
} from "lucide-react";
import { clsx } from "clsx";

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={clsx("p-3 rounded-xl", color)}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  );
}

function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export default function DashboardPage() {
  const { activeCompany } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["finance-dashboard", activeCompany?.id],
    queryFn: () => glApi.dashboard(),
    enabled: !!activeCompany,
  });

  const currency = activeCompany?.currency || "USD";

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {activeCompany?.name || "Select a company to get started"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Clock size={14} />
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
      </div>

      {!activeCompany ? (
        <div className="card p-12 text-center">
          <AlertCircle size={48} className="text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700">No company selected</h3>
          <p className="text-sm text-slate-500 mt-1">
            Use the company switcher in the top bar to select a company.
          </p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-16 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="AR Outstanding"
              value={formatCurrency(stats?.ar?.outstanding || 0, currency)}
              sub={`${formatCurrency(stats?.ar?.totalInvoiced || 0, currency)} total invoiced`}
              icon={TrendingUp}
              color="bg-green-500"
            />
            <StatCard
              label="AP Outstanding"
              value={formatCurrency(stats?.ap?.outstanding || 0, currency)}
              sub={`${formatCurrency(stats?.ap?.totalInvoiced || 0, currency)} total invoiced`}
              icon={TrendingDown}
              color="bg-red-500"
            />
            <StatCard
              label="Posted Journals"
              value={(stats?.journals?.posted || 0).toLocaleString()}
              sub={`${stats?.journals?.draft || 0} drafts pending`}
              icon={CheckCircle2}
              color="bg-blue-500"
            />
            <StatCard
              label="Total Journals"
              value={(stats?.journals?.total || 0).toLocaleString()}
              icon={FileText}
              color="bg-purple-500"
            />
            <StatCard
              label="Active Vendors"
              value={(stats?.vendors || 0).toLocaleString()}
              icon={Users}
              color="bg-orange-500"
            />
            <StatCard
              label="Active Customers"
              value={(stats?.customers || 0).toLocaleString()}
              icon={Users}
              color="bg-teal-500"
            />
            <StatCard
              label="Draft Journals"
              value={(stats?.journals?.draft || 0).toLocaleString()}
              sub="Require posting"
              icon={Clock}
              color="bg-yellow-500"
            />
            <StatCard
              label="Net Position"
              value={formatCurrency(
                (stats?.ar?.outstanding || 0) - (stats?.ap?.outstanding || 0),
                currency,
              )}
              sub="AR minus AP"
              icon={DollarSign}
              color="bg-indigo-500"
            />
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card p-5 lg:col-span-2">
              <h2 className="text-base font-semibold text-slate-800 mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "New Journal Entry", href: "/finance/journals", icon: FileText, color: "bg-blue-50 text-blue-700" },
                  { label: "Chart of Accounts", href: "/finance/accounts", icon: DollarSign, color: "bg-green-50 text-green-700" },
                  { label: "AP Invoices", href: "/finance/ap", icon: TrendingDown, color: "bg-red-50 text-red-700" },
                  { label: "AR Invoices", href: "/finance/ar", icon: TrendingUp, color: "bg-emerald-50 text-emerald-700" },
                  { label: "Trial Balance", href: "/finance/trial-balance", icon: CheckCircle2, color: "bg-purple-50 text-purple-700" },
                  { label: "Vendors", href: "/procurement/suppliers", icon: Users, color: "bg-orange-50 text-orange-700" },
                ].map((action) => (
                  <a
                    key={action.label}
                    href={action.href}
                    className={clsx(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border border-transparent",
                      "hover:border-slate-200 hover:shadow-sm transition-all cursor-pointer",
                      action.color,
                    )}
                  >
                    <action.icon size={22} />
                    <span className="text-xs font-medium text-center">{action.label}</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <h2 className="text-base font-semibold text-slate-800 mb-4">System Status</h2>
              <div className="space-y-3">
                {[
                  { label: "General Ledger", status: "Active" },
                  { label: "Accounts Payable", status: "Active" },
                  { label: "Accounts Receivable", status: "Active" },
                  { label: "Inventory", status: "Coming soon" },
                  { label: "Manufacturing", status: "Coming soon" },
                  { label: "HR & Payroll", status: "Coming soon" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">{item.label}</span>
                    <span
                      className={clsx(
                        "badge",
                        item.status === "Active" ? "badge-green" : "badge-slate",
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
