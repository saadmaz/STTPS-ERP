"use client";

import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Package, Warehouse, BarChart3, AlertTriangle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import Link from "next/link";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function InventoryOverviewPage() {
  const { activeCompany } = useAuth();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["inventory-summary", activeCompany?.id],
    queryFn: () => inventoryApi.summary(),
    enabled: !!activeCompany,
  });

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  const cards = [
    { label: "Total Items", value: summary?.totalItems ?? 0, icon: Package, color: "text-blue-600", bg: "bg-blue-50", href: "/inventory/items" },
    { label: "Warehouses", value: summary?.totalWarehouses ?? 0, icon: Warehouse, color: "text-emerald-600", bg: "bg-emerald-50", href: "/inventory/warehouses" },
    { label: "Stock Lines", value: summary?.stockLevels ?? 0, icon: BarChart3, color: "text-violet-600", bg: "bg-violet-50", href: "/inventory/stock-levels" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Stock overview for {activeCompany?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg}`}>
                <c.icon size={20} className={c.color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{typeof c.value === 'number' && c.label.includes('Value') ? fmt(c.value) : c.value}</p>
            <p className="text-sm text-slate-500 mt-1">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="card p-5">
        <p className="text-xs text-slate-500 mb-1">Total Stock Value</p>
        <p className="text-3xl font-bold font-mono text-slate-900">{fmt(summary?.totalStockValue ?? 0)}</p>
      </div>
    </div>
  );
}


