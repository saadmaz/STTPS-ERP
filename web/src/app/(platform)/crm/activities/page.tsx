"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, X, Activity, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  type: z.string().min(1),
  subject: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
  dueDate: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function ActivitiesPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["crm-activities", activeCompany?.id, statusFilter],
    queryFn: () => crmApi.activities.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: "CALL", status: "PLANNED" },
  });

  const create = useMutation({
    mutationFn: (d: FormData) => crmApi.activities.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-activities"] });
      toast.success("Activity created");
      setShowForm(false);
      reset();
    },
    onError: () => toast.error("Failed to create activity"),
  });

  const complete = useMutation({
    mutationFn: (id: string) => crmApi.activities.complete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-activities"] });
      toast.success("Activity completed");
    },
    onError: () => toast.error("Failed to complete activity"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Activities</h1>
          <p className="page-subtitle">Calls, emails, meetings and tasks</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> New Activity
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select className="input-base max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">New Activity</h2>
            <button onClick={() => { setShowForm(false); reset(); }} className="btn-ghost"><X size={16} /></button>
          </div>
          <form onSubmit={handleSubmit((d) => create.mutate(d))} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="form-label">Type *</label>
              <select className="input-base" {...register("type")}>
                {["CALL", "EMAIL", "MEETING", "TASK", "NOTE"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="form-label">Subject *</label>
              <input className="input-base" {...register("subject")} />
              {errors.subject && <p className="form-error">Required</p>}
            </div>
            <div>
              <label className="form-label">Status</label>
              <select className="input-base" {...register("status")}>
                {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Due Date</label>
              <input className="input-base" type="date" {...register("dueDate")} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="form-label">Description</label>
              <textarea className="input-base" rows={2} {...register("description")} />
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex gap-3">
              <button type="submit" className="btn-primary" disabled={create.isPending}>
                {create.isPending && <Loader2 size={14} className="animate-spin" />} Save
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); reset(); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </div>
        ) : (data?.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Activity size={40} className="mb-3" />
            <p className="text-sm">No activities found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((a: any) => (
                  <tr key={a.id}>
                    <td><span className="badge bg-slate-100 text-slate-700">{a.type}</span></td>
                    <td className="font-medium text-slate-900">{a.subject}</td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[a.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="text-sm text-slate-500">
                      {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="text-right">
                      {a.status !== "COMPLETED" && (
                        <button
                          className="btn-ghost text-xs text-emerald-600 hover:text-emerald-700"
                          onClick={() => complete.mutate(a.id)}
                          disabled={complete.isPending}
                        >
                          <CheckCircle2 size={14} /> Complete
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
    </div>
  );
}
