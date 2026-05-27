"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { glApi, procurementApi, hrApi, fsmApi } from "@/lib/api";
import Link from "next/link";
import {
  BarChart3, TrendingUp, TrendingDown, Users, ShoppingCart,
  Factory, Wrench, HardHat, ShieldCheck, Globe, Truck,
  DollarSign, FileText, ArrowRight, Loader2,
} from "lucide-react";

function KpiCard({
  label, value, sub, icon: Icon, iconBg, iconColor, href,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; iconBg: string; iconColor: string; href: string;
}) {
  return (
    <Link href={href} className="card p-5 hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon size={18} className={iconColor} />
        </div>
        <ArrowRight size={14} className="text-slate-300 group-hover:text-blue-500 transition-colors mt-1" />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-700 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </Link>
  );
}

function ModuleCard({
  label, description, href, icon: Icon, color, status,
}: {
  label: string; description: string; href: string;
  icon: React.ElementType; color: string; status: "active" | "beta";
}) {
  return (
    <Link href={href} className="card p-4 hover:shadow-md transition-shadow group flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <span className={`badge ${status === "active" ? "badge-green" : "badge-blue"} text-xs`}>
            {status === "active" ? "Active" : "Beta"}
          </span>
        </div>
        <p className="text-xs text-slate-400 truncate">{description}</p>
      </div>
      <ArrowRight size={14} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
    </Link>
  );
}

function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, notation: "compact", maximumFractionDigits: 1,
  }).format(amount);
}

export default function AnalyticsPage() {
  const { activeCompany } = useAuth();
  const currency = activeCompany?.currency || "USD";

  const { data: glData, isLoading: glLoading } = useQuery({
    queryKey: ["gl-dashboard", activeCompany?.id],
    queryFn: () => glApi.dashboard(),
    enabled: !!activeCompany,
  });

  const { data: procData, isLoading: procLoading } = useQuery({
    queryKey: ["procurement-dashboard", activeCompany?.id],
    queryFn: () => procurementApi.dashboard(),
    enabled: !!activeCompany,
  });

  const { data: hrData, isLoading: hrLoading } = useQuery({
    queryKey: ["hr-dashboard", activeCompany?.id],
    queryFn: () => hrApi.dashboard(),
    enabled: !!activeCompany,
  });

  const { data: fsmData, isLoading: fsmLoading } = useQuery({
    queryKey: ["fsm-dashboard", activeCompany?.id],
    queryFn: () => fsmApi.dashboard(),
    enabled: !!activeCompany,
  });

  const isLoading = glLoading || procLoading || hrLoading || fsmLoading;

  const modules = [
    { label: "Finance & Accounting", description: "GL, AP, AR, bank reconciliation, budgets", href: "/finance", icon: DollarSign, color: "bg-blue-600", status: "active" as const },
    { label: "Procurement", description: "Purchase orders, requisitions, suppliers", href: "/procurement", icon: ShoppingCart, color: "bg-orange-500", status: "active" as const },
    { label: "Inventory", description: "Items, warehouses, stock movements", href: "/inventory", icon: Factory, color: "bg-emerald-600", status: "active" as const },
    { label: "Manufacturing", description: "Production orders, BOM, MRP", href: "/manufacturing", icon: Factory, color: "bg-violet-600", status: "active" as const },
    { label: "CRM", description: "Leads, opportunities, accounts, contacts", href: "/crm", icon: Users, color: "bg-pink-600", status: "active" as const },
    { label: "Sales", description: "Quotes, orders, deliveries, price lists", href: "/sales", icon: TrendingUp, color: "bg-green-600", status: "active" as const },
    { label: "Human Resources", description: "Employees, leave, payroll, recruitment", href: "/hr", icon: Users, color: "bg-teal-600", status: "active" as const },
    { label: "Asset Management", description: "Assets, maintenance plans, work orders", href: "/eam", icon: Wrench, color: "bg-slate-600", status: "active" as const },
    { label: "Field Service", description: "Service orders, technicians, contracts", href: "/fsm", icon: Truck, color: "bg-cyan-600", status: "active" as const },
    { label: "Projects", description: "Project tracking, tasks, timesheets", href: "/projects", icon: Globe, color: "bg-indigo-600", status: "active" as const },
    { label: "Quality", description: "Inspections, NCRs, audits", href: "/quality", icon: ShieldCheck, color: "bg-yellow-600", status: "active" as const },
    { label: "EHS", description: "Incidents, risk assessments, permits", href: "/ehs", icon: HardHat, color: "bg-red-600", status: "active" as const },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">
            Cross-module performance overview for {activeCompany?.name ?? "your organisation"}
          </p>
        </div>
        <Link href="/analytics/reports" className="btn-secondary gap-2">
          <FileText size={15} />
          All Reports
        </Link>
      </div>

      {/* KPI strip */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-16 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="AR Outstanding"
            value={formatCurrency(glData?.ar?.outstanding ?? 0, currency)}
            sub="Receivables balance"
            icon={TrendingUp}
            iconBg="bg-green-50"
            iconColor="text-green-600"
            href="/finance/ar"
          />
          <KpiCard
            label="AP Outstanding"
            value={formatCurrency(glData?.ap?.outstanding ?? 0, currency)}
            sub="Payables balance"
            icon={TrendingDown}
            iconBg="bg-red-50"
            iconColor="text-red-600"
            href="/finance/ap"
          />
          <KpiCard
            label="Open Purchase Orders"
            value={procData?.openPOs ?? 0}
            sub="Awaiting fulfilment"
            icon={ShoppingCart}
            iconBg="bg-orange-50"
            iconColor="text-orange-600"
            href="/procurement/orders"
          />
          <KpiCard
            label="Total Employees"
            value={hrData?.totalEmployees ?? 0}
            sub={`${hrData?.onLeave ?? 0} currently on leave`}
            icon={Users}
            iconBg="bg-teal-50"
            iconColor="text-teal-600"
            href="/hr/employees"
          />
          <KpiCard
            label="Journal Entries"
            value={(glData?.journals?.total ?? 0).toLocaleString()}
            sub={`${glData?.journals?.draft ?? 0} drafts pending`}
            icon={FileText}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            href="/finance/journals"
          />
          <KpiCard
            label="Open Service Orders"
            value={fsmData?.openOrders ?? 0}
            sub="Field service backlog"
            icon={Truck}
            iconBg="bg-cyan-50"
            iconColor="text-cyan-600"
            href="/fsm/orders"
          />
          <KpiCard
            label="Active Vendors"
            value={glData?.vendors ?? 0}
            sub="In supplier network"
            icon={ShoppingCart}
            iconBg="bg-violet-50"
            iconColor="text-violet-600"
            href="/procurement/suppliers"
          />
          <KpiCard
            label="Net Position"
            value={formatCurrency(
              (glData?.ar?.outstanding ?? 0) - (glData?.ap?.outstanding ?? 0),
              currency,
            )}
            sub="AR minus AP"
            icon={BarChart3}
            iconBg="bg-indigo-50"
            iconColor="text-indigo-600"
            href="/finance"
          />
        </div>
      )}

      {/* Module directory */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">All Modules</h2>
        <span className="badge badge-slate">{modules.length} active</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {modules.map((m) => (
          <ModuleCard key={m.href} {...m} />
        ))}
      </div>
    </div>
  );
}
