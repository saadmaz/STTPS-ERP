"use client";

import { useQuery } from "@tanstack/react-query";
import { procurementApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ShoppingCart, ClipboardList, Truck, FileText } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import Link from "next/link";

export default function ProcurementOverviewPage() {
  const { activeCompany } = useAuth();

  const { data: dash, isLoading } = useQuery({
    queryKey: ["procurement-dashboard", activeCompany?.id],
    queryFn: () => procurementApi.dashboard(),
    enabled: !!activeCompany,
  });

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  const cards = [
    { label: "Pending Requisitions", value: dash?.pendingPRs ?? 0, icon: ClipboardList, color: "text-yellow-600", bg: "bg-yellow-50", href: "/procurement/requisitions?status=DRAFT" },
    { label: "POs Awaiting Approval", value: dash?.pendingPOs ?? 0, icon: FileText, color: "text-orange-600", bg: "bg-orange-50", href: "/procurement/orders?status=DRAFT" },
    { label: "Open Purchase Orders", value: dash?.openPOs ?? 0, icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-50", href: "/procurement/orders" },
    { label: "Goods Received (Total)", value: dash?.recentGRNs ?? 0, icon: Truck, color: "text-green-600", bg: "bg-green-50", href: "/procurement/receipts" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Procurement</h1>
          <p className="page-subtitle">Procure-to-pay for {activeCompany?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} mb-3`}>
              <c.icon size={20} className={c.color} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="text-sm text-slate-500 mt-1">{c.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}


