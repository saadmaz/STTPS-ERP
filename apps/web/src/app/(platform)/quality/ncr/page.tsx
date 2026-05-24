"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { qualityApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, AlertTriangle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format, isPast } from "date-fns";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "badge-green",
  MEDIUM: "badge-yellow",
  HIGH: "badge-red",
  CRITICAL: "badge-red",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "badge-yellow",
  IN_REVIEW: "badge-blue",
  CORRECTIVE_ACTION: "badge-blue",
  CLOSED: "badge-green",
};

export default function NCRPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ncrs", activeCompany?.id, statusFilter, severityFilter],
    queryFn: () => qualityApi.ncr.list({ status: statusFilter || undefined, severity: severityFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { number: "", title: "", description: "", source: "INTERNAL", severity: "MEDIUM", raisedBy: "", dueDate: "" },
  });

  const actionForm = useForm({
    defaultValues: { actionType: "CORRECTIVE", description: "", assignedTo: "", dueDate: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => qualityApi.ncr.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ncrs"] }); toast.success("NCR created"); reset(); setShowForm(false); },
    onError: () => toast.error("Failed to create NCR"),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => qualityApi.ncr.close(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ncrs"] }); toast.success("NCR closed"); },
    onError: () => toast.error("Failed to close"),
  });

  const addActionMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => qualityApi.ncr.addAction(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ncrs"] }); toast.success("Action added"); actionForm.reset(); },
    onError: () => toast.error("Failed to add action"),
  });

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  const ncrs = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Non-Conformances</h1>
          <p className="page-subtitle">{data?.total ?? 0} NCRs</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> Raise NCR</button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Non-Conformance Report</h2>
          <form onSubmit={handleSubmit((v) => createMutation.mutate({ ...v, dueDate: v.dueDate || undefined }))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">NCR Number</label>
                <input className="input-base" {...register("number", { required: true })} placeholder="NCR-2024-001" />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Title</label>
                <input className="input-base" {...register("title", { required: true })} />
                {errors.title && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Severity</label>
                <select className="input-base" {...register("severity")}>
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s}>{s}</option>)}
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
                <label className="form-label">Source</label>
                <select className="input-base" {...register("source")}>
                  {["INTERNAL", "INSPECTION", "AUDIT", "CUSTOMER"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Raised By</label>
                <input className="input-base" {...register("raisedBy", { required: true })} />
                {errors.raisedBy && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Due Date</label>
                <input className="input-base" type="date" {...register("dueDate")} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Raise NCR"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex gap-1">
          {["", "OPEN", "IN_REVIEW", "CORRECTIVE_ACTION", "CLOSED"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
                statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
              {s || "All Status"}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {["", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
            <button key={s} onClick={() => setSeverityFilter(s)}
              className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
                severityFilter === s ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
              {s || "All Severity"}
            </button>
          ))}
        </div>
      </div>

      {ncrs.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <AlertTriangle size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No non-conformances found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ncrs.map((n: any) => {
            const overdue = n.dueDate && isPast(new Date(n.dueDate)) && n.status !== "CLOSED";
            const expanded = expandedId === n.id;
            return (
              <div key={n.id} className="card">
                <div className="p-4 flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-slate-600">{n.number}</span>
                      <span className={clsx("badge", STATUS_COLORS[n.status] ?? "badge-gray")}>{n.status}</span>
                      <span className={clsx("badge", SEVERITY_COLORS[n.severity] ?? "badge-gray")}>{n.severity}</span>
                    </div>
                    <p className="font-semibold text-slate-800">{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{n.source} · Raised by {n.raisedBy} on {format(new Date(n.raisedAt), "MMM d, yyyy")}
                      {n.dueDate && <span className={overdue ? " text-red-600 font-semibold" : ""}> · Due {format(new Date(n.dueDate), "MMM d, yyyy")}{overdue ? " ⚠" : ""}</span>}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{n.description}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {n.status !== "CLOSED" && (
                      <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => closeMutation.mutate(n.id)} disabled={closeMutation.isPending}>
                        <XCircle size={10} /> Close
                      </button>
                    )}
                    <button className="btn-ghost text-xs" onClick={() => setExpandedId(expanded ? null : n.id)}>
                      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-slate-600">Corrective Actions ({n.actions?.length ?? 0})</h3>
                    </div>
                    {n.actions?.length > 0 && (
                      <div className="space-y-2 mb-4">
                        {n.actions.map((a: any) => (
                          <div key={a.id} className="flex items-start gap-3 text-xs bg-slate-50 rounded p-2">
                            <span className={clsx("badge", a.status === "COMPLETED" ? "badge-green" : "badge-yellow")}>{a.actionType}</span>
                            <div className="flex-1">
                              <p className="text-slate-700">{a.description}</p>
                              <p className="text-slate-400">Assigned to {a.assignedTo}{a.dueDate ? ` · Due ${format(new Date(a.dueDate), "MMM d, yyyy")}` : ""}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <form onSubmit={actionForm.handleSubmit((v) => addActionMutation.mutate({ id: n.id, data: { ...v, dueDate: v.dueDate || undefined } }))} className="flex gap-2">
                      <select className="input-base text-xs flex-shrink-0 w-36" {...actionForm.register("actionType")}>
                        {["IMMEDIATE", "CORRECTIVE", "PREVENTIVE"].map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <input className="input-base text-xs flex-1" {...actionForm.register("description", { required: true })} placeholder="Action description" />
                      <input className="input-base text-xs w-32" {...actionForm.register("assignedTo", { required: true })} placeholder="Assigned to" />
                      <input className="input-base text-xs w-32" type="date" {...actionForm.register("dueDate")} />
                      <button type="submit" className="btn-primary text-xs" disabled={addActionMutation.isPending}>Add</button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
