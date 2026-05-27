"use client";

import { useQuery } from "@tanstack/react-query";
import { salesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FileText, ClipboardList, Truck, DollarSign } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import Link from "next/link";

export default function SalesOverviewPage() {
  const { activeCompany } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["sales-dashboard", activeCompany?.id],
    queryFn: () => salesApi.dashboard(),
    enabled: !!activeCompany,
  });

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  const cards = [
    { label: "Total Quotes", value: data?.totalQuotes ?? 0, icon: FileText, color: "text-blue-600", bg: "bg-blue-50", href: "/sales/quotes" },
    { label: "Total Orders", value: data?.totalOrders ?? 0, icon: ClipboardList, color: "text-emerald-600", bg: "bg-emerald-50", href: "/sales/orders" },
    { label: "Open Orders", value: data?.openOrders ?? 0, icon: ClipboardList, color: "text-amber-600", bg: "bg-amber-50", href: "/sales/orders?status=APPROVED" },
    { label: "Pending Deliveries", value: data?.pendingDeliveries ?? 0, icon: Truck, color: "text-violet-600", bg: "bg-violet-50", href: "/sales/deliveries" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales</h1>
          <p className="page-subtitle">Sales management for {activeCompany?.name}</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/sales/quotes" className="card p-5 hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <FileText size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-slate-800">Quotations</p>
            <p className="text-xs text-slate-500">Create and manage sales quotes</p>
          </div>
        </Link>
        <Link href="/sales/price-lists" className="card p-5 hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <DollarSign size={20} className="text-emerald-600" />
          </div>
          <div>
            <p className="font-medium text-slate-800">Price Lists</p>
            <p className="text-xs text-slate-500">Manage pricing for customers</p>
          </div>
        </Link>
      </div>
    </div>
  );
}


