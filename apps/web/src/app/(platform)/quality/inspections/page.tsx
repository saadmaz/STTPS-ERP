"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { qualityApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, ClipboardList, CheckCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "badge-blue",
  IN_PROGRESS: "badge-yellow",
  COMPLETED: "badge-green",
  CANCELLED: "badge-red",
};

const RESULT_COLORS: Record<string, string> = {
  PASS: "badge-green",
  FAIL: "badge-red",
  CONDITIONAL: "badge-yellow",
};

export default function InspectionsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["inspections", activeCompany?.id, statusFilter],
    queryFn: () => qualityApi.inspections.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { data: templates } = useQuery({
    queryKey: ["inspection-templates", activeCompany?.id],
    queryFn: () => qualityApi.templates.list(),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { templateId: "", number: "", title: "", scheduledAt: "" },
  });

  const tmplForm = useForm({
    defaultValues: { code: "", name: "", category: "GENERAL", description: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => qualityApi.inspections.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inspections"] }); toast.success("Inspection created"); reset(); setShowForm(false); },
    onError: () => toast.error("Failed to create inspection"),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => qualityApi.templates.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inspection-templates"] }); toast.success("Template created"); tmplForm.reset(); setShowTemplateForm(false); },
    onError: () => toast.error("Failed to create template"),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => qualityApi.inspections.complete(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inspections"] }); toast.success("Inspection completed"); },
    onError: () => toast.error("Failed to complete"),
  });

  if (isLoading) return <PageLoader />;

  const inspections = data?.data ?? [];
  const templateList = templates ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inspections</h1>
          <p className="page-subtitle">{data?.total ?? 0} inspections</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowTemplateForm(!showTemplateForm)}>Templates ({templateList.length})</button>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> New Inspection</button>
        </div>
      </div>

      {showTemplateForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Inspection Template</h2>
          <form onSubmit={tmplForm.handleSubmit((v) => createTemplateMutation.mutate(v))} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Code</label>
                <input className="input-base" {...tmplForm.register("code", { required: true })} placeholder="INSP-MECH" />
              </div>
              <div>
                <label className="form-label">Name</label>
                <input className="input-base" {...tmplForm.register("name", { required: true })} placeholder="Mechanical Inspection" />
              </div>
              <div>
                <label className="form-label">Category</label>
                <select className="input-base" {...tmplForm.register("category")}>
                  {["GENERAL", "MECHANICAL", "ELECTRICAL", "SAFETY", "QUALITY", "ENVIRONMENTAL"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Description</label>
                <input className="input-base" {...tmplForm.register("description")} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { tmplForm.reset(); setShowTemplateForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createTemplateMutation.isPending}>
                {createTemplateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Template"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Inspection</h2>
          <form onSubmit={handleSubmit((v) => createMutation.mutate({ ...v, scheduledAt: v.scheduledAt || undefined }))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Number</label>
                <input className="input-base" {...register("number", { required: true })} placeholder="INSP-2024-001" />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Title</label>
                <input className="input-base" {...register("title", { required: true })} placeholder="Monthly Mechanical Inspection" />
                {errors.title && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Scheduled At</label>
                <input className="input-base" type="datetime-local" {...register("scheduledAt")} />
              </div>
            </div>
            <div>
              <label className="form-label">Template</label>
              <select className="input-base" {...register("templateId", { required: true })}>
                <option value="">Select template</option>
                {templateList.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
              </select>
              {errors.templateId && <p className="form-error">Required</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Inspection"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {["", "SCHEDULED", "IN_PROGRESS", "COMPLETED"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {s || "All"}
          </button>
        ))}
      </div>

      {inspections.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <ClipboardList size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No inspections found.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Template</th>
                <th>Scheduled</th>
                <th>Conducted</th>
                <th>Result</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((i: any) => (
                <tr key={i.id}>
                  <td className="font-mono text-sm">{i.number}</td>
                  <td className="font-medium text-sm text-slate-800">{i.title}</td>
                  <td className="text-sm text-slate-500">{i.template?.name ?? "—"}</td>
                  <td className="text-xs text-slate-500">{i.scheduledAt ? format(new Date(i.scheduledAt), "MMM d, HH:mm") : "—"}</td>
                  <td className="text-xs text-slate-500">{i.conductedAt ? format(new Date(i.conductedAt), "MMM d, yyyy") : "—"}</td>
                  <td>
                    {i.overallResult ? (
                      <span className={clsx("badge", RESULT_COLORS[i.overallResult] ?? "badge-gray")}>{i.overallResult}</span>
                    ) : "—"}
                  </td>
                  <td><span className={clsx("badge", STATUS_COLORS[i.status] ?? "badge-gray")}>{i.status}</span></td>
                  <td>
                    {i.status !== "COMPLETED" && (
                      <button
                        className="btn-primary text-xs flex items-center gap-1"
                        onClick={() => completeMutation.mutate({ id: i.id, data: { conductedBy: "Current User", overallResult: "PASS" } })}
                        disabled={completeMutation.isPending}
                      >
                        <CheckCircle size={10} /> Complete
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

