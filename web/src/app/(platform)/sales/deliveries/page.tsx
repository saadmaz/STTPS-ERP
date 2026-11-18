"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { salesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, X, Truck, Trash2, Send } from "lucide-react";
import { toast } from "sonner";

const lineSchema = z.object({
  itemId: z.string().uuid(),
  soLineId: z.string().uuid().optional().or(z.literal("")),
  qty: z.coerce.number().min(0.01),
  uom: z.string().optional(),
  lineNumber: z.coerce.number(),
});

const schema = z.object({
  soId: z.string().uuid("Required"),
  warehouseId: z.string().uuid("Required"),
  number: z.string().min(1),
  deliveryDate: z.string().min(1),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});
type FormData = z.infer<typeof schema>;

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  POSTED: "bg-emerald-100 text-emerald-700",
};

export default function DeliveriesPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sales-deliveries", activeCompany?.id, statusFilter],
    queryFn: () => salesApi.deliveries.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      deliveryDate: new Date().toISOString().split("T")[0],
      lines: [{ itemId: "", qty: 1, lineNumber: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const create = useMutation({
    mutationFn: (d: FormData) => salesApi.deliveries.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-deliveries"] });
      toast.success("Delivery created");
      setShowForm(false);
      reset();
    },
    onError: () => toast.error("Failed to create delivery"),
  });

  const post = useMutation({
    mutationFn: (id: string) => salesApi.deliveries.post(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-deliveries"] });
      toast.success("Delivery posted — stock dispatched");
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? "Failed to post delivery"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Deliveries</h1>
          <p className="page-subtitle">Dispatch stock to customers</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> New Delivery
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select className="input-base max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">New Delivery</h2>
            <button onClick={() => { setShowForm(false); reset(); }} className="btn-ghost"><X size={16} /></button>
          </div>
          <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Delivery Number *</label>
                <input className="input-base" {...register("number")} />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Sales Order ID *</label>
                <input className="input-base" placeholder="UUID" {...register("soId")} />
                {errors.soId && <p className="form-error">{errors.soId.message}</p>}
              </div>
              <div>
                <label className="form-label">Warehouse ID *</label>
                <input className="input-base" placeholder="UUID" {...register("warehouseId")} />
                {errors.warehouseId && <p className="form-error">{errors.warehouseId.message}</p>}
              </div>
              <div>
                <label className="form-label">Delivery Date *</label>
                <input className="input-base" type="date" {...register("deliveryDate")} />
              </div>
              <div className="md:col-span-3">
                <label className="form-label">Notes</label>
                <textarea className="input-base" rows={2} {...register("notes")} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label">Lines</label>
                <button type="button" className="btn-ghost text-xs" onClick={() => append({ itemId: "", qty: 1, lineNumber: fields.length + 1 })}>
                  <Plus size={12} /> Add Line
                </button>
              </div>
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-4 gap-2 items-center">
                    <input className="input-base" placeholder="Item UUID" {...register(`lines.${i}.itemId`)} />
                    <input className="input-base" type="number" step="0.01" placeholder="Qty" {...register(`lines.${i}.qty`)} />
                    <input className="input-base" placeholder="SO Line ID (opt)" {...register(`lines.${i}.soLineId`)} />
                    <button type="button" onClick={() => remove(i)} className="btn-ghost text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={create.isPending}>
                {create.isPending && <Loader2 size={14} className="animate-spin" />} Save Delivery
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); reset(); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </div>
        ) : (data?.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Truck size={40} className="mb-3" />
            <p className="text-sm">No deliveries found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Customer</th>
                  <th>Sales Order</th>
                  <th>Warehouse</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((d: any) => (
                  <tr key={d.id}>
                    <td className="font-mono text-sm font-medium">{d.number}</td>
                    <td className="text-slate-600">{d.so?.customer?.name ?? "—"}</td>
                    <td className="font-mono text-xs text-slate-500">{d.so?.number}</td>
                    <td className="text-slate-600">{d.warehouse?.name}</td>
                    <td className="text-sm text-slate-500">{new Date(d.deliveryDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="text-right">
                      {d.status === "DRAFT" && (
                        <button
                          className="btn-ghost text-xs text-blue-600"
                          onClick={() => post.mutate(d.id)}
                          disabled={post.isPending}
                        >
                          <Send size={14} /> Post
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
