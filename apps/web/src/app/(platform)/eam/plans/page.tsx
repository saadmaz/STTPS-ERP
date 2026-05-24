"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { eamApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm, useFieldArray } from "react-hook-form";
import { Loader2, Plus, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format, isPast } from "date-fns";

export default function MaintenancePlansPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-plans", activeCompany?.id],
    queryFn: () => eamApi.plans.list(),
    enabled: !!activeCompany,
  });

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      assetId: "",
      code: "",
      name: "",
      description: "",
      planType: "PREVENTIVE",
      frequency: "MONTHLY",
      frequencyDays: 30,
      nextDueAt: "",
      estimatedHours: "",
      tasks: [{ sequence: 1, description: "", estimatedMins: 30 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "tasks" });

  const createMutation = useMutation({
    mutationFn: (data: any) => eamApi.plans.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-plans"] });
      toast.success("Maintenance plan created");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create plan"),
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => eamApi.plans.trigger(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-plans"] });
      toast.success("Work order generated from plan");
    },
    onError: () => toast.error("Failed to trigger plan"),
  });

  const onSubmit = (values: any) => {
    createMutation.mutate({
      ...values,
      frequencyDays: Number(values.frequencyDays),
      estimatedHours: values.estimatedHours ? Number(values.estimatedHours) : undefined,
      tasks: values.tasks.map((t: any, i: number) => ({
        sequence: i + 1,
        description: t.description,
        estimatedMins: Number(t.estimatedMins),
      })),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const plans = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Maintenance Plans</h1>
          <p className="page-subtitle">{data?.total ?? 0} plans configured</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New Plan
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Maintenance Plan</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Asset ID</label>
                <input className="input-base" {...register("assetId", { required: true })} placeholder="Asset ID" />
                {errors.assetId && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Plan Code</label>
                <input className="input-base" {...register("code", { required: true })} placeholder="PM-HVAC-001" />
                {errors.code && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Name</label>
                <input className="input-base" {...register("name", { required: true })} placeholder="Monthly Filter Change" />
                {errors.name && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Plan Type</label>
                <select className="input-base" {...register("planType")}>
                  {["PREVENTIVE", "PREDICTIVE", "CONDITION_BASED"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Frequency</label>
                <select className="input-base" {...register("frequency")}>
                  {["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"].map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Frequency (days)</label>
                <input className="input-base" type="number" {...register("frequencyDays")} />
              </div>
              <div>
                <label className="form-label">Next Due</label>
                <input className="input-base" type="date" {...register("nextDueAt", { required: true })} />
                {errors.nextDueAt && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Est. Hours</label>
                <input className="input-base" type="number" step="0.5" {...register("estimatedHours")} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">Task Checklist</label>
                <button type="button" className="btn-secondary text-xs"
                  onClick={() => append({ sequence: fields.length + 1, description: "", estimatedMins: 30 })}>
                  + Add Task
                </button>
              </div>
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.id} className="flex gap-2 items-center">
                    <span className="text-xs text-slate-400 w-5">{i + 1}.</span>
                    <input className="input-base flex-1" {...register(`tasks.${i}.description`)} placeholder="Task description" />
                    <input className="input-base w-24" type="number" {...register(`tasks.${i}.estimatedMins`)} placeholder="Mins" />
                    {fields.length > 1 && (
                      <button type="button" className="text-red-500 text-xs" onClick={() => remove(i)}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Plan"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {plans.length === 0 ? (
          <div className="card p-12 text-center text-slate-400">No maintenance plans yet.</div>
        ) : (
          plans.map((plan: any) => {
            const overdue = isPast(new Date(plan.nextDueAt));
            return (
              <div key={plan.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button className="text-slate-400 hover:text-slate-600" onClick={() => setExpandedId(expandedId === plan.id ? null : plan.id)}>
                      {expandedId === plan.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800">{plan.code} — {plan.name}</p>
                        {overdue && <span className="badge badge-red">OVERDUE</span>}
                      </div>
                      <p className="text-xs text-slate-500">
                        {plan.asset?.name} · {plan.frequency} · {plan.tasks?.length ?? 0} tasks
                        {" · "}Next due: <span className={clsx("font-medium", overdue ? "text-red-600" : "text-slate-700")}>
                          {format(new Date(plan.nextDueAt), "MMM d, yyyy")}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={plan.isActive ? "badge badge-green" : "badge badge-gray"}>
                      {plan.isActive ? "Active" : "Inactive"}
                    </span>
                    <button
                      className="btn-secondary text-xs flex items-center gap-1"
                      onClick={() => triggerMutation.mutate(plan.id)}
                      disabled={triggerMutation.isPending}
                    >
                      <Zap size={12} /> Trigger WO
                    </button>
                  </div>
                </div>

                {expandedId === plan.id && plan.tasks?.length > 0 && (
                  <div className="mt-4 ml-6">
                    <table className="table-base">
                      <thead><tr><th>#</th><th>Task</th><th>Est. Minutes</th></tr></thead>
                      <tbody>
                        {plan.tasks.map((t: any) => (
                          <tr key={t.id}>
                            <td>{t.sequence}</td>
                            <td>{t.description}</td>
                            <td>{t.estimatedMins} min</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
