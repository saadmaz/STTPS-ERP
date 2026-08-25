"use client";

import { useQuery } from "@tanstack/react-query";
import { glApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import {
  DollarSign, FileText, TrendingUp, TrendingDown,
  Users, AlertCircle, CheckCircle2, Clock,
  ShoppingCart, Package, Factory, Wrench, Truck,
  Globe, ShieldCheck, HardHat, BarChart3, Briefcase,
  CreditCard, Receipt,
} from "lucide-react";
import { clsx } from "clsx";

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, color, trend,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; trend?: "up" | "down" | "neutral";
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
    style: "currency", currency, notation: "compact", maximumFractionDigits: 1,
  }).format(amount);
}

// ─── Quick Action Button ───────────────────────────────────────────────────────
function QuickAction({
  label, href, icon: Icon, color,
}: {
  label: string; href: string; icon: React.ElementType; color: string;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex flex-col items-center gap-2 p-3 rounded-xl border border-transparent",
        "hover:border-slate-200 hover:shadow-sm transition-all cursor-pointer",
        color,
      )}
    >
      <Icon size={20} />
      <span className="text-xs font-medium text-center leading-tight">{label}</span>
    </Link>
  );
}

// ─── All active modules with statuses ─────────────────────────────────────────
const ALL_MODULES = [
  { label: "Finance", status: "Active" },
  { label: "Accounts Payable", status: "Active" },
  { label: "Accounts Receivable", status: "Active" },
  { label: "Procurement", status: "Active" },
  { label: "Inventory", status: "Active" },
  { label: "Manufacturing", status: "Active" },
  { label: "CRM", status: "Active" },
  { label: "Sales", status: "Active" },
  { label: "HR & Payroll", status: "Active" },
  { label: "Asset Management", status: "Active" },
  { label: "Field Service", status: "Active" },
  { label: "Projects", status: "Active" },
  { label: "Quality", status: "Active" },
  { label: "EHS", status: "Active" },
];

// ─── Quick actions for all modules ────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "Journal Entry", href: "/finance/journals", icon: FileText, color: "bg-blue-50 text-blue-700" },
  { label: "AP Invoices", href: "/finance/ap", icon: CreditCard, color: "bg-red-50 text-red-700" },
  { label: "AR Invoices", href: "/finance/ar", icon: Receipt, color: "bg-emerald-50 text-emerald-700" },
  { label: "Trial Balance", href: "/finance/trial-balance", icon: BarChart3, color: "bg-purple-50 text-purple-700" },
  { label: "Purchase Orders", href: "/procurement/orders", icon: ShoppingCart, color: "bg-orange-50 text-orange-700" },
  { label: "Suppliers", href: "/procurement/suppliers", icon: Truck, color: "bg-amber-50 text-amber-700" },
  { label: "Stock Levels", href: "/inventory/stock-levels", icon: Package, color: "bg-teal-50 text-teal-700" },
  { label: "Production", href: "/manufacturing/orders", icon: Factory, color: "bg-violet-50 text-violet-700" },
  { label: "Employees", href: "/hr/employees", icon: Users, color: "bg-cyan-50 text-cyan-700" },
  { label: "CRM Leads", href: "/crm/leads", icon: Briefcase, color: "bg-pink-50 text-pink-700" },
  { label: "Service Orders", href: "/fsm/orders", icon: Wrench, color: "bg-slate-100 text-slate-700" },
  { label: "EHS Incidents", href: "/ehs/incidents", icon: HardHat, color: "bg-rose-50 text-rose-700" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
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
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          })}
        </div>
      </div>

      {/* No company selected */}
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
          {/* ── KPI Grid ── */}
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

          {/* ── Quick Actions + System Status ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Quick Actions — spans 2 cols */}
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-slate-800">Quick Actions</h2>
                <Link href="/analytics" className="text-xs text-blue-600 hover:underline">
                  View all modules →
                </Link>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <QuickAction key={action.label} {...action} />
                ))}
              </div>
            </div>

            {/* System Status */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-slate-800">System Status</h2>
                <Link href="/settings/system" className="text-xs text-blue-600 hover:underline">
                  Details →
                </Link>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-52">
                {ALL_MODULES.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">{item.label}</span>
                    <span className="badge badge-green">{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Module Directory strip ── */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-800">All Modules</h2>
              <Link href="/analytics/reports" className="text-xs text-blue-600 hover:underline">
                Report catalogue →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {[
                { label: "Finance", href: "/finance/journals", icon: DollarSign, bg: "bg-blue-100 text-blue-700" },
                { label: "Procurement", href: "/procurement", icon: ShoppingCart, bg: "bg-orange-100 text-orange-700" },
                { label: "Inventory", href: "/inventory", icon: Package, bg: "bg-emerald-100 text-emerald-700" },
                { label: "Manufacturing", href: "/manufacturing", icon: Factory, bg: "bg-violet-100 text-violet-700" },
                { label: "CRM", href: "/crm", icon: Users, bg: "bg-pink-100 text-pink-700" },
                { label: "Sales", href: "/sales", icon: Briefcase, bg: "bg-green-100 text-green-700" },
                { label: "HR", href: "/hr", icon: Users, bg: "bg-teal-100 text-teal-700" },
                { label: "Assets", href: "/eam", icon: Wrench, bg: "bg-slate-200 text-slate-700" },
                { label: "Field Service", href: "/fsm", icon: Truck, bg: "bg-cyan-100 text-cyan-700" },
                { label: "Projects", href: "/projects", icon: Globe, bg: "bg-indigo-100 text-indigo-700" },
                { label: "Quality", href: "/quality", icon: ShieldCheck, bg: "bg-yellow-100 text-yellow-700" },
                { label: "EHS", href: "/ehs", icon: HardHat, bg: "bg-red-100 text-red-700" },
                { label: "Analytics", href: "/analytics", icon: BarChart3, bg: "bg-purple-100 text-purple-700" },
                { label: "Settings", href: "/settings/companies", icon: Clock, bg: "bg-slate-100 text-slate-600" },
              ].map((mod) => (
                <Link
                  key={mod.href}
                  href={mod.href}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                >
                  <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center", mod.bg)}>
                    <mod.icon size={16} />
                  </div>
                  <span className="text-xs text-slate-500 group-hover:text-slate-700 font-medium text-center leading-tight">
                    {mod.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
