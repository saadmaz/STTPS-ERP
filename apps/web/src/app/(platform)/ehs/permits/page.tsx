"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ehsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, FileText, CheckCircle, XCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format, isPast } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "badge-yellow",
  APPROVED: "badge-green",
  IN_PROGRESS: "badge-blue",
  CLOSED: "badge-gray",
  CANCELLED: "badge-red",
};

const PERMIT_TYPES: Record<string, string> = {
  HOT_WORK: "Hot Work",
  CONFINED_SPACE: "Confined Space",
  ELECTRICAL: "Electrical",
  HEIGHTS: "Work at Heights",
  EXCAVATION: "Excavation",
  GENERAL: "General",
};

export default function PermitsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ehs-permits", activeCompany?.id, statusFilter],
    queryFn: () => ehsApi.permits.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { number: "", permitType: "GENERAL", title: "", location: "", requestedBy: "", validFrom: "", validTo: "", conditions: "" },
  });

  const approveForm = useForm({ defaultValues: { approvedBy: "" } });

  const createMutation = useMutation({
    mutationFn: (data: any) => ehsApi.permits.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ehs-permits"] }); toast.success("Permit created"); reset(); setShowForm(false); },
    onError: () => toast.error("Failed to create permit"),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => ehsApi.permits.approve(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ehs-permits"] }); toast.success("Permit approved"); approveForm.reset(); setApproveId(null); },
    onError: () => toast.error("Failed to approve"),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => ehsApi.permits.close(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ehs-permits"] }); toast.success("Permit closed"); },
    onError: () => toast.error("Failed to close"),
  });

  if (isLoading) return <PageLoader />;

  const permits = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Permits to Work</h1>
          <p className="page-subtitle">{data?.total ?? 0} permits</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> New Permit</button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Permit to Work</h2>
          <form onSubmit={handleSubmit((v) => createMutation.mutate({ ...v, location: v.location || undefined, conditions: v.conditions || undefined }))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Permit Number</label>
                <input className="input-base" {...register("number", { required: true })} placeholder="PTW-2024-001" />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Title</label>
                <input className="input-base" {...register("title", { required: true })} />
                {errors.title && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Permit Type</label>
                <select className="input-base" {...register("permitType")}>
                  {Object.keys(PERMIT_TYPES).map((t) => <option key={t} value={t}>{PERMIT_TYPES[t]}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Requested By</label>
                <input className="input-base" {...register("requestedBy", { required: true })} />
                {errors.requestedBy && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Location</label>
                <input className="input-base" {...register("location")} />
              </div>
              <div>
                <label className="form-label">Valid From</label>
                <input className="input-base" type="datetime-local" {...register("validFrom", { required: true })} />
                {errors.validFrom && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Valid To</label>
                <input className="input-base" type="datetime-local" {...register("validTo", { required: true })} />
                {errors.validTo && <p className="form-error">Required</p>}
              </div>
            </div>
            <div>
              <label className="form-label">Conditions / Precautions</label>
              <textarea className="input-base" rows={2} {...register("conditions")} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Permit"}
              </button>
            </div>
          </form>
        </div>
      )}

      {approveId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Approve Permit</h2>
            <form onSubmit={approveForm.handleSubmit((v) => approveMutation.mutate({ id: approveId, data: v }))} className="space-y-3">
              <div>
                <label className="form-label">Approved By</label>
                <input className="input-base" {...approveForm.register("approvedBy", { required: true })} placeholder="Approver name / ID" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn-secondary" onClick={() => { approveForm.reset(); setApproveId(null); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={approveMutation.isPending}>
                  {approveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Approve"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {["", "PENDING", "APPROVED", "CLOSED"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {s || "All"}
          </button>
        ))}
      </div>

      {permits.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <FileText size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No permits to work found.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Type</th>
                <th>Requested By</th>
                <th>Location</th>
                <th>Valid Period</th>
                <th>Approved By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {permits.map((p: any) => {
                const expired = isPast(new Date(p.validTo)) && p.status === "APPROVED";
                return (
                  <tr key={p.id}>
                    <td className="font-mono text-sm">{p.number}</td>
                    <td>
                      <p className="font-medium text-sm text-slate-800">{p.title}</p>
                      {p.conditions && <p className="text-xs text-slate-400 truncate max-w-xs">{p.conditions}</p>}
                    </td>
                    <td><span className="badge badge-gray">{PERMIT_TYPES[p.permitType] ?? p.permitType}</span></td>
                    <td className="text-sm">{p.requestedBy}</td>
                    <td className="text-sm">{p.location ?? "—"}</td>
                    <td className="text-xs text-slate-500">
                      {format(new Date(p.validFrom), "MMM d, HH:mm")} →{" "}
                      <span className={expired ? "text-red-600 font-semibold" : ""}>{format(new Date(p.validTo), "MMM d, HH:mm")}</span>
                    </td>
                    <td className="text-sm">{p.approvedBy ?? "—"}</td>
                    <td>
                      <span className={clsx("badge", expired ? "badge-red" : STATUS_COLORS[p.status] ?? "badge-gray")}>
                        {expired ? "EXPIRED" : p.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {p.status === "PENDING" && (
                          <button className="btn-primary text-xs flex items-center gap-1" onClick={() => setApproveId(p.id)}>
                            <CheckCircle size={10} /> Approve
                          </button>
                        )}
                        {["PENDING", "APPROVED"].includes(p.status) && (
                          <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => closeMutation.mutate(p.id)} disabled={closeMutation.isPending}>
                            <XCircle size={10} /> Close
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

