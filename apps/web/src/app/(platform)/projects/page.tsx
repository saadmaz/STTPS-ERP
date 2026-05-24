"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, Globe, BarChart3 } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  PLANNING: "badge-gray",
  ACTIVE: "badge-green",
  ON_HOLD: "badge-yellow",
  COMPLETED: "badge-blue",
  CANCELLED: "badge-red",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-slate-400",
  NORMAL: "text-blue-600",
  HIGH: "text-orange-600",
  CRITICAL: "text-red-600",
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function ProjectsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["projects", activeCompany?.id, statusFilter],
    queryFn: () => projectsApi.projects.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { data: dashboard } = useQuery({
    queryKey: ["projects-dashboard", activeCompany?.id],
    queryFn: () => projectsApi.dashboard(),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { code: "", name: "", description: "", status: "PLANNING", priority: "NORMAL", managerId: "", customerId: "", budget: "", startDate: "", endDate: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => projectsApi.projects.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project created"); reset(); setShowForm(false); },
    onError: () => toast.error("Failed to create project"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => projectsApi.projects.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Status updated"); },
    onError: () => toast.error("Failed to update status"),
  });

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  const projects = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">{data?.total ?? 0} projects · {dashboard?.activeProjects ?? 0} active</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> New Project</button>
      </div>

      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Projects", value: dashboard.totalProjects, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Active Projects", value: dashboard.activeProjects, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Open Tasks", value: dashboard.openTasks, color: "text-orange-600", bg: "bg-orange-50" },
            { label: "Pending Approval", value: dashboard.overdueTimesheets, color: "text-violet-600", bg: "bg-violet-50" },
          ].map((c) => (
            <div key={c.label} className={`card p-4 flex items-center gap-3`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg}`}>
                <BarChart3 size={18} className={c.color} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{c.value}</p>
                <p className="text-xs text-slate-500">{c.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Project</h2>
          <form onSubmit={handleSubmit((v) => createMutation.mutate({ ...v, budget: v.budget ? Number(v.budget) : undefined, customerId: v.customerId || undefined, endDate: v.endDate || undefined }))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Code</label>
                <input className="input-base" {...register("code", { required: true })} placeholder="PRJ-001" />
                {errors.code && <p className="form-error">Required</p>}
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Project Name</label>
                <input className="input-base" {...register("name", { required: true })} />
                {errors.name && <p className="form-error">Required</p>}
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
              <textarea className="input-base" rows={2} {...register("description")} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Manager ID</label>
                <input className="input-base" {...register("managerId", { required: true })} placeholder="User / Employee ID" />
                {errors.managerId && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Customer ID</label>
                <input className="input-base" {...register("customerId")} placeholder="Optional" />
              </div>
              <div>
                <label className="form-label">Start Date</label>
                <input className="input-base" type="date" {...register("startDate", { required: true })} />
                {errors.startDate && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">End Date</label>
                <input className="input-base" type="date" {...register("endDate")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Budget</label>
                <input className="input-base" type="number" step="0.01" {...register("budget")} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Project"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {["", "PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {s || "All"}
          </button>
        ))}
      </div>

      {projects.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <Globe size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No projects found.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Priority</th>
                <th>Manager</th>
                <th>Dates</th>
                <th>Budget</th>
                <th>Actual Cost</th>
                <th>Tasks</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p: any) => (
                <tr key={p.id}>
                  <td className="font-mono text-sm">{p.code}</td>
                  <td>
                    <Link href={`/projects/${p.id}`} className="font-medium text-sm text-blue-600 hover:underline">{p.name}</Link>
                    {p.description && <p className="text-xs text-slate-400 truncate max-w-xs">{p.description}</p>}
                  </td>
                  <td><span className={clsx("text-xs font-bold", PRIORITY_COLORS[p.priority])}>{p.priority}</span></td>
                  <td className="text-sm">{p.managerId}</td>
                  <td className="text-xs text-slate-500">
                    {format(new Date(p.startDate), "MMM d, yyyy")}
                    {p.endDate ? ` → ${format(new Date(p.endDate), "MMM d, yyyy")}` : ""}
                  </td>
                  <td className="font-mono text-sm">{p.budget ? `$${fmt(Number(p.budget))}` : "—"}</td>
                  <td className="font-mono text-sm">${fmt(Number(p.actualCost))}</td>
                  <td className="text-sm text-center">{p._count?.tasks ?? 0}</td>
                  <td><span className={clsx("badge", STATUS_COLORS[p.status] ?? "badge-gray")}>{p.status}</span></td>
                  <td>
                    <select
                      className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white"
                      value={p.status}
                      onChange={(e) => statusMutation.mutate({ id: p.id, status: e.target.value })}
                    >
                      {["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}
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
