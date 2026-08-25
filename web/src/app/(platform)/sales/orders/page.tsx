"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { salesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, X, ClipboardList, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

const lineSchema = z.object({
  itemId: z.string().uuid(),
  description: z.string().optional(),
  qty: z.coerce.number().min(0.01),
  uom: z.string().optional(),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).max(100).optional(),
  lineNumber: z.coerce.number(),
});

const schema = z.object({
  customerId: z.string().uuid("Required"),
  number: z.string().min(1),
  orderDate: z.string().min(1),
  requestedDate: z.string().optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});
type FormData = z.infer<typeof schema>;

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  APPROVED: "bg-blue-100 text-blue-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  INVOICED: "bg-violet-100 text-violet-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function SalesOrdersPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sales-orders", activeCompany?.id, statusFilter],
    queryFn: () => salesApi.orders.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      currency: "USD",
      orderDate: new Date().toISOString().split("T")[0],
      lines: [{ itemId: "", qty: 1, unitPrice: 0, discount: 0, lineNumber: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const create = useMutation({
    mutationFn: (d: FormData) => salesApi.orders.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Sales order created");
      setShowForm(false);
      reset();
    },
    onError: () => toast.error("Failed to create order"),
  });

  const approve = useMutation({
    mutationFn: (id: string) => salesApi.orders.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Order approved");
    },
    onError: () => toast.error("Failed to approve order"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Orders</h1>
          <p className="page-subtitle">Manage customer orders</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> New Order
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
            <h2 className="text-sm font-semibold text-slate-700">New Sales Order</h2>
            <button onClick={() => { setShowForm(false); reset(); }} className="btn-ghost"><X size={16} /></button>
          </div>
          <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Order Number *</label>
                <input className="input-base" {...register("number")} />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Customer ID *</label>
                <input className="input-base" placeholder="UUID" {...register("customerId")} />
                {errors.customerId && <p className="form-error">{errors.customerId.message}</p>}
              </div>
              <div>
                <label className="form-label">Currency</label>
                <input className="input-base" {...register("currency")} />
              </div>
              <div>
                <label className="form-label">Order Date *</label>
                <input className="input-base" type="date" {...register("orderDate")} />
              </div>
              <div>
                <label className="form-label">Requested Date</label>
                <input className="input-base" type="date" {...register("requestedDate")} />
              </div>
              <div className="md:col-span-3">
                <label className="form-label">Notes</label>
                <textarea className="input-base" rows={2} {...register("notes")} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label">Lines</label>
                <button type="button" className="btn-ghost text-xs" onClick={() => append({ itemId: "", qty: 1, unitPrice: 0, discount: 0, lineNumber: fields.length + 1 })}>
                  <Plus size={12} /> Add Line
                </button>
              </div>
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-5 gap-2 items-center">
                    <input className="input-base" placeholder="Item UUID" {...register(`lines.${i}.itemId`)} />
                    <input className="input-base" type="number" step="0.01" placeholder="Qty" {...register(`lines.${i}.qty`)} />
                    <input className="input-base" type="number" step="0.01" placeholder="Unit Price" {...register(`lines.${i}.unitPrice`)} />
                    <input className="input-base" type="number" step="0.01" placeholder="Discount %" {...register(`lines.${i}.discount`)} />
                    <button type="button" onClick={() => remove(i)} className="btn-ghost text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={create.isPending}>
                {create.isPending && <Loader2 size={14} className="animate-spin" />} Save Order
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
            <ClipboardList size={40} className="mb-3" />
            <p className="text-sm">No sales orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((o: any) => (
                  <tr key={o.id}>
                    <td className="font-mono text-sm font-medium">{o.number}</td>
                    <td className="text-slate-600">{o.customer?.name}</td>
                    <td className="text-sm text-slate-500">{new Date(o.orderDate).toLocaleDateString()}</td>
                    <td className="text-right font-mono text-sm">{fmt(Number(o.total))}</td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[o.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="text-right">
                      {o.status === "DRAFT" && (
                        <button
                          className="btn-ghost text-xs text-emerald-600"
                          onClick={() => approve.mutate(o.id)}
                          disabled={approve.isPending}
                        >
                          <CheckCircle2 size={14} /> Approve
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
