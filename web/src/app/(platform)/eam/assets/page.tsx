"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { eamApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, Wrench } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "badge-green",
  UNDER_MAINTENANCE: "badge-yellow",
  DECOMMISSIONED: "badge-red",
};

export default function AssetsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["assets", activeCompany?.id, statusFilter],
    queryFn: () => eamApi.assets.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { data: categories } = useQuery({
    queryKey: ["asset-categories", activeCompany?.id],
    queryFn: () => eamApi.categories.list(),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      code: "", name: "", categoryId: "", description: "",
      serialNumber: "", model: "", manufacturer: "", location: "",
      purchaseDate: "", purchaseCost: "", warrantyExpiry: "",
    },
  });

  const catForm = useForm({ defaultValues: { code: "", name: "", description: "" } });

  const createMutation = useMutation({
    mutationFn: (data: any) => eamApi.assets.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Asset created");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create asset"),
  });

  const createCatMutation = useMutation({
    mutationFn: (data: any) => eamApi.categories.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-categories"] });
      toast.success("Category created");
      catForm.reset();
      setShowCatForm(false);
    },
    onError: () => toast.error("Failed to create category"),
  });

  const onSubmit = (values: any) => {
    createMutation.mutate({
      ...values,
      categoryId: values.categoryId || undefined,
      purchaseCost: values.purchaseCost ? Number(values.purchaseCost) : undefined,
      purchaseDate: values.purchaseDate || undefined,
      warrantyExpiry: values.warrantyExpiry || undefined,
    });
  };

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  const assets = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Assets</h1>
          <p className="page-subtitle">{data?.total ?? 0} assets registered</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" onClick={() => setShowCatForm(!showCatForm)}>Categories</button>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} /> New Asset
          </button>
        </div>
      </div>

      {showCatForm && (
        <div className="card p-4 mb-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">New Asset Category</h2>
          <form onSubmit={catForm.handleSubmit((v) => createCatMutation.mutate(v))} className="flex gap-3 items-end">
            <div className="flex-1"><label className="form-label">Code</label><input className="input-base" {...catForm.register("code", { required: true })} placeholder="HVAC" /></div>
            <div className="flex-1"><label className="form-label">Name</label><input className="input-base" {...catForm.register("name", { required: true })} placeholder="HVAC Equipment" /></div>
            <div className="flex-1"><label className="form-label">Description</label><input className="input-base" {...catForm.register("description")} /></div>
            <button type="submit" className="btn-primary" disabled={createCatMutation.isPending}>
              {createCatMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create"}
            </button>
          </form>
          {(categories ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
              {(categories ?? []).map((c: any) => (
                <span key={c.id} className="badge badge-blue">{c.name} ({c._count?.assets ?? 0})</span>
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Register New Asset</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Asset Code</label>
                <input className="input-base" {...register("code", { required: true })} placeholder="AST-001" />
                {errors.code && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Name</label>
                <input className="input-base" {...register("name", { required: true })} placeholder="Air Compressor #1" />
                {errors.name && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Category</label>
                <select className="input-base" {...register("categoryId")}>
                  <option value="">— None —</option>
                  {(categories ?? []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Location</label>
                <input className="input-base" {...register("location")} placeholder="Building A, Floor 2" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Serial Number</label>
                <input className="input-base" {...register("serialNumber")} />
              </div>
              <div>
                <label className="form-label">Manufacturer</label>
                <input className="input-base" {...register("manufacturer")} />
              </div>
              <div>
                <label className="form-label">Model</label>
                <input className="input-base" {...register("model")} />
              </div>
              <div>
                <label className="form-label">Purchase Cost</label>
                <input className="input-base" type="number" step="0.01" {...register("purchaseCost")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Purchase Date</label>
                <input className="input-base" type="date" {...register("purchaseDate")} />
              </div>
              <div>
                <label className="form-label">Warranty Expiry</label>
                <input className="input-base" type="date" {...register("warrantyExpiry")} />
              </div>
            </div>
            <div>
              <label className="form-label">Description</label>
              <input className="input-base" {...register("description")} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Register Asset"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {["", "ACTIVE", "UNDER_MAINTENANCE", "DECOMMISSIONED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {assets.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <Wrench size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No assets registered yet.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Location</th>
                <th>Serial #</th>
                <th>Purchase Cost</th>
                <th>Warranty Expiry</th>
                <th>WOs</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a: any) => (
                <tr key={a.id}>
                  <td className="font-mono font-medium text-sm">{a.code}</td>
                  <td>
                    <p className="font-medium text-slate-800">{a.name}</p>
                    {a.manufacturer && <p className="text-xs text-slate-400">{a.manufacturer} {a.model}</p>}
                  </td>
                  <td>{a.category?.name ?? "—"}</td>
                  <td className="text-sm text-slate-500">{a.location ?? "—"}</td>
                  <td className="font-mono text-xs">{a.serialNumber ?? "—"}</td>
                  <td className="font-mono text-sm">{a.purchaseCost ? `$${Number(a.purchaseCost).toLocaleString()}` : "—"}</td>
                  <td className="text-sm">{a.warrantyExpiry ? format(new Date(a.warrantyExpiry), "MMM d, yyyy") : "—"}</td>
                  <td className="text-center text-sm">{a._count?.workOrders ?? 0}</td>
                  <td><span className={clsx("badge", STATUS_COLORS[a.status] ?? "badge-gray")}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

