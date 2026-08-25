"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tenantsApi, type Tenant } from "@/lib/api";
import { Building2, Plus, Search, MoreVertical, Users, Layers, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { CreateTenantModal } from "@/components/tenants/CreateTenantModal";
import { toast } from "sonner";

export default function TenantsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["admin-tenants", search],
    queryFn: () => tenantsApi.list(search || undefined),
  });

  const handleDelete = async (tenant: Tenant) => {
    if (!confirm(`Delete organization "${tenant.name}"? This is irreversible.`)) return;
    try {
      await tenantsApi.delete(tenant.id);
      toast.success("Organization deleted");
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
    } catch {
      toast.error("Failed to delete organization");
    }
  };

  const PLAN_COLORS: Record<string, string> = {
    starter: "bg-slate-100 text-slate-700",
    professional: "bg-blue-50 text-blue-700",
    enterprise: "bg-purple-50 text-purple-700",
    platform: "bg-orange-50 text-orange-700",
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Organizations</h1>
          <p className="text-slate-500 text-sm mt-1">Manage all tenant organizations on the platform</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          New Organization
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search organizations..."
          className="w-full max-w-sm pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-5 py-3 font-medium text-slate-600">Organization</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Plan</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Status</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Companies</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Users</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Created</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-slate-400">Loading...</td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-slate-400">No organizations found</td>
              </tr>
            ) : (
              tenants.map((tenant: Tenant) => (
                <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-brand-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{tenant.name}</p>
                        <p className="text-xs text-slate-400">{tenant.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${PLAN_COLORS[tenant.plan] ?? "bg-slate-100 text-slate-700"}`}>
                      {tenant.plan}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tenant.status === "active" ? "text-green-600" : "text-slate-500"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tenant.status === "active" ? "bg-green-500" : "bg-slate-400"}`} />
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      {tenant._count?.companies ?? 0}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {tenant._count?.users ?? 0}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{formatDate(tenant.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        href={`/tenants/${tenant.id}`}
                        className="flex items-center gap-1 text-brand-600 hover:text-brand-700 text-xs font-medium"
                      >
                        Manage <ChevronRight className="w-3 h-3" />
                      </Link>
                      <button
                        onClick={() => handleDelete(tenant)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors"
                        title="Delete organization"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CreateTenantModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
