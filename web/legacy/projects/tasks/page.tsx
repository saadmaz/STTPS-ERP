"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, ClipboardList } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  TODO: "badge-gray",
  IN_PROGRESS: "badge-blue",
  DONE: "badge-green",
  CANCELLED: "badge-red",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-slate-400",
  NORMAL: "text-blue-600",
  HIGH: "text-orange-600",
  CRITICAL: "text-red-600",
};

export default function TasksPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  const { data: projectsData } = useQuery({
    queryKey: ["projects-list", activeCompany?.id],
    queryFn: () => projectsApi.projects.list({ limit: 100 }),
    enabled: !!activeCompany,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["project-tasks", activeCompany?.id, projectFilter, statusFilter],
    queryFn: () => projectsApi.tasks.list({ projectId: projectFilter || undefined, status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { projectId: "", code: "", title: "", description: "", priority: "NORMAL", assigneeId: "", estimatedHours: "", plannedStart: "", plannedEnd: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => projectsApi.tasks.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-tasks"] }); toast.success("Task created"); reset(); setShowForm(false); },
    onError: () => toast.error("Failed to create task"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => projectsApi.tasks.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-tasks"] }); toast.success("Task updated"); },
    onError: () => toast.error("Failed to update"),
  });

  if (isLoading) return <PageLoader />;

  const tasks = data?.data ?? [];
  const projects = projectsData?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">{data?.total ?? 0} tasks</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> New Task</button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Task</h2>
          <form onSubmit={handleSubmit((v) => createMutation.mutate({ ...v, estimatedHours: v.estimatedHours ? Number(v.estimatedHours) : undefined, assigneeId: v.assigneeId || undefined, plannedStart: v.plannedStart || undefined, plannedEnd: v.plannedEnd || undefined }))} className="space-y-4">
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
                <label className="form-label">Code</label>
                <input className="input-base" {...register("code", { required: true })} placeholder="T-001" />
                {errors.code && <p className="form-error">Required</p>}
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Title</label>
                <input className="input-base" {...register("title", { required: true })} />
                {errors.title && <p className="form-error">Required</p>}
              </div>
            </div>
            <div>
              <label className="form-label">Description</label>
              <textarea className="input-base" rows={2} {...register("description")} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Priority</label>
                <select className="input-base" {...register("priority")}>
                  {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Assignee ID</label>
                <input className="input-base" {...register("assigneeId")} placeholder="Optional" />
              </div>
              <div>
                <label className="form-label">Est. Hours</label>
                <input className="input-base" type="number" step="0.5" {...register("estimatedHours")} />
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
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Task"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        <select className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        {["", "TODO", "IN_PROGRESS", "DONE"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {s || "All Status"}
          </button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <ClipboardList size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No tasks found.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>Project</th>
                <th>Priority</th>
                <th>Assignee</th>
                <th>Est. Hrs</th>
                <th>Actual Hrs</th>
                <th>Progress</th>
                <th>Planned End</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t: any) => (
                <tr key={t.id}>
                  <td className="font-mono text-sm">{t.code}</td>
                  <td>
                    <p className="font-medium text-sm text-slate-800">{t.title}</p>
                    {t.description && <p className="text-xs text-slate-400 truncate max-w-xs">{t.description}</p>}
                  </td>
                  <td className="text-sm">{t.project?.code ?? "—"}</td>
                  <td><span className={clsx("text-xs font-bold", PRIORITY_COLORS[t.priority])}>{t.priority}</span></td>
                  <td className="text-sm">{t.assigneeId ?? "—"}</td>
                  <td className="text-sm text-center">{t.estimatedHours ?? "—"}</td>
                  <td className="text-sm text-center">{Number(t.actualHours).toFixed(1)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${t.progress}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{t.progress}%</span>
                    </div>
                  </td>
                  <td className="text-xs text-slate-500">{t.plannedEnd ? format(new Date(t.plannedEnd), "MMM d, yyyy") : "—"}</td>
                  <td>
                    <select
                      className={clsx("text-xs border rounded px-1 py-0.5 font-medium",
                        t.status === "DONE" ? "border-green-300 text-green-700 bg-green-50" :
                        t.status === "IN_PROGRESS" ? "border-blue-300 text-blue-700 bg-blue-50" :
                        "border-slate-200 text-slate-600 bg-white")}
                      value={t.status}
                      onChange={(e) => updateMutation.mutate({ id: t.id, data: { status: e.target.value } })}
                    >
                      {["TODO", "IN_PROGRESS", "DONE", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}
                    </select>
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

