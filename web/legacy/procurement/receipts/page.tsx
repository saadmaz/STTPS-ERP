"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { procurementApi, inventoryApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, X, CheckCircle, Truck } from "lucide-react";
import { format } from "date-fns";
import { clsx } from "clsx";

const STATUS_BADGES: Record<string, string> = {
  DRAFT: "badge-yellow",
  POSTED: "badge-green",
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function GoodsReceiptsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);

  const [form, setForm] = useState(() => ({
    poId: "",
    warehouseId: "",
    number: `GRN-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    receiptDate: new Date().toISOString().split("T")[0],
    notes: "",
  }));
  const [lines, setLines] = useState<any[]>([]);

  const { data: grnData, isLoading } = useQuery({
    queryKey: ["grns", activeCompany?.id],
    queryFn: () => procurementApi.receipts.list({ limit: 50 }),
    enabled: !!activeCompany,
  });

  const { data: selectedDetail } = useQuery({
    queryKey: ["grn-detail", selected?.id],
    queryFn: () => procurementApi.receipts.get(selected.id),
    enabled: !!selected,
  });

  const { data: poDetail } = useQuery({
    queryKey: ["po-for-grn", form.poId],
    queryFn: () => procurementApi.orders.get(form.poId),
    enabled: !!form.poId,
    onSuccess: (po: any) => {
      setSelectedPO(po);
      setLines(po.lines.map((l: any, i: number) => ({
        itemId: l.itemId,
        poLineId: l.id,
        qty: Number(l.qty) - Number(l.qtyReceived),
        unitCost: Number(l.unitPrice),
        lineNumber: i + 1,
      })));
    },
  } as any);

  const { data: approvedPOs = [] } = useQuery({
    queryKey: ["pos-approved", activeCompany?.id],
    queryFn: () => procurementApi.orders.list({ status: "APPROVED", limit: 100 }),
    enabled: !!activeCompany && showCreate,
    select: (d: any) => d.data || [],
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", activeCompany?.id],
    queryFn: () => inventoryApi.warehouses.list(),
    enabled: !!activeCompany,
  });

  const { mutate: createGRN, isPending: isCreating } = useMutation({
    mutationFn: () => procurementApi.receipts.create({
      ...form,
      notes: form.notes || undefined,
      lines: lines.map((l, i) => ({ ...l, lineNumber: i + 1 })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grns"] });
      qc.invalidateQueries({ queryKey: ["procurement-dashboard"] });
      toast.success("Goods receipt created");
      setShowCreate(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const { mutate: postGRN, isPending: isPosting } = useMutation({
    mutationFn: (id: string) => procurementApi.receipts.post(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grns"] });
      qc.invalidateQueries({ queryKey: ["grn-detail"] });
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success("GRN posted — stock updated");
      setSelected(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const grns = grnData?.data || [];
  const updateLine = (i: number, field: string, value: any) => setLines(lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Goods Receipts</h1>
          <p className="page-subtitle">{grns.length} receipts</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New GRN
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>GRN Number</th>
                <th>PO Number</th>
                <th>Vendor</th>
                <th>Receipt Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grns.map((grn: any) => (
                <tr key={grn.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(grn)}>
                  <td className="px-4 py-3 font-mono text-sm text-slate-700">{grn.number}</td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-500">{grn.po?.number}</td>
                  <td className="px-4 py-3 text-sm text-slate-800">{grn.po?.vendor?.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{format(new Date(grn.receiptDate), "dd MMM yyyy")}</td>
                  <td className="px-4 py-3"><span className={clsx("badge", STATUS_BADGES[grn.status] || "badge-slate")}>{grn.status}</span></td>
                  <td className="px-4 py-3">
                    {grn.status === "DRAFT" && (
                      <button onClick={(e) => { e.stopPropagation(); postGRN(grn.id); }} disabled={isPosting} className="btn-secondary text-xs px-2 py-1">
                        <CheckCircle size={12} /> Post
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {grns.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-400">No goods receipts found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.number}</h2>
                <p className="text-sm text-slate-500">{selectedDetail?.po?.vendor?.name} · PO: {selectedDetail?.po?.number}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.status === "DRAFT" && (
                  <button onClick={() => postGRN(selected.id)} disabled={isPosting} className="btn-primary">
                    {isPosting ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
                    Post GRN
                  </button>
                )}
                <span className={clsx("badge", STATUS_BADGES[selected.status])}>{selected.status}</span>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto">
              {selectedDetail?.lines?.length > 0 ? (
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty Received</th>
                      <th className="text-right">Unit Cost</th>
                      <th className="text-right">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDetail.lines.map((l: any) => (
                      <tr key={l.id} className="border-b border-slate-100">
                        <td className="px-4 py-2 text-sm">
                          <span className="font-mono text-slate-400 mr-1">{l.item?.code}</span>{l.item?.name}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono">{Number(l.qty).toFixed(4)}</td>
                        <td className="px-4 py-2 text-sm text-right font-mono">{fmt(Number(l.unitCost))}</td>
                        <td className="px-4 py-2 text-sm text-right font-mono font-semibold">{fmt(Number(l.totalCost))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-center py-8 text-slate-400">Loading...</p>}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New Goods Receipt</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">GRN Number *</label>
                  <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="input-base" />
                </div>
                <div>
                  <label className="form-label">Receipt Date *</label>
                  <input type="date" value={form.receiptDate} onChange={(e) => setForm({ ...form, receiptDate: e.target.value })} className="input-base" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Purchase Order *</label>
                  <select value={form.poId} onChange={(e) => setForm({ ...form, poId: e.target.value })} className="input-base">
                    <option value="">Select approved PO...</option>
                    {(approvedPOs as any[]).map((po: any) => (
                      <option key={po.id} value={po.id}>{po.number} — {po.vendor?.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Warehouse *</label>
                  <select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="input-base">
                    <option value="">Select warehouse...</option>
                    {(warehouses as any[]).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>

              {lines.length > 0 && selectedPO && (
                <div>
                  <label className="form-label">Lines (from PO)</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 w-2/5">Item</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-24">Qty</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-28">Unit Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, idx) => {
                          const poLine = selectedPO?.lines?.find((l: any) => l.id === line.poLineId);
                          return (
                            <tr key={idx} className="border-b border-slate-100 last:border-0">
                              <td className="px-3 py-1.5 text-sm text-slate-700">
                                {poLine?.item?.code} — {poLine?.item?.name}
                              </td>
                              <td className="px-2 py-1.5">
                                <input type="number" value={line.qty} onChange={(e) => updateLine(idx, "qty", Number(e.target.value))} min="0" step="0.0001" className="w-full text-sm text-right border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                              </td>
                              <td className="px-2 py-1.5">
                                <input type="number" value={line.unitCost} onChange={(e) => updateLine(idx, "unitCost", Number(e.target.value))} min="0" step="0.01" className="w-full text-sm text-right border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => createGRN()} disabled={isCreating || !form.poId || !form.warehouseId} className="btn-primary flex-1">
                {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
                Create GRN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
