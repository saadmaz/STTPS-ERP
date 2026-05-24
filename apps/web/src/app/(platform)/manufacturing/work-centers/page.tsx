"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { manufacturingApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, Settings } from "lucide-react";
import { toast } from "sonner";

const WORK_CENTER_TYPES = ["MACHINE", "LABOR", "SUBCONTRACT", "TOOL"];

export default function WorkCentersPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["work-centers", activeCompany?.id],
    queryFn: () => manufacturingApi.workCenters.list(),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      code: "",
      name: "",
      description: "",
      type: "MACHINE",
      capacity: 8,
      efficiency: 100,
      costRate: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => manufacturingApi.workCenters.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-centers"] });
      toast.success("Work center created");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create work center"),
  });

  const onSubmit = (values: any) => {
    createMutation.mutate({
      ...values,
      capacity: Number(values.capacity),
      efficiency: Number(values.efficiency),
      costRate: Number(values.costRate),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const workCenters = data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Work Centers</h1>
          <p className="page-subtitle">{workCenters.length} work centers</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New Work Center
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Work Center</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Code</label>
                <input className="input-base" {...register("code", { required: true })} placeholder="WC-001" />
                {errors.code && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Name</label>
                <input className="input-base" {...register("name", { required: true })} placeholder="Assembly Line 1" />
                {errors.name && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Type</label>
                <select className="input-base" {...register("type")}>
                  {WORK_CENTER_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="form-label">Capacity (hrs/day)</label>
                <input className="input-base" type="number" step="0.5" {...register("capacity")} />
              </div>
              <div>
                <label className="form-label">Efficiency (%)</label>
                <input className="input-base" type="number" {...register("efficiency")} />
              </div>
              <div>
                <label className="form-label">Cost Rate ($/hr)</label>
                <input className="input-base" type="number" step="0.01" {...register("costRate")} />
              </div>
            </div>
            <div>
              <label className="form-label">Description</label>
              <input className="input-base" {...register("description")} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      {workCenters.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">No work centers yet. Add your first work center.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Capacity (hrs/day)</th>
                <th>Efficiency</th>
                <th>Cost Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {workCenters.map((wc: any) => (
                <tr key={wc.id}>
                  <td className="font-mono font-medium">{wc.code}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Settings size={14} className="text-slate-400" />
                      {wc.name}
                    </div>
                  </td>
                  <td>{wc.type}</td>
                  <td>{wc.capacity}</td>
                  <td>{wc.efficiency}%</td>
                  <td className="font-mono">${Number(wc.costRate).toFixed(2)}/hr</td>
                  <td>
                    <span className={wc.isActive ? "badge badge-green" : "badge badge-gray"}>
                      {wc.isActive ? "Active" : "Inactive"}
                    </span>
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
