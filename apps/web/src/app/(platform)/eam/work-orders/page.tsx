"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { eamApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm, useFieldArray } from "react-hook-form";
import { Loader2, Plus, Play, CheckCircle } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "badge-yellow",
  IN_PROGRESS: "badge-blue",
  ON_HOLD: "badge-gray",
  COMPLETED: "badge-green",
  CANCELLED: "badge-red",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-slate-400",
  NORMAL: "text-blue-600",
  HIGH: "text-orange-600",
  CRITICAL: "text-red-600",
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function WorkOrdersPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["work-orders", activeCompany?.id, statusFilter],
    queryFn: () => eamApi.workOrders.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      assetId: "", number: "", type: "CORRECTIVE", priority: "NORMAL",
      description: "", failureCode: "", assignedTo: "",
      scheduledStart: "", scheduledEnd: "", estimatedHours: "",
    },
  });

  const completeForm = useForm({
    defaultValues: {
      resolution: "",
      actualHours: "",
      costs: [] as { type: string; description: string; quantity: number; unitCost: number }[],
    },
  });
  const { fields: costFields, append: costAppend, remove: costRemove } = useFieldArray({ control: completeForm.control, name: "costs" });

  const createMutation = useMutation({
    mutationFn: (data: any) => eamApi.workOrders.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      toast.success("Work order created");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create work order"),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => eamApi.workOrders.start(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-orders"] }); toast.success("Work order started"); },
    onError: () => toast.error("Failed to start"),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => eamApi.workOrders.complete(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      toast.success("Work order completed");
      completeForm.reset();
      setCompleteId(null);
    },
    onError: () => toast.error("Failed to complete"),
  });

  const onSubmit = (values: any) => {
    createMutation.mutate({
      ...values,
      estimatedHours: values.estimatedHours ? Number(values.estimatedHours) : undefined,
      scheduledStart: values.scheduledStart || undefined,
      scheduledEnd: values.scheduledEnd || undefined,
      assignedTo: values.assignedTo || undefined,
      failureCode: values.failureCode || undefined,
    });
  };

  const onComplete = (values: any) => {
    if (!completeId) return;
    completeMutation.mutate({
      id: completeId,
      data: {
        resolution: values.resolution || undefined,
        actualHours: values.actualHours ? Number(values.actualHours) : undefined,
        costs: values.costs.map((c: any) => ({
          ...c,
          quantity: Number(c.quantity),
          unitCost: Number(c.unitCost),
        })),
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
          <h1 className="page-title">Work Orders</h1>
          <p className="page-subtitle">{data?.total ?? 0} work orders</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New Work Order
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Work Order</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">WO Number</label>
                <input className="input-base" {...register("number", { required: true })} placeholder="WO-2024-001" />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Asset ID</label>
                <input className="input-base" {...register("assetId", { required: true })} placeholder="Asset ID" />
                {errors.assetId && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Type</label>
                <select className="input-base" {...register("type")}>
                  {["CORRECTIVE", "PREVENTIVE", "INSPECTION"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Priority</label>
                <select className="input-base" {...register("priority")}>
                  {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="form-label">Description</label>
              <input className="input-base" {...register("description", { required: true })} placeholder="Describe the issue or task" />
              {errors.description && <p className="form-error">Required</p>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Failure Code</label>
                <input className="input-base" {...register("failureCode")} placeholder="Optional" />
              </div>
              <div>
                <label className="form-label">Assigned To (ID)</label>
                <input className="input-base" {...register("assignedTo")} placeholder="Employee ID" />
              </div>
              <div>
                <label className="form-label">Scheduled Start</label>
                <input className="input-base" type="date" {...register("scheduledStart")} />
              </div>
              <div>
                <label className="form-label">Estimated Hours</label>
                <input className="input-base" type="number" step="0.5" {...register("estimatedHours")} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Work Order"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Complete Work Order Modal */}
      {completeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Complete Work Order</h2>
            <form onSubmit={completeForm.handleSubmit(onComplete)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Actual Hours</label>
                  <input className="input-base" type="number" step="0.5" {...completeForm.register("actualHours")} />
                </div>
              </div>
              <div>
                <label className="form-label">Resolution</label>
                <textarea className="input-base" rows={2} {...completeForm.register("resolution")} placeholder="Describe what was done" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="form-label mb-0">Costs (optional)</label>
                  <button type="button" className="btn-secondary text-xs"
                    onClick={() => costAppend({ type: "LABOR", description: "", quantity: 1, unitCost: 0 })}>
                    + Add Cost
                  </button>
                </div>
                {costFields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-4 gap-2 mb-2">
                    <select className="input-base text-xs" {...completeForm.register(`costs.${i}.type`)}>
                      {["LABOR", "PARTS", "CONTRACTOR", "OTHER"].map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <input className="input-base text-xs" {...completeForm.register(`costs.${i}.description`)} placeholder="Description" />
                    <input className="input-base text-xs w-16" type="number" step="0.5" {...completeForm.register(`costs.${i}.quantity`)} placeholder="Qty" />
                    <div className="flex gap-1">
                      <input className="input-base text-xs" type="number" step="0.01" {...completeForm.register(`costs.${i}.unitCost`)} placeholder="Unit $" />
                      <button type="button" className="text-red-500 text-xs" onClick={() => costRemove(i)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => { completeForm.reset(); setCompleteId(null); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={completeMutation.isPending}>
                  {completeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Complete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {["", "OPEN", "IN_PROGRESS", "ON_HOLD", "COMPLETED"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}>
            {s || "All"}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">No work orders found.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Number</th>
                <th>Asset</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Description</th>
                <th>Reported</th>
                <th>Cost</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((wo: any) => (
                <tr key={wo.id}>
                  <td className="font-mono text-sm font-medium">{wo.number}</td>
                  <td>
                    <p className="font-medium text-sm">{wo.asset?.name}</p>
                    <p className="text-xs text-slate-400">{wo.asset?.location}</p>
                  </td>
                  <td className="text-sm">{wo.type}</td>
                  <td><span className={clsx("text-xs font-bold", PRIORITY_COLORS[wo.priority])}>{wo.priority}</span></td>
                  <td className="text-sm text-slate-600 max-w-xs truncate">{wo.description}</td>
                  <td className="text-xs text-slate-500">{format(new Date(wo.reportedAt), "MMM d, yyyy")}</td>
                  <td className="font-mono text-sm">${fmt(Number(wo.totalCost))}</td>
                  <td><span className={clsx("badge", STATUS_COLORS[wo.status] ?? "badge-gray")}>{wo.status}</span></td>
                  <td>
                    <div className="flex gap-1">
                      {wo.status === "OPEN" && (
                        <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => startMutation.mutate(wo.id)} disabled={startMutation.isPending}>
                          <Play size={10} /> Start
                        </button>
                      )}
                      {wo.status === "IN_PROGRESS" && (
                        <button className="btn-primary text-xs flex items-center gap-1" onClick={() => setCompleteId(wo.id)}>
                          <CheckCircle size={10} /> Complete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
