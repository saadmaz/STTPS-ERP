"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { manufacturingApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm, useFieldArray } from "react-hook-form";
import { Loader2, Plus, Play, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "badge-gray",
  RELEASED: "badge-blue",
  IN_PROGRESS: "badge-yellow",
  COMPLETED: "badge-green",
  CANCELLED: "badge-red",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-slate-400",
  NORMAL: "text-blue-600",
  HIGH: "text-orange-600",
  URGENT: "text-red-600",
};

export default function ProductionOrdersPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [produceId, setProduceId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["production-orders", activeCompany?.id],
    queryFn: () => manufacturingApi.orders.list(),
    enabled: !!activeCompany,
  });

  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm({
    defaultValues: {
      itemId: "",
      bomId: "",
      number: "",
      description: "",
      plannedQty: 1,
      uom: "EA",
      priority: "NORMAL",
      plannedStart: "",
      plannedEnd: "",
      components: [] as any[],
    },
  });

  const { fields: compFields, append: compAppend, remove: compRemove } = useFieldArray({ control, name: "components" });

  const produceForm = useForm({
    defaultValues: { producedQty: 0, scrapQty: 0, warehouseId: "", notes: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => manufacturingApi.orders.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      toast.success("Production order created");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create order"),
  });

  const releaseMutation = useMutation({
    mutationFn: (id: string) => manufacturingApi.orders.release(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      toast.success("Order released to production");
    },
    onError: () => toast.error("Failed to release order"),
  });

  const produceMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => manufacturingApi.orders.produce(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      toast.success("Production recorded");
      produceForm.reset();
      setProduceId(null);
    },
    onError: () => toast.error("Failed to record production"),
  });

  const onSubmit = (values: any) => {
    createMutation.mutate({
      ...values,
      plannedQty: Number(values.plannedQty),
      components: values.components.map((c: any, i: number) => ({
        ...c,
        requiredQty: Number(c.requiredQty),
        lineNumber: i + 1,
      })),
    });
  };

  const onProduce = (values: any) => {
    if (!produceId) return;
    produceMutation.mutate({
      id: produceId,
      data: {
        ...values,
        producedQty: Number(values.producedQty),
        scrapQty: Number(values.scrapQty),
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const orders = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Production Orders</h1>
          <p className="page-subtitle">{data?.total ?? 0} orders</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New Order
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Production Order</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Order Number</label>
                <input className="input-base" {...register("number", { required: true })} placeholder="PO-2024-001" />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Finished Good Item ID</label>
                <input className="input-base" {...register("itemId", { required: true })} placeholder="Item ID" />
                {errors.itemId && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">BOM ID (optional)</label>
                <input className="input-base" {...register("bomId")} placeholder="BOM ID — auto-populates components" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Planned Qty</label>
                <input className="input-base" type="number" step="0.001" {...register("plannedQty")} />
              </div>
              <div>
                <label className="form-label">UOM</label>
                <input className="input-base" {...register("uom")} placeholder="EA" />
              </div>
              <div>
                <label className="form-label">Priority</label>
                <select className="input-base" {...register("priority")}>
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Planned Start</label>
                <input className="input-base" type="date" {...register("plannedStart")} />
              </div>
              <div>
                <label className="form-label">Planned End</label>
                <input className="input-base" type="date" {...register("plannedEnd")} />
              </div>
            </div>

            {/* Manual components (optional if BOM ID is provided) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">Components (skip if BOM ID provided)</label>
                <button type="button" className="btn-secondary text-xs" onClick={() => compAppend({ itemId: "", description: "", requiredQty: 1, uom: "EA", lineNumber: compFields.length + 1 })}>
                  + Add Component
                </button>
              </div>
              {compFields.length > 0 && (
                <table className="table-base">
                  <thead>
                    <tr><th>Item ID</th><th>Description</th><th>Qty</th><th>UOM</th><th></th></tr>
                  </thead>
                  <tbody>
                    {compFields.map((f, i) => (
                      <tr key={f.id}>
                        <td><input className="input-base" {...register(`components.${i}.itemId`)} placeholder="Item ID" /></td>
                        <td><input className="input-base" {...register(`components.${i}.description`)} /></td>
                        <td><input className="input-base w-20" type="number" step="0.001" {...register(`components.${i}.requiredQty`)} /></td>
                        <td><input className="input-base w-16" {...register(`components.${i}.uom`)} /></td>
                        <td><button type="button" className="text-red-500 text-xs" onClick={() => compRemove(i)}>Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Order"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Production Modal */}
      {produceId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Record Production</h2>
            <form onSubmit={produceForm.handleSubmit(onProduce)} className="space-y-3">
              <div>
                <label className="form-label">Warehouse ID (destination)</label>
                <input className="input-base" {...produceForm.register("warehouseId", { required: true })} placeholder="Warehouse ID" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Produced Qty</label>
                  <input className="input-base" type="number" step="0.001" {...produceForm.register("producedQty")} />
                </div>
                <div>
                  <label className="form-label">Scrap Qty</label>
                  <input className="input-base" type="number" step="0.001" {...produceForm.register("scrapQty")} />
                </div>
              </div>
              <div>
                <label className="form-label">Notes</label>
                <input className="input-base" {...produceForm.register("notes")} />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => { produceForm.reset(); setProduceId(null); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={produceMutation.isPending}>
                  {produceMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {orders.length === 0 ? (
          <div className="card p-12 text-center text-slate-400">No production orders yet.</div>
        ) : (
          orders.map((o: any) => (
            <div key={o.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button className="text-slate-400 hover:text-slate-600" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                    {expandedId === o.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <div>
                    <p className="font-medium text-slate-800">{o.number}</p>
                    <p className="text-xs text-slate-500">
                      {o.item?.name ?? o.itemId} — {o.plannedQty} {o.uom}
                      {o.plannedStart && ` | Start: ${format(new Date(o.plannedStart), "MMM d, yyyy")}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx("text-xs font-semibold", PRIORITY_COLORS[o.priority] ?? "text-slate-500")}>{o.priority}</span>
                  <span className={clsx("badge", STATUS_COLORS[o.status] ?? "badge-gray")}>{o.status}</span>
                  {o.status === "DRAFT" && (
                    <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => releaseMutation.mutate(o.id)} disabled={releaseMutation.isPending}>
                      <Play size={12} /> Release
                    </button>
                  )}
                  {(o.status === "RELEASED" || o.status === "IN_PROGRESS") && (
                    <button className="btn-primary text-xs" onClick={() => setProduceId(o.id)}>Record Production</button>
                  )}
                </div>
              </div>

              {expandedId === o.id && (
                <div className="mt-4 ml-6 space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-xs text-slate-500">
                    <div><span className="font-medium text-slate-700">Planned:</span> {o.plannedQty} {o.uom}</div>
                    <div><span className="font-medium text-slate-700">Produced:</span> {o.producedQty} {o.uom}</div>
                    <div><span className="font-medium text-slate-700">Scrap:</span> {o.scrapQty} {o.uom}</div>
                  </div>
                  {o.components?.length > 0 && (
                    <table className="table-base">
                      <thead>
                        <tr><th>#</th><th>Item</th><th>Required</th><th>Issued</th><th>UOM</th></tr>
                      </thead>
                      <tbody>
                        {o.components.map((c: any) => (
                          <tr key={c.id}>
                            <td>{c.lineNumber}</td>
                            <td>{c.item?.name ?? c.itemId}</td>
                            <td>{c.requiredQty}</td>
                            <td>{c.issuedQty}</td>
                            <td>{c.uom}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
