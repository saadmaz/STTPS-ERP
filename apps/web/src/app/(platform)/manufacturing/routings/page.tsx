"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { manufacturingApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm, useFieldArray } from "react-hook-form";
import { Loader2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

export default function RoutingsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["routings", activeCompany?.id],
    queryFn: () => manufacturingApi.routings.list(),
    enabled: !!activeCompany,
  });

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      code: "",
      name: "",
      description: "",
      operations: [{ workCenterId: "", sequence: 10, code: "", description: "", setupTime: 0, runTime: 1, queueTime: 0, uom: "HR" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "operations" });

  const createMutation = useMutation({
    mutationFn: (data: any) => manufacturingApi.routings.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routings"] });
      toast.success("Routing created");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create routing"),
  });

  const onSubmit = (values: any) => {
    createMutation.mutate({
      ...values,
      operations: values.operations.map((op: any) => ({
        ...op,
        sequence: Number(op.sequence),
        setupTime: Number(op.setupTime),
        runTime: Number(op.runTime),
        queueTime: Number(op.queueTime),
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

  const routings = data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Routings</h1>
          <p className="page-subtitle">{routings.length} routings defined</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New Routing
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Routing</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Code</label>
                <input className="input-base" {...register("code", { required: true })} placeholder="RTG-001" />
                {errors.code && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Name</label>
                <input className="input-base" {...register("name", { required: true })} placeholder="Standard Assembly" />
                {errors.name && <p className="form-error">Required</p>}
              </div>
            </div>
            <div>
              <label className="form-label">Description</label>
              <input className="input-base" {...register("description")} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">Operations</label>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => append({ workCenterId: "", sequence: (fields.length + 1) * 10, code: "", description: "", setupTime: 0, runTime: 1, queueTime: 0, uom: "HR" })}
                >
                  + Add Operation
                </button>
              </div>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Seq</th>
                    <th>Work Center ID</th>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Setup (hr)</th>
                    <th>Run (hr)</th>
                    <th>Queue (hr)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, i) => (
                    <tr key={f.id}>
                      <td><input className="input-base w-16" type="number" {...register(`operations.${i}.sequence`)} /></td>
                      <td><input className="input-base" {...register(`operations.${i}.workCenterId`, { required: true })} placeholder="Work Center ID" /></td>
                      <td><input className="input-base w-24" {...register(`operations.${i}.code`)} placeholder="OP-010" /></td>
                      <td><input className="input-base" {...register(`operations.${i}.description`)} placeholder="Description" /></td>
                      <td><input className="input-base w-16" type="number" step="0.25" {...register(`operations.${i}.setupTime`)} /></td>
                      <td><input className="input-base w-16" type="number" step="0.25" {...register(`operations.${i}.runTime`)} /></td>
                      <td><input className="input-base w-16" type="number" step="0.25" {...register(`operations.${i}.queueTime`)} /></td>
                      <td>
                        {fields.length > 1 && (
                          <button type="button" className="text-red-500 hover:text-red-700 text-xs" onClick={() => remove(i)}>Remove</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Routing"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {routings.length === 0 ? (
          <div className="card p-12 text-center text-slate-400">No routings yet. Create your first routing.</div>
        ) : (
          routings.map((r: any) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    className="text-slate-400 hover:text-slate-600"
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  >
                    {expandedId === r.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <div>
                    <p className="font-medium text-slate-800">{r.code}</p>
                    <p className="text-xs text-slate-500">{r.name} — {r.operations?.length ?? 0} operations</p>
                  </div>
                </div>
                <span className={r.isActive ? "badge badge-green" : "badge badge-gray"}>
                  {r.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {expandedId === r.id && r.operations?.length > 0 && (
                <div className="mt-4 ml-6">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Seq</th>
                        <th>Code</th>
                        <th>Description</th>
                        <th>Work Center</th>
                        <th>Setup</th>
                        <th>Run</th>
                        <th>Queue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.operations.sort((a: any, b: any) => a.sequence - b.sequence).map((op: any) => (
                        <tr key={op.id}>
                          <td>{op.sequence}</td>
                          <td className="font-mono text-xs">{op.code}</td>
                          <td>{op.description}</td>
                          <td>{op.workCenter?.name ?? op.workCenterId}</td>
                          <td>{op.setupTime}h</td>
                          <td>{op.runTime}h</td>
                          <td>{op.queueTime}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
