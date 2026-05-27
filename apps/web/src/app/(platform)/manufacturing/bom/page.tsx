"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { manufacturingApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm, useFieldArray } from "react-hook-form";
import { Loader2, Plus, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { clsx } from "clsx";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "badge-gray",
  ACTIVE: "badge-green",
  OBSOLETE: "badge-red",
};

export default function BOMPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["boms", activeCompany?.id],
    queryFn: () => manufacturingApi.bom.list(),
    enabled: !!activeCompany,
  });

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      itemId: "",
      code: "",
      version: "1.0",
      description: "",
      baseQty: 1,
      uom: "EA",
      lines: [{ itemId: "", description: "", qty: 1, uom: "EA", scrapPct: 0, lineNumber: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const createMutation = useMutation({
    mutationFn: (data: any) => manufacturingApi.bom.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boms"] });
      toast.success("BOM created");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create BOM"),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => manufacturingApi.bom.activate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boms"] });
      toast.success("BOM activated");
    },
    onError: () => toast.error("Failed to activate BOM"),
  });

  const onSubmit = (values: any) => {
    createMutation.mutate({
      ...values,
      baseQty: Number(values.baseQty),
      lines: values.lines.map((l: any, i: number) => ({
        ...l,
        qty: Number(l.qty),
        scrapPct: Number(l.scrapPct),
        lineNumber: i + 1,
      })),
    });
  };

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  const boms = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Bill of Materials</h1>
          <p className="page-subtitle">{data?.total ?? 0} BOMs</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New BOM
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Bill of Materials</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Finished Good Item ID</label>
                <input className="input-base" {...register("itemId", { required: true })} placeholder="Item ID" />
                {errors.itemId && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">BOM Code</label>
                <input className="input-base" {...register("code", { required: true })} placeholder="BOM-001" />
              </div>
              <div>
                <label className="form-label">Version</label>
                <input className="input-base" {...register("version")} placeholder="1.0" />
              </div>
              <div>
                <label className="form-label">Base Qty</label>
                <input className="input-base" type="number" step="0.001" {...register("baseQty")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">UOM</label>
                <input className="input-base" {...register("uom")} placeholder="EA" />
              </div>
              <div>
                <label className="form-label">Description</label>
                <input className="input-base" {...register("description")} />
              </div>
            </div>

            {/* BOM Lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">Components</label>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => append({ itemId: "", description: "", qty: 1, uom: "EA", scrapPct: 0, lineNumber: fields.length + 1 })}
                >
                  + Add Component
                </button>
              </div>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Item ID</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>UOM</th>
                    <th>Scrap %</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, i) => (
                    <tr key={f.id}>
                      <td><input className="input-base" {...register(`lines.${i}.itemId`, { required: true })} placeholder="Item ID" /></td>
                      <td><input className="input-base" {...register(`lines.${i}.description`)} placeholder="Description" /></td>
                      <td><input className="input-base w-20" type="number" step="0.001" {...register(`lines.${i}.qty`)} /></td>
                      <td><input className="input-base w-16" {...register(`lines.${i}.uom`)} /></td>
                      <td><input className="input-base w-16" type="number" step="0.1" {...register(`lines.${i}.scrapPct`)} /></td>
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
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create BOM"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {boms.length === 0 ? (
          <div className="card p-12 text-center text-slate-400">No BOMs yet. Create your first bill of materials.</div>
        ) : (
          boms.map((bom: any) => (
            <div key={bom.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    className="text-slate-400 hover:text-slate-600"
                    onClick={() => setExpandedId(expandedId === bom.id ? null : bom.id)}
                  >
                    {expandedId === bom.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <div>
                    <p className="font-medium text-slate-800">{bom.code} <span className="text-slate-400 text-xs">v{bom.version}</span></p>
                    <p className="text-xs text-slate-500">{bom.item?.code} — {bom.item?.name} | Base qty: {bom.baseQty} {bom.uom}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx("badge", STATUS_COLORS[bom.status] ?? "badge-gray")}>{bom.status}</span>
                  {bom.status === "DRAFT" && (
                    <button
                      className="btn-secondary text-xs flex items-center gap-1"
                      onClick={() => activateMutation.mutate(bom.id)}
                      disabled={activateMutation.isPending}
                    >
                      <CheckCircle size={12} /> Activate
                    </button>
                  )}
                </div>
              </div>

              {expandedId === bom.id && bom.lines?.length > 0 && (
                <div className="mt-4 ml-6">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>UOM</th>
                        <th>Scrap %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bom.lines.map((l: any) => (
                        <tr key={l.id}>
                          <td className="text-slate-400">{l.lineNumber}</td>
                          <td className="font-mono text-xs">{l.item?.code ?? l.itemId}</td>
                          <td>{l.description || l.item?.name}</td>
                          <td>{l.qty}</td>
                          <td>{l.uom}</td>
                          <td>{l.scrapPct}%</td>
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

