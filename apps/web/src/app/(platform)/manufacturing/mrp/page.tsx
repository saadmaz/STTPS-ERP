"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { manufacturingApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const PLAN_STATUS_COLORS: Record<string, string> = {
  DRAFT: "badge-gray",
  PROCESSING: "badge-yellow",
  COMPLETED: "badge-green",
  ERROR: "badge-red",
};

const ORDER_TYPE_COLORS: Record<string, string> = {
  PRODUCTION: "badge-blue",
  PURCHASE: "badge-violet",
};

export default function MRPPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["mrp-plans", activeCompany?.id],
    queryFn: () => manufacturingApi.mrp.list(),
    enabled: !!activeCompany,
  });

  const { data: expandedPlan, isLoading: planLoading } = useQuery({
    queryKey: ["mrp-plan", expandedId],
    queryFn: () => manufacturingApi.mrp.get(expandedId!),
    enabled: !!expandedId,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      reference: "",
      planType: "STANDARD",
      notes: "",
    },
  });

  const runMutation = useMutation({
    mutationFn: (data: any) => manufacturingApi.mrp.run(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mrp-plans"] });
      toast.success("MRP plan generated");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to run MRP"),
  });

  const onSubmit = (values: any) => {
    runMutation.mutate(values);
  };

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  const planList = plans ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">MRP — Material Requirements Planning</h1>
          <p className="page-subtitle">Generate planned orders based on open sales demand</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Run MRP
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New MRP Run</h2>
          <p className="text-xs text-slate-500 mb-4">
            MRP reads all open Sales Orders, aggregates demand, checks on-hand stock levels, and creates Planned Orders (Production or Purchase) for any shortfalls.
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Reference</label>
                <input className="input-base" {...register("reference", { required: true })} placeholder="MRP-2024-01" />
                {errors.reference && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Plan Type</label>
                <select className="input-base" {...register("planType")}>
                  <option value="STANDARD">Standard</option>
                  <option value="WHAT_IF">What-If</option>
                  <option value="SIMULATION">Simulation</option>
                </select>
              </div>
            </div>
            <div>
              <label className="form-label">Notes</label>
              <input className="input-base" {...register("notes")} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={runMutation.isPending}>
                {runMutation.isPending ? (
                  <><Loader2 size={14} className="animate-spin" /> Running MRP...</>
                ) : (
                  "Run MRP"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {planList.length === 0 ? (
          <div className="card p-12 text-center text-slate-400">
            <BarChart3 size={32} className="mx-auto mb-3 text-slate-300" />
            <p>No MRP plans yet. Run your first MRP to generate planned orders.</p>
          </div>
        ) : (
          planList.map((plan: any) => (
            <div key={plan.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button className="text-slate-400 hover:text-slate-600" onClick={() => setExpandedId(expandedId === plan.id ? null : plan.id)}>
                    {expandedId === plan.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <div>
                    <p className="font-medium text-slate-800">{plan.reference}</p>
                    <p className="text-xs text-slate-500">
                      {plan.planType} | Run: {format(new Date(plan.runDate), "MMM d, yyyy HH:mm")}
                      {plan.notes && ` — ${plan.notes}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx("badge", PLAN_STATUS_COLORS[plan.status] ?? "badge-gray")}>{plan.status}</span>
                  <span className="text-xs text-slate-400">{plan._count?.plannedOrders ?? plan.plannedOrders?.length ?? 0} planned orders</span>
                </div>
              </div>

              {expandedId === plan.id && (
                <div className="mt-4 ml-6">
                  {planLoading ? (
                    <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                      <Loader2 size={14} className="animate-spin" /> Loading planned orders...
                    </div>
                  ) : expandedPlan?.plannedOrders?.length > 0 ? (
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Type</th>
                          <th>Required Qty</th>
                          <th>Planned Start</th>
                          <th>Planned End</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expandedPlan.plannedOrders.map((po: any) => (
                          <tr key={po.id}>
                            <td>
                              <div>
                                <p className="text-xs font-medium">{po.item?.name ?? po.itemId}</p>
                                <p className="text-xs text-slate-400 font-mono">{po.item?.code}</p>
                              </div>
                            </td>
                            <td>
                              <span className={clsx("badge", ORDER_TYPE_COLORS[po.orderType] ?? "badge-gray")}>{po.orderType}</span>
                            </td>
                            <td className="font-medium">{po.requiredQty}</td>
                            <td>{po.plannedStart ? format(new Date(po.plannedStart), "MMM d, yyyy") : "—"}</td>
                            <td>{po.plannedEnd ? format(new Date(po.plannedEnd), "MMM d, yyyy") : "—"}</td>
                            <td><span className="badge badge-gray">{po.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-slate-400 py-2">No planned orders in this plan.</p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

