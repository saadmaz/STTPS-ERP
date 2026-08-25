"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, FileText, CheckCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "badge-gray",
  SUBMITTED: "badge-yellow",
  APPROVED: "badge-green",
  REJECTED: "badge-red",
};

export default function TimesheetsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: projectsData } = useQuery({
    queryKey: ["projects-list", activeCompany?.id],
    queryFn: () => projectsApi.projects.list({ limit: 100 }),
    enabled: !!activeCompany,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["timesheets", activeCompany?.id, projectFilter, statusFilter],
    queryFn: () => projectsApi.timesheets.list({ projectId: projectFilter || undefined, status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { projectId: "", taskId: "", employeeId: "", date: "", hours: "", description: "", billable: true },
  });

  const approveForm = useForm({ defaultValues: { approvedBy: "" } });

  const createMutation = useMutation({
    mutationFn: (data: any) => projectsApi.timesheets.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timesheets"] }); toast.success("Timesheet entry added"); reset(); setShowForm(false); },
    onError: () => toast.error("Failed to add timesheet"),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => projectsApi.timesheets.approve(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timesheets"] }); toast.success("Timesheet approved"); approveForm.reset(); setApproveId(null); },
    onError: () => toast.error("Failed to approve"),
  });

  if (isLoading) return <PageLoader />;

  const timesheets = data?.data ?? [];
  const projects = projectsData?.data ?? [];

  const totalHours = timesheets.reduce((sum: number, t: any) => sum + Number(t.hours), 0);
  const billableHours = timesheets.filter((t: any) => t.billable).reduce((sum: number, t: any) => sum + Number(t.hours), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Timesheets</h1>
          <p className="page-subtitle">{data?.total ?? 0} entries · {totalHours.toFixed(1)}h total · {billableHours.toFixed(1)}h billable</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> Log Time</button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Log Time</h2>
          <form onSubmit={handleSubmit((v) => createMutation.mutate({ ...v, hours: Number(v.hours), taskId: v.taskId || undefined, employeeId: v.employeeId || undefined, billable: Boolean(v.billable) }))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Project</label>
                <select className="input-base" {...register("projectId", { required: true })}>
                  <option value="">Select project</option>
                  {projects.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
                {errors.projectId && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Task ID</label>
                <input className="input-base" {...register("taskId")} placeholder="Optional task ID" />
              </div>
              <div>
                <label className="form-label">Date</label>
                <input className="input-base" type="date" {...register("date", { required: true })} />
                {errors.date && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Hours</label>
                <input className="input-base" type="number" step="0.25" min="0.25" {...register("hours", { required: true })} />
                {errors.hours && <p className="form-error">Required</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Description</label>
                <input className="input-base" {...register("description")} placeholder="What did you work on?" />
              </div>
              <div>
                <label className="form-label">Employee ID</label>
                <input className="input-base" {...register("employeeId")} placeholder="Optional" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="billable" {...register("billable")} className="w-4 h-4 rounded" defaultChecked />
              <label htmlFor="billable" className="text-sm text-slate-600">Billable time</label>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Log Time"}
              </button>
            </div>
          </form>
        </div>
      )}

      {approveId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Approve Timesheet</h2>
            <form onSubmit={approveForm.handleSubmit((v) => approveMutation.mutate({ id: approveId, data: v }))} className="space-y-3">
              <div>
                <label className="form-label">Approved By</label>
                <input className="input-base" {...approveForm.register("approvedBy", { required: true })} placeholder="Your name / ID" />
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

      <div className="flex gap-2 mb-4 flex-wrap">
        <select className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        {["", "DRAFT", "SUBMITTED", "APPROVED"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {s || "All Status"}
          </button>
        ))}
      </div>

      {timesheets.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <FileText size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No timesheet entries found.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Task</th>
                <th>Employee</th>
                <th>Description</th>
                <th>Hours</th>
                <th>Billable</th>
                <th>Approved By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {timesheets.map((t: any) => (
                <tr key={t.id}>
                  <td className="text-sm">{format(new Date(t.date), "MMM d, yyyy")}</td>
                  <td className="text-sm">{t.project?.code ?? "—"}</td>
                  <td className="text-sm">{t.task?.code ?? "—"}</td>
                  <td className="text-sm">{t.employeeId ?? "—"}</td>
                  <td className="text-sm text-slate-500 max-w-xs truncate">{t.description ?? "—"}</td>
                  <td className="font-mono text-sm font-semibold">{Number(t.hours).toFixed(2)}h</td>
                  <td className="text-center">
                    <span className={clsx("text-xs font-medium", t.billable ? "text-green-600" : "text-slate-400")}>
                      {t.billable ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="text-sm">{t.approvedBy ?? "—"}</td>
                  <td><span className={clsx("badge", STATUS_COLORS[t.status] ?? "badge-gray")}>{t.status}</span></td>
                  <td>
                    {t.status !== "APPROVED" && (
                      <button className="btn-primary text-xs flex items-center gap-1" onClick={() => setApproveId(t.id)}>
                        <CheckCircle size={10} /> Approve
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
  );
}

