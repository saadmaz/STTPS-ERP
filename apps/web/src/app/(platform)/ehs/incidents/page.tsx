"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ehsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, AlertTriangle, XCircle, Search } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  REPORTED: "badge-yellow",
  INVESTIGATING: "badge-blue",
  CORRECTIVE_ACTION: "badge-blue",
  CLOSED: "badge-green",
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "badge-green",
  MEDIUM: "badge-yellow",
  HIGH: "badge-red",
  CRITICAL: "badge-red",
};

const TYPE_LABELS: Record<string, string> = {
  ACCIDENT: "Accident",
  NEAR_MISS: "Near Miss",
  HAZARD: "Hazard",
  PROPERTY_DAMAGE: "Property Damage",
  ENVIRONMENTAL: "Environmental",
};

export default function IncidentsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [investigateId, setInvestigateId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ehs-incidents", activeCompany?.id, statusFilter],
    queryFn: () => ehsApi.incidents.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { number: "", title: "", incidentType: "NEAR_MISS", severity: "LOW", reportedBy: "", occurredAt: "", location: "", description: "", injuries: "", witnesses: "" },
  });

  const investigateForm = useForm({ defaultValues: { rootCause: "", preventiveActions: "" } });

  const createMutation = useMutation({
    mutationFn: (data: any) => ehsApi.incidents.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ehs-incidents"] }); toast.success("Incident reported"); reset(); setShowForm(false); },
    onError: () => toast.error("Failed to report incident"),
  });

  const investigateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => ehsApi.incidents.investigate(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ehs-incidents"] }); toast.success("Investigation updated"); investigateForm.reset(); setInvestigateId(null); },
    onError: () => toast.error("Failed to update investigation"),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => ehsApi.incidents.close(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ehs-incidents"] }); toast.success("Incident closed"); },
    onError: () => toast.error("Failed to close"),
  });

  if (isLoading) return <PageLoader />;

  const incidents = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Incidents</h1>
          <p className="page-subtitle">{data?.total ?? 0} incidents</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> Report Incident</button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Report New Incident</h2>
          <form onSubmit={handleSubmit((v) => createMutation.mutate({ ...v, injuries: v.injuries || undefined, witnesses: v.witnesses || undefined, location: v.location || undefined }))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Incident Number</label>
                <input className="input-base" {...register("number", { required: true })} placeholder="INC-2024-001" />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Title</label>
                <input className="input-base" {...register("title", { required: true })} />
                {errors.title && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Type</label>
                <select className="input-base" {...register("incidentType")}>
                  {Object.keys(TYPE_LABELS).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Severity</label>
                <select className="input-base" {...register("severity")}>
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Reported By</label>
                <input className="input-base" {...register("reportedBy", { required: true })} />
                {errors.reportedBy && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Occurred At</label>
                <input className="input-base" type="datetime-local" {...register("occurredAt", { required: true })} />
                {errors.occurredAt && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Location</label>
                <input className="input-base" {...register("location")} />
              </div>
            </div>
            <div>
              <label className="form-label">Description</label>
              <textarea className="input-base" rows={2} {...register("description", { required: true })} />
              {errors.description && <p className="form-error">Required</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Injuries / First Aid</label>
                <input className="input-base" {...register("injuries")} placeholder="None / describe injuries" />
              </div>
              <div>
                <label className="form-label">Witnesses</label>
                <input className="input-base" {...register("witnesses")} placeholder="Witness names" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Report Incident"}
              </button>
            </div>
          </form>
        </div>
      )}

      {investigateId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-5 w-full max-w-md">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Investigation Details</h2>
            <form onSubmit={investigateForm.handleSubmit((v) => investigateMutation.mutate({ id: investigateId, data: v }))} className="space-y-3">
              <div>
                <label className="form-label">Root Cause</label>
                <textarea className="input-base" rows={3} {...investigateForm.register("rootCause")} placeholder="Identified root cause(s)..." />
              </div>
              <div>
                <label className="form-label">Preventive Actions</label>
                <textarea className="input-base" rows={3} {...investigateForm.register("preventiveActions")} placeholder="Actions to prevent recurrence..." />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn-secondary" onClick={() => { investigateForm.reset(); setInvestigateId(null); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={investigateMutation.isPending}>
                  {investigateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Update Investigation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {["", "REPORTED", "INVESTIGATING", "CORRECTIVE_ACTION", "CLOSED"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {s || "All"}
          </button>
        ))}
      </div>

      {incidents.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <AlertTriangle size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No incidents recorded.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Location</th>
                <th>Occurred</th>
                <th>Reported By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i: any) => (
                <tr key={i.id}>
                  <td className="font-mono text-sm">{i.number}</td>
                  <td>
                    <p className="font-medium text-sm text-slate-800">{i.title}</p>
                    <p className="text-xs text-slate-400 truncate max-w-xs">{i.description}</p>
                  </td>
                  <td className="text-sm">{TYPE_LABELS[i.incidentType] ?? i.incidentType}</td>
                  <td><span className={clsx("badge", SEVERITY_COLORS[i.severity] ?? "badge-gray")}>{i.severity}</span></td>
                  <td className="text-sm">{i.location ?? "—"}</td>
                  <td className="text-xs text-slate-500">{format(new Date(i.occurredAt), "MMM d, yyyy HH:mm")}</td>
                  <td className="text-sm">{i.reportedBy}</td>
                  <td><span className={clsx("badge", STATUS_COLORS[i.status] ?? "badge-gray")}>{i.status}</span></td>
                  <td>
                    <div className="flex gap-1">
                      {i.status === "REPORTED" && (
                        <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => setInvestigateId(i.id)}>
                          <Search size={10} /> Investigate
                        </button>
                      )}
                      {i.status !== "CLOSED" && (
                        <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => closeMutation.mutate(i.id)} disabled={closeMutation.isPending}>
                          <XCircle size={10} /> Close
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

