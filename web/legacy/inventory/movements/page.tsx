"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { clsx } from "clsx";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 4 });

const MOVEMENT_TYPES = [
  { value: "RECEIPT", label: "Receipt (In)" },
  { value: "ISSUE", label: "Issue (Out)" },
  { value: "RETURN", label: "Return (In)" },
  { value: "TRANSFER_IN", label: "Transfer In" },
  { value: "TRANSFER_OUT", label: "Transfer Out" },
  { value: "ADJUSTMENT_IN", label: "Adjustment In" },
  { value: "ADJUSTMENT_OUT", label: "Adjustment Out" },
  { value: "OPENING", label: "Opening Balance" },
];

const INBOUND = ["RECEIPT", "RETURN", "TRANSFER_IN", "ADJUSTMENT_IN", "OPENING"];

const movementSchema = z.object({
  itemId: z.string().min(1, "Item required"),
  warehouseId: z.string().min(1, "Warehouse required"),
  movementType: z.string().min(1, "Type required"),
  qty: z.coerce.number().min(0.0001, "Qty must be > 0"),
  unitCost: z.coerce.number().min(0).default(0),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type MovementForm = z.infer<typeof movementSchema>;

export default function MovementsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data: movData, isLoading } = useQuery({
    queryKey: ["movements", activeCompany?.id, page],
    queryFn: () => inventoryApi.movements.list({ page, limit: 50 }),
    enabled: !!activeCompany,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["items-all", activeCompany?.id],
    queryFn: () => inventoryApi.items.list({ limit: 500 }),
    enabled: !!activeCompany,
    select: (d: any) => d.data || [],
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", activeCompany?.id],
    queryFn: () => inventoryApi.warehouses.list(),
    enabled: !!activeCompany,
  });

  const { mutate: createMovement, isPending: isCreating } = useMutation({
    mutationFn: (data: MovementForm) => inventoryApi.movements.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      qc.invalidateQueries({ queryKey: ["inventory-summary"] });
      toast.success("Movement recorded");
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(movementSchema),
    defaultValues: { movementType: "RECEIPT", unitCost: 0 },
  });

  const movements = movData?.data || [];
  const total = movData?.total || 0;
  const pages = movData?.pages || 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Movements</h1>
          <p className="page-subtitle">{total} movements</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New Movement
        </button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Item</th>
                    <th>Warehouse</th>
                    <th>Reference</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Before</th>
                    <th className="text-right">After</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m: any) => {
                    const isIn = INBOUND.includes(m.movementType);
                    return (
                      <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 text-sm text-slate-500">{format(new Date(m.createdAt), "dd MMM yyyy HH:mm")}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={clsx("font-medium", isIn ? "text-green-600" : "text-red-600")}>
                            {isIn ? "▲" : "▼"} {m.movementType.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm text-slate-800">
                          <span className="font-mono text-slate-400 mr-1">{m.item?.code}</span>{m.item?.name}
                        </td>
                        <td className="px-4 py-2 text-sm text-slate-500">{m.warehouse?.name}</td>
                        <td className="px-4 py-2 text-sm text-slate-400">{m.reference || "—"}</td>
                        <td className={clsx("px-4 py-2 text-sm text-right font-mono font-medium", isIn ? "text-green-600" : "text-red-600")}>
                          {isIn ? "+" : "-"}{fmt(Number(m.qty))}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-slate-400">{fmt(Number(m.qtyBefore))}</td>
                        <td className="px-4 py-2 text-sm text-right font-mono font-semibold text-slate-900">{fmt(Number(m.qtyAfter))}</td>
                      </tr>
                    );
                  })}
                  {movements.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-slate-400">No movements yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-sm text-slate-500">Showing page {page} of {pages}</p>
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary px-3 py-1 text-xs">Previous</button>
                  <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-secondary px-3 py-1 text-xs">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New Stock Movement</h2>
              <button onClick={() => { setShowCreate(false); reset(); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => createMovement(d))} className="p-6 space-y-4">
              <div>
                <label className="form-label">Movement Type *</label>
                <select {...register("movementType")} className="input-base">
                  {MOVEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Item *</label>
                <select {...register("itemId")} className="input-base">
                  <option value="">Select item...</option>
                  {(items as any[]).map((i: any) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
                </select>
                {errors.itemId && <p className="form-error">{errors.itemId.message}</p>}
              </div>
              <div>
                <label className="form-label">Warehouse *</label>
                <select {...register("warehouseId")} className="input-base">
                  <option value="">Select warehouse...</option>
                  {(warehouses as any[]).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {errors.warehouseId && <p className="form-error">{errors.warehouseId.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Quantity *</label>
                  <input {...register("qty")} type="number" step="0.0001" min="0.0001" className="input-base" placeholder="0" />
                  {errors.qty && <p className="form-error">{errors.qty.message}</p>}
                </div>
                <div>
                  <label className="form-label">Unit Cost</label>
                  <input {...register("unitCost")} type="number" step="0.01" min="0" className="input-base" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="form-label">Reference</label>
                <input {...register("reference")} className="input-base" placeholder="PO-001, etc." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); reset(); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={isCreating} className="btn-primary flex-1">
                  {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
