"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, X, BarChart3 } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

const schema = z.object({
  name: z.string().min(1),
  stage: z.string().optional(),
  amount: z.coerce.number().min(0).optional(),
  probability: z.coerce.number().min(0).max(100).optional(),
  closeDate: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const STAGE_COLORS: Record<string, string> = {
  PROSPECTING: "bg-slate-100 text-slate-600",
  QUALIFICATION: "bg-blue-100 text-blue-700",
  PROPOSAL: "bg-amber-100 text-amber-700",
  NEGOTIATION: "bg-orange-100 text-orange-700",
  CLOSED_WON: "bg-emerald-100 text-emerald-700",
  CLOSED_LOST: "bg-red-100 text-red-700",
};

export default function OpportunitiesPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [stageFilter, setStageFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["crm-opportunities", activeCompany?.id, stageFilter],
    queryFn: () => crmApi.opportunities.list({ stage: stageFilter || undefined, status: "OPEN" }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { stage: "PROSPECTING", probability: 10 },
  });

  const create = useMutation({
    mutationFn: (d: FormData) => crmApi.opportunities.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-opportunities"] });
      toast.success("Opportunity created");
      setShowForm(false);
      reset();
    },
    onError: () => toast.error("Failed to create opportunity"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Opportunities</h1>
          <p className="page-subtitle">Track your sales pipeline</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> New Opportunity
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select className="input-base max-w-xs" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="">All stages</option>
          {Object.keys(STAGE_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">New Opportunity</h2>
            <button onClick={() => { setShowForm(false); reset(); }} className="btn-ghost"><X size={16} /></button>
          </div>
          <form onSubmit={handleSubmit((d) => create.mutate(d))} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="form-label">Opportunity Name *</label>
              <input className="input-base" {...register("name")} />
              {errors.name && <p className="form-error">Required</p>}
            </div>
            <div>
              <label className="form-label">Stage</label>
              <select className="input-base" {...register("stage")}>
                {Object.keys(STAGE_COLORS).filter(s => !s.startsWith("CLOSED")).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Amount</label>
              <input className="input-base" type="number" step="0.01" {...register("amount")} />
            </div>
            <div>
              <label className="form-label">Probability (%)</label>
              <input className="input-base" type="number" min="0" max="100" {...register("probability")} />
            </div>
            <div>
              <label className="form-label">Expected Close Date</label>
              <input className="input-base" type="date" {...register("closeDate")} />
            </div>
            <div>
              <label className="form-label">Source</label>
              <input className="input-base" {...register("source")} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="form-label">Notes</label>
              <textarea className="input-base" rows={2} {...register("notes")} />
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
            <BarChart3 size={40} className="mb-3" />
            <p className="text-sm">No opportunities found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Account</th>
                  <th>Stage</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Probability</th>
                  <th>Close Date</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((opp: any) => (
                  <tr key={opp.id}>
                    <td className="font-medium text-slate-900">{opp.name}</td>
                    <td className="text-slate-600">{opp.account?.name ?? "—"}</td>
                    <td>
                      <span className={`badge ${STAGE_COLORS[opp.stage] ?? "bg-slate-100 text-slate-600"}`}>
                        {opp.stage}
                      </span>
                    </td>
                    <td className="text-right font-mono text-sm">{fmt(Number(opp.amount))}</td>
                    <td className="text-right text-sm">{opp.probability}%</td>
                    <td className="text-sm text-slate-500">
                      {opp.closeDate ? new Date(opp.closeDate).toLocaleDateString() : "—"}
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
