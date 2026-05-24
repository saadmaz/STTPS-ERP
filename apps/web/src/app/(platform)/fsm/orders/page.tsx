"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fsmApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, UserCheck, Play, CheckCircle } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format, isPast } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "badge-yellow",
  ASSIGNED: "badge-blue",
  IN_PROGRESS: "badge-blue",
  PENDING_PARTS: "badge-gray",
  COMPLETED: "badge-green",
  CANCELLED: "badge-red",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-slate-400",
  NORMAL: "text-blue-600",
  HIGH: "text-orange-600",
  CRITICAL: "text-red-600",
};

export default function ServiceOrdersPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["service-orders", activeCompany?.id, statusFilter],
    queryFn: () => fsmApi.orders.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { data: technicians } = useQuery({
    queryKey: ["fsm-technicians", activeCompany?.id],
    queryFn: () => fsmApi.technicians.list(),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      number: "", title: "", description: "", contractId: "", customerId: "",
      technicianId: "", type: "REPAIR", priority: "NORMAL",
      location: "", contactName: "", contactPhone: "", scheduledAt: "",
    },
  });

  const assignForm = useForm({ defaultValues: { technicianId: "", scheduledAt: "" } });
  const completeForm = useForm({ defaultValues: { resolution: "", customerRating: "" } });

  const createMutation = useMutation({
    mutationFn: (data: any) => fsmApi.orders.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-orders"] });
      toast.success("Service order created");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create service order"),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => fsmApi.orders.assign(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-orders"] });
      toast.success("Technician assigned");
      assignForm.reset();
      setAssignId(null);
    },
    onError: () => toast.error("Failed to assign"),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => fsmApi.orders.start(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["service-orders"] }); toast.success("Order started"); },
    onError: () => toast.error("Failed to start"),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => fsmApi.orders.complete(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-orders"] });
      toast.success("Service order completed");
      completeForm.reset();
      setCompleteId(null);
    },
    onError: () => toast.error("Failed to complete"),
  });

  const onSubmit = (values: any) => {
    createMutation.mutate({
      ...values,
      contractId: values.contractId || undefined,
      customerId: values.customerId || undefined,
      technicianId: values.technicianId || undefined,
      scheduledAt: values.scheduledAt || undefined,
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
          <h1 className="page-title">Service Orders</h1>
          <p className="page-subtitle">{data?.total ?? 0} service orders</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New Order
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Service Order</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Order Number</label>
                <input className="input-base" {...register("number", { required: true })} placeholder="SO-2024-001" />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Title</label>
                <input className="input-base" {...register("title", { required: true })} placeholder="Equipment repair request" />
                {errors.title && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Type</label>
                <select className="input-base" {...register("type")}>
                  {["REPAIR", "INSTALLATION", "INSPECTION", "PREVENTIVE"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="form-label">Description</label>
              <textarea className="input-base" rows={2} {...register("description", { required: true })} />
              {errors.description && <p className="form-error">Required</p>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Priority</label>
                <select className="input-base" {...register("priority")}>
                  {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Customer ID</label>
                <input className="input-base" {...register("customerId")} placeholder="Optional" />
              </div>
              <div>
                <label className="form-label">Contract ID</label>
                <input className="input-base" {...register("contractId")} placeholder="Optional (sets SLA)" />
              </div>
              <div>
                <label className="form-label">Technician</label>
                <select className="input-base" {...register("technicianId")}>
                  <option value="">— Unassigned —</option>
                  {(technicians ?? []).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.status})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Location</label>
                <input className="input-base" {...register("location")} />
              </div>
              <div>
                <label className="form-label">Contact Name</label>
                <input className="input-base" {...register("contactName")} />
              </div>
              <div>
                <label className="form-label">Scheduled At</label>
                <input className="input-base" type="datetime-local" {...register("scheduledAt")} />
              </div>
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

      {/* Assign Modal */}
      {assignId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Assign Technician</h2>
            <form onSubmit={assignForm.handleSubmit((v) => assignMutation.mutate({ id: assignId, data: { ...v, scheduledAt: v.scheduledAt || undefined } }))} className="space-y-3">
              <div>
                <label className="form-label">Technician</label>
                <select className="input-base" {...assignForm.register("technicianId", { required: true })}>
                  <option value="">Select technician</option>
                  {(technicians ?? []).filter((t: any) => t.isActive).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name} — {t.status}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Scheduled At</label>
                <input className="input-base" type="datetime-local" {...assignForm.register("scheduledAt")} />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn-secondary" onClick={() => { assignForm.reset(); setAssignId(null); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={assignMutation.isPending}>
                  {assignMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Assign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Modal */}
      {completeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Complete Service Order</h2>
            <form onSubmit={completeForm.handleSubmit((v) => completeMutation.mutate({ id: completeId, data: { resolution: v.resolution, customerRating: v.customerRating ? Number(v.customerRating) : undefined } }))} className="space-y-3">
              <div>
                <label className="form-label">Resolution</label>
                <textarea className="input-base" rows={3} {...completeForm.register("resolution")} placeholder="What was done to resolve the issue?" />
              </div>
              <div>
                <label className="form-label">Customer Rating (1-5)</label>
                <select className="input-base" {...completeForm.register("customerRating")}>
                  <option value="">— No rating —</option>
                  {[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{"★".repeat(r)} ({r})</option>)}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
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
        {["", "OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}>
            {s || "All"}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">No service orders found.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Priority</th>
                <th>Technician</th>
                <th>Customer</th>
                <th>Scheduled</th>
                <th>SLA</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => {
                const slaBreach = o.slaDeadline && isPast(new Date(o.slaDeadline)) && o.status !== "COMPLETED";
                return (
                  <tr key={o.id}>
                    <td className="font-mono text-sm">{o.number}</td>
                    <td>
                      <p className="font-medium text-sm text-slate-800">{o.title}</p>
                      <p className="text-xs text-slate-400">{o.type}{o.location ? ` · ${o.location}` : ""}</p>
                    </td>
                    <td><span className={clsx("text-xs font-bold", PRIORITY_COLORS[o.priority])}>{o.priority}</span></td>
                    <td className="text-sm">{o.technician?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                    <td className="text-sm">{o.customer?.name ?? "—"}</td>
                    <td className="text-xs text-slate-500">{o.scheduledAt ? format(new Date(o.scheduledAt), "MMM d, HH:mm") : "—"}</td>
                    <td className="text-xs">
                      {o.slaDeadline ? (
                        <span className={slaBreach ? "text-red-600 font-semibold" : "text-slate-500"}>
                          {format(new Date(o.slaDeadline), "MMM d, HH:mm")}
                          {slaBreach && " ⚠"}
                        </span>
                      ) : "—"}
                    </td>
                    <td><span className={clsx("badge", STATUS_COLORS[o.status] ?? "badge-gray")}>{o.status}</span></td>
                    <td>
                      <div className="flex gap-1">
                        {["OPEN", "ASSIGNED"].includes(o.status) && (
                          <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => setAssignId(o.id)}>
                            <UserCheck size={10} /> Assign
                          </button>
                        )}
                        {o.status === "ASSIGNED" && (
                          <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => startMutation.mutate(o.id)} disabled={startMutation.isPending}>
                            <Play size={10} /> Start
                          </button>
                        )}
                        {o.status === "IN_PROGRESS" && (
                          <button className="btn-primary text-xs flex items-center gap-1" onClick={() => setCompleteId(o.id)}>
                            <CheckCircle size={10} /> Complete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
