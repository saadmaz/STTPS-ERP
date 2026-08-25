"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, X, ClipboardList, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { clsx } from "clsx";

const fmt = (n: number) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 4 });

const STATUS_BADGES: Record<string, string> = {
  DRAFT: "badge-yellow",
  POSTED: "badge-green",
};

export default function StockCountPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Simple create form state
  const [newCount, setNewCount] = useState({ warehouseId: "", reference: "", countDate: new Date().toISOString().split("T")[0], notes: "" });

  const { data: counts = [], isLoading } = useQuery({
    queryKey: ["stock-counts", activeCompany?.id],
    queryFn: () => inventoryApi.counts.list(),
    enabled: !!activeCompany,
  });

  const { data: selectedDetail } = useQuery({
    queryKey: ["stock-count-detail", selected?.id],
    queryFn: () => inventoryApi.counts.get(selected.id),
    enabled: !!selected,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", activeCompany?.id],
    queryFn: () => inventoryApi.warehouses.list(),
    enabled: !!activeCompany,
  });

  const { data: stockLevels = [] } = useQuery({
    queryKey: ["stock-levels-create", newCount.warehouseId],
    queryFn: () => inventoryApi.stockLevels({ warehouseId: newCount.warehouseId }),
    enabled: !!newCount.warehouseId,
  });

  const [countedQtys, setCountedQtys] = useState<Record<string, number>>({});

  const { mutate: createCount, isPending: isCreating } = useMutation({
    mutationFn: () => inventoryApi.counts.create({
      warehouseId: newCount.warehouseId,
      reference: newCount.reference,
      countDate: newCount.countDate,
      notes: newCount.notes || undefined,
      lines: (stockLevels as any[]).map((sl: any) => ({
        itemId: sl.itemId,
        countedQty: countedQtys[sl.itemId] ?? Number(sl.qty),
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-counts"] });
      toast.success("Stock count created");
      setShowCreate(false);
      setNewCount({ warehouseId: "", reference: "", countDate: new Date().toISOString().split("T")[0], notes: "" });
      setCountedQtys({});
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const { mutate: postCount, isPending: isPosting } = useMutation({
    mutationFn: (id: string) => inventoryApi.counts.post(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-counts"] });
      qc.invalidateQueries({ queryKey: ["stock-count-detail"] });
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      toast.success("Stock count posted — stock adjusted");
      setSelected(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Count</h1>
          <p className="page-subtitle">{(counts as any[]).length} counts</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New Count
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(counts as any[]).map((c: any) => (
            <div key={c.id} className="card p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelected(c)}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ClipboardList size={16} className="text-slate-400" />
                  <span className="font-semibold text-slate-900">{c.reference}</span>
                </div>
                <span className={clsx("badge text-xs", STATUS_BADGES[c.status] || "badge-slate")}>{c.status}</span>
              </div>
              <p className="text-sm text-slate-500">{c.warehouse?.name}</p>
              <p className="text-xs text-slate-400 mt-1">{format(new Date(c.countDate), "dd MMM yyyy")}</p>
              <p className="text-xs text-slate-400 mt-0.5">{c._count?.lines || 0} lines</p>
            </div>
          ))}
          {(counts as any[]).length === 0 && (
            <div className="col-span-3 text-center py-16 text-slate-400">No stock counts yet.</div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.reference}</h2>
                <p className="text-sm text-slate-500">{selected.warehouse?.name} · {format(new Date(selected.countDate), "dd MMM yyyy")}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.status === "DRAFT" && (
                  <button onClick={() => postCount(selected.id)} disabled={isPosting} className="btn-primary">
                    {isPosting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                    Post & Adjust Stock
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto">
              {selectedDetail?.lines?.length > 0 ? (
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">System Qty</th>
                      <th className="text-right">Counted Qty</th>
                      <th className="text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDetail.lines.map((l: any) => (
                      <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 text-sm">
                          <span className="font-mono text-slate-400 mr-1">{l.item?.code}</span>{l.item?.name}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-slate-500">{fmt(Number(l.systemQty))}</td>
                        <td className="px-4 py-2 text-sm text-right font-mono">{fmt(Number(l.countedQty))}</td>
                        <td className={clsx("px-4 py-2 text-sm text-right font-mono font-semibold", Number(l.variance) > 0 ? "text-green-600" : Number(l.variance) < 0 ? "text-red-600" : "text-slate-400")}>
                          {Number(l.variance) > 0 ? "+" : ""}{fmt(Number(l.variance))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-center py-8 text-slate-400">Loading...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New Stock Count</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Reference *</label>
                  <input value={newCount.reference} onChange={(e) => setNewCount({ ...newCount, reference: e.target.value })} className="input-base" placeholder="SC-2025-001" />
                </div>
                <div>
                  <label className="form-label">Count Date *</label>
                  <input type="date" value={newCount.countDate} onChange={(e) => setNewCount({ ...newCount, countDate: e.target.value })} className="input-base" />
                </div>
              </div>
              <div>
                <label className="form-label">Warehouse *</label>
                <select value={newCount.warehouseId} onChange={(e) => { setNewCount({ ...newCount, warehouseId: e.target.value }); setCountedQtys({}); }} className="input-base">
                  <option value="">Select warehouse...</option>
                  {(warehouses as any[]).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              {newCount.warehouseId && (stockLevels as any[]).length > 0 && (
                <div>
                  <label className="form-label">Counted Quantities</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Item</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">System Qty</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-32">Counted Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(stockLevels as any[]).map((sl: any) => (
                          <tr key={sl.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-1.5">
                              <span className="font-mono text-slate-400 mr-1">{sl.item?.code}</span>{sl.item?.name}
                            </td>
                            <td className="px-3 py-1.5 text-right text-slate-400 font-mono">{fmt(Number(sl.qty))}</td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={countedQtys[sl.itemId] ?? Number(sl.qty)}
                                onChange={(e) => setCountedQtys({ ...countedQtys, [sl.itemId]: Number(e.target.value) })}
                                className="w-full text-right border border-slate-200 rounded px-2 py-0.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => createCount()}
                disabled={isCreating || !newCount.warehouseId || !newCount.reference}
                className="btn-primary flex-1"
              >
                {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create Count
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
