"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { assetsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Search, Loader2, X } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

const STATUS_BADGES: Record<string, string> = {
  ACTIVE: "badge-green",
  DISPOSED: "badge-slate",
  IMPAIRED: "badge-yellow",
};

const assetSchema = z.object({
  code: z.string().min(1, "Code required"),
  name: z.string().min(1, "Name required"),
  category: z.string().min(1, "Category required"),
  acquisitionDate: z.string().min(1, "Date required"),
  acquisitionCost: z.coerce.number().min(0, "Cost required"),
  depreciationMethod: z.string().default("STRAIGHT_LINE"),
  usefulLifeMonths: z.coerce.number().int().min(1).default(60),
  salvageValue: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});

type AssetForm = z.infer<typeof assetSchema>;

export default function AssetsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ["assets-summary", activeCompany?.id],
    queryFn: () => assetsApi.summary(),
    enabled: !!activeCompany,
  });

  const { data: assetData, isLoading } = useQuery({
    queryKey: ["assets", activeCompany?.id, page, search],
    queryFn: () => assetsApi.list({ page, limit: 25, search }),
    enabled: !!activeCompany,
  });

  const { mutate: createAsset, isPending: isCreating } = useMutation({
    mutationFn: (data: AssetForm) => assetsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["assets-summary"] });
      toast.success("Asset created");
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed to create asset"),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      acquisitionDate: new Date().toISOString().split("T")[0],
      depreciationMethod: "STRAIGHT_LINE",
      usefulLifeMonths: 60,
      salvageValue: 0,
    },
  });

  const assets = assetData?.data || [];
  const total = assetData?.total || 0;
  const pages = assetData?.pages || 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Fixed Assets</h1>
          <p className="page-subtitle">{summary?.totalActive || 0} active assets</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} />
          New Asset
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card p-4">
            <p className="text-xs text-slate-500 mb-1">Active Assets</p>
            <p className="text-2xl font-bold text-slate-900">{summary.totalActive}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 mb-1">Total Cost</p>
            <p className="text-xl font-bold font-mono text-slate-900">{fmt(summary.totalCost)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 mb-1">Net Book Value</p>
            <p className="text-xl font-bold font-mono text-blue-600">{fmt(summary.totalNetBookValue)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 mb-1">Disposed</p>
            <p className="text-2xl font-bold text-slate-500">{summary.totalDisposed}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 p-3">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Acquisition Date</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Accum. Depr.</th>
                    <th className="text-right">Net Book Value</th>
                    <th>Method</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a: any) => (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3"><span className="font-mono text-sm text-slate-600">{a.code}</span></td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{a.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{a.category}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{format(new Date(a.acquisitionDate), "dd MMM yyyy")}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{fmt(Number(a.acquisitionCost))}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-red-600">{fmt(Number(a.accumulatedDepr))}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono font-medium text-blue-700">{fmt(Number(a.netBookValue))}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{a.depreciationMethod.replace("_", " ")}</td>
                      <td className="px-4 py-3">
                        <span className={clsx("badge", STATUS_BADGES[a.status] || "badge-slate")}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                  {assets.length === 0 && <tr><td colSpan={9} className="text-center py-12 text-slate-400">No assets found.</td></tr>}
                </tbody>
              </table>
            </div>
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

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New Fixed Asset</h2>
              <button onClick={() => { setShowCreate(false); reset(); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => createAsset(d))} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Code *</label>
                  <input {...register("code")} className="input-base" placeholder="AST-001" />
                  {errors.code && <p className="form-error">{errors.code.message}</p>}
                </div>
                <div>
                  <label className="form-label">Name *</label>
                  <input {...register("name")} className="input-base" placeholder="Office Computer" />
                  {errors.name && <p className="form-error">{errors.name.message}</p>}
                </div>
              </div>
              <div>
                <label className="form-label">Category *</label>
                <input {...register("category")} className="input-base" placeholder="e.g. IT Equipment, Vehicles, Machinery" />
                {errors.category && <p className="form-error">{errors.category.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Acquisition Date *</label>
                  <input {...register("acquisitionDate")} type="date" className="input-base" />
                </div>
                <div>
                  <label className="form-label">Acquisition Cost *</label>
                  <input {...register("acquisitionCost")} type="number" step="0.01" min="0" className="input-base" placeholder="0.00" />
                  {errors.acquisitionCost && <p className="form-error">{errors.acquisitionCost.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Depreciation Method</label>
                  <select {...register("depreciationMethod")} className="input-base">
                    <option value="STRAIGHT_LINE">Straight Line</option>
                    <option value="DECLINING_BALANCE">Declining Balance</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Useful Life (months)</label>
                  <input {...register("usefulLifeMonths")} type="number" min="1" className="input-base" placeholder="60" />
                </div>
                <div>
                  <label className="form-label">Salvage Value</label>
                  <input {...register("salvageValue")} type="number" step="0.01" min="0" className="input-base" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="form-label">Notes</label>
                <input {...register("notes")} className="input-base" placeholder="Optional notes" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); reset(); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={isCreating} className="btn-primary flex-1">
                  {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
