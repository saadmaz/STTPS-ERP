"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { procurementApi, inventoryApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, X, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { clsx } from "clsx";

const STATUS_BADGES: Record<string, string> = {
  DRAFT: "badge-yellow",
  APPROVED: "badge-green",
  PARTIAL: "badge-blue",
  RECEIVED: "badge-green",
  CANCELLED: "badge-slate",
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function PurchaseOrdersPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const [form, setForm] = useState({
    number: `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    vendorId: "",
    orderDate: new Date().toISOString().split("T")[0],
    expectedDate: "",
    currency: "USD",
    notes: "",
  });
  const [lines, setLines] = useState([{ itemId: "", qty: 1, uom: "EA", unitPrice: 0, lineNumber: 1 }]);

  const { data: poData, isLoading } = useQuery({
    queryKey: ["pos", activeCompany?.id, statusFilter],
    queryFn: () => procurementApi.orders.list({ status: statusFilter || undefined, limit: 50 }),
    enabled: !!activeCompany,
  });

  const { data: selectedDetail } = useQuery({
    queryKey: ["po-detail", selected?.id],
    queryFn: () => procurementApi.orders.get(selected.id),
    enabled: !!selected,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["proc-vendors", activeCompany?.id],
    queryFn: () => procurementApi.vendors(),
    enabled: !!activeCompany,
    select: (d: any) => d.data || [],
  });

  const { data: items = [] } = useQuery({
    queryKey: ["items-all", activeCompany?.id],
    queryFn: () => inventoryApi.items.list({ limit: 500 }),
    enabled: !!activeCompany,
    select: (d: any) => d.data || [],
  });

  const { mutate: createPO, isPending: isCreating } = useMutation({
    mutationFn: () => procurementApi.orders.create({
      ...form,
      expectedDate: form.expectedDate || undefined,
      lines: lines.map((l, i) => ({ ...l, lineNumber: i + 1 })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos"] });
      qc.invalidateQueries({ queryKey: ["procurement-dashboard"] });
      toast.success("Purchase order created");
      setShowCreate(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const { mutate: approvePO } = useMutation({
    mutationFn: (id: string) => procurementApi.orders.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos"] });
      qc.invalidateQueries({ queryKey: ["po-detail"] });
      qc.invalidateQueries({ queryKey: ["procurement-dashboard"] });
      toast.success("Purchase order approved");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const pos = poData?.data || [];
  const addLine = () => setLines([...lines, { itemId: "", qty: 1, uom: "EA", unitPrice: 0, lineNumber: lines.length + 1 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: any) => setLines(lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Orders</h1>
          <p className="page-subtitle">{pos.length} orders</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New PO
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {["", "DRAFT", "APPROVED", "PARTIAL", "RECEIVED"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={clsx("px-3 py-1.5 rounded-lg text-sm font-medium transition-colors", statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {s || "All"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Number</th>
                <th>Vendor</th>
                <th>Order Date</th>
                <th>Expected</th>
                <th className="text-right">Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po: any) => (
                <tr key={po.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(po)}>
                  <td className="px-4 py-3 font-mono text-sm text-slate-700">{po.number}</td>
                  <td className="px-4 py-3 text-sm text-slate-800">{po.vendor?.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{format(new Date(po.orderDate), "dd MMM yyyy")}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{po.expectedDate ? format(new Date(po.expectedDate), "dd MMM yyyy") : "—"}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-semibold">{fmt(Number(po.total))}</td>
                  <td className="px-4 py-3"><span className={clsx("badge", STATUS_BADGES[po.status] || "badge-slate")}>{po.status}</span></td>
                  <td className="px-4 py-3">
                    {po.status === "DRAFT" && (
                      <button onClick={(e) => { e.stopPropagation(); approvePO(po.id); }} className="btn-secondary text-xs px-2 py-1">
                        <CheckCircle size={12} /> Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {pos.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-slate-400">No purchase orders found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.number}</h2>
                <p className="text-sm text-slate-500">{selectedDetail?.vendor?.name} · {format(new Date(selected.orderDate), "dd MMM yyyy")}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.status === "DRAFT" && (
                  <button onClick={() => approvePO(selected.id)} className="btn-primary">
                    <CheckCircle size={15} /> Approve
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
                      <th>UOM</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Received</th>
                      <th className="text-right">Unit Price</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDetail.lines.map((l: any) => (
                      <tr key={l.id} className="border-b border-slate-100">
                        <td className="px-4 py-2 text-sm">
                          <span className="font-mono text-slate-400 mr-1">{l.item?.code}</span>{l.item?.name}
                        </td>
                        <td className="px-4 py-2 text-sm text-slate-500">{l.uom}</td>
                        <td className="px-4 py-2 text-sm text-right font-mono">{Number(l.qty).toFixed(4)}</td>
                        <td className={clsx("px-4 py-2 text-sm text-right font-mono", Number(l.qtyReceived) >= Number(l.qty) ? "text-green-600" : "text-orange-500")}>
                          {Number(l.qtyReceived).toFixed(4)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono">{fmt(Number(l.unitPrice))}</td>
                        <td className="px-4 py-2 text-sm text-right font-mono font-semibold">{fmt(Number(l.lineTotal))}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-right text-slate-700">Total</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{fmt(Number(selectedDetail?.total))}</td>
                    </tr>
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
              <h2 className="text-lg font-semibold text-slate-900">New Purchase Order</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">PO Number *</label>
                  <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="input-base" />
                </div>
                <div>
                  <label className="form-label">Vendor *</label>
                  <select value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })} className="input-base">
                    <option value="">Select vendor...</option>
                    {(vendors as any[]).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Order Date *</label>
                  <input type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} className="input-base" />
                </div>
                <div>
                  <label className="form-label">Expected Date</label>
                  <input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} className="input-base" />
                </div>
                <div>
                  <label className="form-label">Currency</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="input-base">
                    {["USD", "EUR", "GBP", "SAR", "AED"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="form-label mb-0">Lines</label>
                  <span className="text-sm font-mono text-slate-500">Subtotal: {fmt(subtotal)}</span>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 w-2/5">Item</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-24">Qty</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-28">Unit Price</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr key={idx} className="border-b border-slate-100 last:border-0">
                          <td className="px-2 py-1.5">
                            <select value={line.itemId} onChange={(e) => updateLine(idx, "itemId", e.target.value)} className="w-full text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="">Select item...</option>
                              {(items as any[]).map((i: any) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" value={line.qty} onChange={(e) => updateLine(idx, "qty", Number(e.target.value))} min="0.0001" step="0.0001" className="w-full text-sm text-right border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" value={line.unitPrice} onChange={(e) => updateLine(idx, "unitPrice", Number(e.target.value))} min="0" step="0.01" className="w-full text-sm text-right border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {lines.length > 1 && <button type="button" onClick={() => removeLine(idx)} className="text-slate-300 hover:text-red-500"><X size={14} /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={addLine} className="mt-2 btn-ghost text-blue-600 text-sm">+ Add Line</button>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => createPO()} disabled={isCreating || !form.vendorId || !form.number} className="btn-primary flex-1">
                {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create PO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
