"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Search, Loader2, X } from "lucide-react";
import { clsx } from "clsx";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

const itemSchema = z.object({
  code: z.string().min(1, "Code required"),
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  uom: z.string().default("EA"),
  itemType: z.string().default("PRODUCT"),
  categoryId: z.string().optional(),
  trackInventory: z.boolean().default(true),
  reorderPoint: z.coerce.number().min(0).default(0),
  reorderQty: z.coerce.number().min(0).default(0),
  standardCost: z.coerce.number().min(0).default(0),
  listPrice: z.coerce.number().min(0).default(0),
});

type ItemForm = z.infer<typeof itemSchema>;

const ITEM_TYPES = ["PRODUCT", "SERVICE", "CONSUMABLE", "RAW_MATERIAL"];
const UOMS = ["EA", "KG", "LT", "M", "M2", "M3", "BOX", "PALLET", "SET"];

export default function ItemsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data: itemData, isLoading } = useQuery({
    queryKey: ["items", activeCompany?.id, page, search],
    queryFn: () => inventoryApi.items.list({ page, limit: 25, search }),
    enabled: !!activeCompany,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["item-categories", activeCompany?.id],
    queryFn: () => inventoryApi.categories.list(),
    enabled: !!activeCompany,
  });

  const { mutate: createItem, isPending: isCreating } = useMutation({
    mutationFn: (data: ItemForm) => inventoryApi.items.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["inventory-summary"] });
      toast.success("Item created");
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed to create item"),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: { uom: "EA", itemType: "PRODUCT", trackInventory: true, reorderPoint: 0, reorderQty: 0, standardCost: 0, listPrice: 0 },
  });

  const items = itemData?.data || [];
  const total = itemData?.total || 0;
  const pages = itemData?.pages || 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Items</h1>
          <p className="page-subtitle">{total} items</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New Item
        </button>
      </div>

      <div className="card mb-4">
        <div className="flex items-center gap-3 p-3">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>UOM</th>
                    <th className="text-right">Std Cost</th>
                    <th className="text-right">List Price</th>
                    <th className="text-right">On Hand</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any) => {
                    const totalQty = (item.stockLevels || []).reduce((s: number, sl: any) => s + Number(sl.qty), 0);
                    return (
                      <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3"><span className="font-mono text-sm text-slate-600">{item.code}</span></td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{item.category?.name || "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{item.itemType}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{item.uom}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono">{fmt(Number(item.standardCost))}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono">{fmt(Number(item.listPrice))}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono font-semibold">
                          <span className={clsx(totalQty <= Number(item.reorderPoint) && Number(item.reorderPoint) > 0 ? "text-red-600" : "text-slate-900")}>
                            {totalQty.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-slate-400">No items found.</td></tr>}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-sm text-slate-500">Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}</p>
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary px-3 py-1 text-xs">Previous</button>
                  <span className="text-sm">{page} / {pages}</span>
                  <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-secondary px-3 py-1 text-xs">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New Item</h2>
              <button onClick={() => { setShowCreate(false); reset(); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => createItem(d))} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Code *</label>
                  <input {...register("code")} className="input-base" placeholder="ITEM-001" />
                  {errors.code && <p className="form-error">{errors.code.message}</p>}
                </div>
                <div>
                  <label className="form-label">Name *</label>
                  <input {...register("name")} className="input-base" placeholder="Item name" />
                  {errors.name && <p className="form-error">{errors.name.message}</p>}
                </div>
              </div>
              <div>
                <label className="form-label">Description</label>
                <input {...register("description")} className="input-base" placeholder="Optional description" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Type</label>
                  <select {...register("itemType")} className="input-base">
                    {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">UOM</label>
                  <select {...register("uom")} className="input-base">
                    {UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Category</label>
                  <select {...register("categoryId")} className="input-base">
                    <option value="">None</option>
                    {(categories as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Standard Cost</label>
                  <input {...register("standardCost")} type="number" step="0.01" min="0" className="input-base" placeholder="0.00" />
                </div>
                <div>
                  <label className="form-label">List Price</label>
                  <input {...register("listPrice")} type="number" step="0.01" min="0" className="input-base" placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Reorder Point</label>
                  <input {...register("reorderPoint")} type="number" step="0.01" min="0" className="input-base" placeholder="0" />
                </div>
                <div>
                  <label className="form-label">Reorder Qty</label>
                  <input {...register("reorderQty")} type="number" step="0.01" min="0" className="input-base" placeholder="0" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); reset(); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={isCreating} className="btn-primary flex-1">
                  {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
