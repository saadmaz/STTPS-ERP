"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tenantsApi, type Tenant } from "@/lib/api";
import { ArrowLeft, Building2, Users, Shield, Settings } from "lucide-react";
import Link from "next/link";
import { cn, formatDate } from "@/lib/utils";
import { CompaniesTab } from "@/components/tenants/CompaniesTab";
import { UsersTab } from "@/components/tenants/UsersTab";
import { RolesTab } from "@/components/tenants/RolesTab";
import { toast } from "sonner";

type Tab = "companies" | "users" | "roles";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
];

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("companies");

  const { data: tenant, isLoading } = useQuery<Tenant>({
    queryKey: ["admin-tenant", id],
    queryFn: () => tenantsApi.get(id),
  });

  const handleStatusToggle = async () => {
    if (!tenant) return;
    const newStatus = tenant.status === "active" ? "suspended" : "active";
    try {
      await tenantsApi.update(id, { status: newStatus });
      toast.success(`Organization ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
    } catch {
      toast.error("Failed to update status");
    }
  };

  if (isLoading) {
    return <div className="p-8 text-slate-400 text-sm">Loading...</div>;
  }
  if (!tenant) {
    return <div className="p-8 text-red-500 text-sm">Organization not found</div>;
  }

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/tenants" className="hover:text-slate-700 flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" /> Organizations
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">{tenant.name}</span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-brand-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{tenant.name}</h1>
              <p className="text-sm text-slate-500">{tenant.slug} · Plan: <span className="font-medium capitalize">{tenant.plan}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              tenant.status === "active" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tenant.status === "active" ? "bg-green-500" : "bg-red-500"}`} />
              {tenant.status}
            </span>
            <button
              onClick={handleStatusToggle}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              {tenant.status === "active" ? "Suspend" : "Activate"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mt-6 pt-6 border-t border-slate-100">
          <div><p className="text-xs text-slate-500 mb-1">Companies</p><p className="text-lg font-semibold text-slate-900">{tenant.companies?.length ?? 0}</p></div>
          <div><p className="text-xs text-slate-500 mb-1">Users</p><p className="text-lg font-semibold text-slate-900">{tenant.users?.length ?? 0}</p></div>
          <div><p className="text-xs text-slate-500 mb-1">Created</p><p className="text-sm font-medium text-slate-900">{formatDate(tenant.createdAt)}</p></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "companies" && <CompaniesTab tenantId={id} />}
      {activeTab === "users" && <UsersTab tenantId={id} />}
      {activeTab === "roles" && <RolesTab tenantId={id} />}
    </div>
  );
}
