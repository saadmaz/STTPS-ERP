"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ehsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm, useFieldArray } from "react-hook-form";
import { Loader2, Plus, ShieldCheck, Trash2, CheckCircle } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format, isPast } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "badge-gray",
  ACTIVE: "badge-green",
  EXPIRED: "badge-red",
};

function riskColor(score: number) {
  if (score >= 15) return "text-red-700 font-bold";
  if (score >= 9) return "text-orange-600 font-semibold";
  if (score >= 5) return "text-yellow-600";
  return "text-green-600";
}

export default function RiskAssessmentsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ehs-risks", activeCompany?.id],
    queryFn: () => ehsApi.risks.list(),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm({
    defaultValues: {
      number: "", title: "", assessedBy: "", reviewDue: "",
      hazards: [{ hazard: "", category: "GENERAL", likelihood: 3, severity: 3, controls: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "hazards" });

  const createMutation = useMutation({
    mutationFn: (data: any) => ehsApi.risks.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ehs-risks"] }); toast.success("Risk assessment created"); reset(); setShowForm(false); },
    onError: () => toast.error("Failed to create"),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => ehsApi.risks.activate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ehs-risks"] }); toast.success("Risk assessment activated"); },
    onError: () => toast.error("Failed to activate"),
  });

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  const risks = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Risk Assessments</h1>
          <p className="page-subtitle">{data?.total ?? 0} assessments</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> New Assessment</button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Risk Assessment</h2>
          <form onSubmit={handleSubmit((v) => createMutation.mutate({ ...v, hazards: v.hazards.map((h: any) => ({ ...h, likelihood: Number(h.likelihood), severity: Number(h.severity) })) }))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Number</label>
                <input className="input-base" {...register("number", { required: true })} placeholder="RA-2024-001" />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Title</label>
                <input className="input-base" {...register("title", { required: true })} />
                {errors.title && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Assessed By</label>
                <input className="input-base" {...register("assessedBy", { required: true })} />
                {errors.assessedBy && <p className="form-error">Required</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Review Due</label>
                <input className="input-base" type="date" {...register("reviewDue", { required: true })} />
                {errors.reviewDue && <p className="form-error">Required</p>}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">Hazards</label>
                <button type="button" className="btn-secondary text-xs" onClick={() => append({ hazard: "", category: "GENERAL", likelihood: 3, severity: 3, controls: "" })}>
                  <Plus size={10} /> Add Hazard
                </button>
              </div>
              <div className="space-y-2">
                {fields.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start bg-slate-50 rounded p-2">
                    <div className="col-span-3">
                      <input className="input-base text-xs" {...register(`hazards.${idx}.hazard`, { required: true })} placeholder="Hazard description" />
                    </div>
                    <div className="col-span-2">
                      <select className="input-base text-xs" {...register(`hazards.${idx}.category`)}>
                        {["GENERAL", "PHYSICAL", "CHEMICAL", "BIOLOGICAL", "ERGONOMIC", "ELECTRICAL"].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="col-span-1">
                      <select className="input-base text-xs" {...register(`hazards.${idx}.likelihood`)}>
                        {[1, 2, 3, 4, 5].map((v) => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div className="col-span-1">
                      <select className="input-base text-xs" {...register(`hazards.${idx}.severity`)}>
                        {[1, 2, 3, 4, 5].map((v) => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <input className="input-base text-xs" {...register(`hazards.${idx}.controls`)} placeholder="Control measures" />
                    </div>
                    <div className="col-span-1 flex justify-end pt-1">
                      {fields.length > 1 && (
                        <button type="button" onClick={() => remove(idx)} className="text-red-500 hover:text-red-700">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-12 gap-2 text-xs text-slate-400 px-2">
                  <div className="col-span-3">Hazard</div>
                  <div className="col-span-2">Category</div>
                  <div className="col-span-1">L (1-5)</div>
                  <div className="col-span-1">S (1-5)</div>
                  <div className="col-span-4">Controls</div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Assessment"}
              </button>
            </div>
          </form>
        </div>
      )}

      {risks.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <ShieldCheck size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No risk assessments yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {risks.map((r: any) => {
            const overdue = r.status === "ACTIVE" && isPast(new Date(r.reviewDue));
            return (
              <div key={r.id} className="card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-slate-500">{r.number}</span>
                      <span className={clsx("badge", STATUS_COLORS[r.status] ?? "badge-gray")}>{r.status}</span>
                    </div>
                    <p className="font-semibold text-slate-800">{r.title}</p>
                    <p className="text-xs text-slate-400">Assessed by {r.assessedBy} · Review due <span className={overdue ? "text-red-600 font-semibold" : ""}>{format(new Date(r.reviewDue), "MMM d, yyyy")}</span></p>
                  </div>
                  {r.status === "DRAFT" && (
                    <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => activateMutation.mutate(r.id)} disabled={activateMutation.isPending}>
                      <CheckCircle size={10} /> Activate
                    </button>
                  )}
                </div>

                {r.hazards?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="table-base text-xs">
                      <thead>
                        <tr>
                          <th>Hazard</th>
                          <th>Category</th>
                          <th>Likelihood</th>
                          <th>Severity</th>
                          <th>Risk Score</th>
                          <th>Controls</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.hazards.map((h: any) => (
                          <tr key={h.id}>
                            <td>{h.hazard}</td>
                            <td>{h.category}</td>
                            <td className="text-center">{h.likelihood}</td>
                            <td className="text-center">{h.severity}</td>
                            <td className="text-center"><span className={riskColor(h.riskScore)}>{h.riskScore}</span></td>
                            <td>{h.controls ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
