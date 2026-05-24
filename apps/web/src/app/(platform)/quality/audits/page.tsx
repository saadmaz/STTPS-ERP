"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { qualityApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, FileText, Play, CheckCircle } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  PLANNED: "badge-blue",
  IN_PROGRESS: "badge-yellow",
  COMPLETED: "badge-green",
  CANCELLED: "badge-red",
};

const RESULT_COLORS: Record<string, string> = {
  CONFORMING: "badge-green",
  MINOR_NC: "badge-yellow",
  MAJOR_NC: "badge-red",
};

export default function AuditsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audits", activeCompany?.id, statusFilter],
    queryFn: () => qualityApi.audits.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { number: "", title: "", auditType: "INTERNAL", standard: "", scope: "", leadAuditor: "", scheduledStart: "", scheduledEnd: "" },
  });

  const completeForm = useForm({
    defaultValues: { findings: "", result: "CONFORMING" },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => qualityApi.audits.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["audits"] }); toast.success("Audit created"); reset(); setShowForm(false); },
    onError: () => toast.error("Failed to create audit"),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => qualityApi.audits.start(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["audits"] }); toast.success("Audit started"); },
    onError: () => toast.error("Failed to start"),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => qualityApi.audits.complete(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["audits"] }); toast.success("Audit completed"); completeForm.reset(); setCompleteId(null); },
    onError: () => toast.error("Failed to complete"),
  });

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  const audits = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audits</h1>
          <p className="page-subtitle">{data?.total ?? 0} audits</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> Schedule Audit</button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Schedule Audit</h2>
          <form onSubmit={handleSubmit((v) => createMutation.mutate({ ...v, standard: v.standard || undefined, scope: v.scope || undefined }))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Audit Number</label>
                <input className="input-base" {...register("number", { required: true })} placeholder="AUD-2024-001" />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Title</label>
                <input className="input-base" {...register("title", { required: true })} />
                {errors.title && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Type</label>
                <select className="input-base" {...register("auditType")}>
                  {["INTERNAL", "EXTERNAL", "SUPPLIER"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Lead Auditor</label>
                <input className="input-base" {...register("leadAuditor", { required: true })} />
                {errors.leadAuditor && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Standard</label>
                <input className="input-base" {...register("standard")} placeholder="ISO 9001, ISO 45001..." />
              </div>
              <div>
                <label className="form-label">Scheduled Start</label>
                <input className="input-base" type="date" {...register("scheduledStart", { required: true })} />
                {errors.scheduledStart && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Scheduled End</label>
                <input className="input-base" type="date" {...register("scheduledEnd", { required: true })} />
                {errors.scheduledEnd && <p className="form-error">Required</p>}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Schedule Audit"}
              </button>
            </div>
          </form>
        </div>
      )}

      {completeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-5 w-full max-w-md">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Complete Audit</h2>
            <form onSubmit={completeForm.handleSubmit((v) => completeMutation.mutate({ id: completeId, data: v }))} className="space-y-3">
              <div>
                <label className="form-label">Overall Result</label>
                <select className="input-base" {...completeForm.register("result")}>
                  {["CONFORMING", "MINOR_NC", "MAJOR_NC"].map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Findings Summary</label>
                <textarea className="input-base" rows={4} {...completeForm.register("findings")} placeholder="Summary of audit findings..." />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn-secondary" onClick={() => { completeForm.reset(); setCompleteId(null); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={completeMutation.isPending}>
                  {completeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Complete Audit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {["", "PLANNED", "IN_PROGRESS", "COMPLETED"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {s || "All"}
          </button>
        ))}
      </div>

      {audits.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <FileText size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No audits scheduled yet.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Type</th>
                <th>Lead Auditor</th>
                <th>Period</th>
                <th>Findings</th>
                <th>Result</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a: any) => (
                <tr key={a.id}>
                  <td className="font-mono text-sm">{a.number}</td>
                  <td>
                    <p className="font-medium text-sm text-slate-800">{a.title}</p>
                    {a.standard && <p className="text-xs text-slate-400">{a.standard}</p>}
                  </td>
                  <td><span className="badge badge-gray">{a.auditType}</span></td>
                  <td className="text-sm">{a.leadAuditor}</td>
                  <td className="text-xs text-slate-500">
                    {format(new Date(a.scheduledStart), "MMM d")} – {format(new Date(a.scheduledEnd), "MMM d, yyyy")}
                  </td>
                  <td className="text-sm text-center">{a.findings_?.length ?? 0}</td>
                  <td>
                    {a.result ? <span className={clsx("badge", RESULT_COLORS[a.result] ?? "badge-gray")}>{a.result}</span> : "—"}
                  </td>
                  <td><span className={clsx("badge", STATUS_COLORS[a.status] ?? "badge-gray")}>{a.status}</span></td>
                  <td>
                    <div className="flex gap-1">
                      {a.status === "PLANNED" && (
                        <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => startMutation.mutate(a.id)} disabled={startMutation.isPending}>
                          <Play size={10} /> Start
                        </button>
                      )}
                      {a.status === "IN_PROGRESS" && (
                        <button className="btn-primary text-xs flex items-center gap-1" onClick={() => setCompleteId(a.id)}>
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
