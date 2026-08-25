"use client";

import { useQuery } from "@tanstack/react-query";
import { procurementApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { Loader2, Search, Truck } from "lucide-react";

export default function SuppliersPage() {
  const { activeCompany } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: vendorData, isLoading } = useQuery({
    queryKey: ["proc-vendors", activeCompany?.id, page, search],
    queryFn: () => procurementApi.vendors({ search, page, limit: 25 }),
    enabled: !!activeCompany,
  });

  const vendors = vendorData?.data || [];
  const total = vendorData?.total || 0;
  const pages = vendorData?.pages || 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="page-subtitle">{total} vendors</p>
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex items-center gap-3 p-3">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
        ) : (
          <>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Currency</th>
                  <th>Payment Terms</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v: any) => (
                  <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3"><span className="font-mono text-sm text-slate-600">{v.code}</span></td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{v.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{v.email || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{v.phone || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{v.currency}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">Net {v.paymentTerms}</td>
                  </tr>
                ))}
                {vendors.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-400">No suppliers found. Add vendors from Finance → Accounts Payable.</td></tr>}
              </tbody>
            </table>
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-sm text-slate-500">Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}</p>
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary px-3 py-1 text-xs">Previous</button>
                  <span className="text-sm">{page} / {pages}</span>
                  <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-secondary px-3 py-1 text-xs">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
