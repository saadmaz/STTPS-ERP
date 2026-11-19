"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { salesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, X, DollarSign, Trash2 } from "lucide-react";
import { toast } from "sonner";

const lineSchema = z.object({
  itemId: z.string().uuid("Invalid item ID"),
  unitPrice: z.coerce.number().min(0),
  minQty: z.coerce.number().min(0).optional(),
  uom: z.string().optional(),
});

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  currency: z.string().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  items: z.array(lineSchema).min(1, "At least one item required"),
});
type FormData = z.infer<typeof schema>;

export default function PriceListsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-price-lists", activeCompany?.id],
    queryFn: () => salesApi.priceLists.list(),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currency: "USD", items: [{ itemId: "", unitPrice: 0, minQty: 0, uom: "EA" }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const create = useMutation({
    mutationFn: (d: FormData) => salesApi.priceLists.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-price-lists"] });
      toast.success("Price list created");
      setShowForm(false);
      reset();
    },
    onError: () => toast.error("Failed to create price list"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Price Lists</h1>
          <p className="page-subtitle">Manage item pricing</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> New Price List
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">New Price List</h2>
            <button onClick={() => { setShowForm(false); reset(); }} className="btn-ghost"><X size={16} /></button>
          </div>
          <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Code *</label>
                <input className="input-base" {...register("code")} />
                {errors.code && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Name *</label>
                <input className="input-base" {...register("name")} />
                {errors.name && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Currency</label>
                <input className="input-base" {...register("currency")} />
              </div>
              <div>
                <label className="form-label">Valid From</label>
                <input className="input-base" type="date" {...register("validFrom")} />
              </div>
              <div>
                <label className="form-label">Valid To</label>
                <input className="input-base" type="date" {...register("validTo")} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label">Items</label>
                <button type="button" className="btn-ghost text-xs" onClick={() => append({ itemId: "", unitPrice: 0, minQty: 0, uom: "EA" })}>
                  <Plus size={12} /> Add Item
                </button>
              </div>
              {errors.items && <p className="form-error mb-2">{String(errors.items.message ?? "")}</p>}
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-4 gap-2 items-center">
                    <input className="input-base" placeholder="Item ID (UUID)" {...register(`items.${i}.itemId`)} />
                    <input className="input-base" type="number" step="0.01" placeholder="Unit Price" {...register(`items.${i}.unitPrice`)} />
                    <input className="input-base" type="number" step="0.01" placeholder="Min Qty" {...register(`items.${i}.minQty`)} />
                    <button type="button" onClick={() => remove(i)} className="btn-ghost text-red-500 hover:text-red-600 justify-self-start">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
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
        ) : (data ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <DollarSign size={40} className="mb-3" />
            <p className="text-sm">No price lists found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Currency</th>
                  <th className="text-right">Items</th>
                  <th>Valid From</th>
                  <th>Valid To</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((pl: any) => (
                  <tr key={pl.id}>
                    <td className="font-mono text-sm font-medium">{pl.code}</td>
                    <td className="font-medium text-slate-900">{pl.name}</td>
                    <td>{pl.currency}</td>
                    <td className="text-right">{pl._count?.items ?? 0}</td>
                    <td className="text-sm text-slate-500">{pl.validFrom ? new Date(pl.validFrom).toLocaleDateString() : "—"}</td>
                    <td className="text-sm text-slate-500">{pl.validTo ? new Date(pl.validTo).toLocaleDateString() : "—"}</td>
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
