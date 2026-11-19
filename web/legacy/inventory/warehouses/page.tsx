"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Loader2, X, Warehouse } from "lucide-react";

const warehouseSchema = z.object({
  code: z.string().min(1, "Code required"),
  name: z.string().min(1, "Name required"),
});

type WarehouseForm = z.infer<typeof warehouseSchema>;

export default function WarehousesPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ["warehouses", activeCompany?.id],
    queryFn: () => inventoryApi.warehouses.list(),
    enabled: !!activeCompany,
  });

  const { mutate: createWarehouse, isPending: isCreating } = useMutation({
    mutationFn: (data: WarehouseForm) => inventoryApi.warehouses.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["inventory-summary"] });
      toast.success("Warehouse created");
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(warehouseSchema),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouses</h1>
          <p className="page-subtitle">{(warehouses as any[]).length} locations</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New Warehouse
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(warehouses as any[]).map((w: any) => (
            <div key={w.id} className="card p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                  <Warehouse size={18} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{w.name}</h3>
                  <p className="text-xs font-mono text-slate-400">{w.code}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>{w.locations?.length || 0} locations</span>
                <span>{w._count?.stockLevels || 0} stock lines</span>
              </div>
            </div>
          ))}
          {(warehouses as any[]).length === 0 && (
            <div className="col-span-3 text-center py-16 text-slate-400">No warehouses yet.</div>
          )}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New Warehouse</h2>
              <button onClick={() => { setShowCreate(false); reset(); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => createWarehouse(d))} className="p-6 space-y-4">
              <div>
                <label className="form-label">Code *</label>
                <input {...register("code")} className="input-base" placeholder="WH-001" />
                {errors.code && <p className="form-error">{errors.code.message}</p>}
              </div>
              <div>
                <label className="form-label">Name *</label>
                <input {...register("name")} className="input-base" placeholder="Main Warehouse" />
                {errors.name && <p className="form-error">{errors.name.message}</p>}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); reset(); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={isCreating} className="btn-primary flex-1">
                  {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
