"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Award, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { EmptyState, ErrorState, Field, PageHeader, Spinner } from "@/components/ui/kit";
import { productsApi } from "@/modules/products/config";
import { inventoryApi, useProductNames } from "@/modules/inventory/config";
import { orgApi } from "@/modules/org/config";
import { GoodsReceipt, PROCUREMENT_SCREENS, procurementApi, PurchaseOrder, Requisition, Rfq, useSupplierName } from "./config";

export function ProcurementList({ entity }: { entity: string }) {
  const config = PROCUREMENT_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function ProcurementRecord({ entity, id }: { entity: string; id: string }) {
  const config = PROCUREMENT_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}

const toQtyText = (n: number) => String(n / 1000);
const toMoneyText = (n: number) => (n / 100).toFixed(2);

function usePurchasable() {
  const products = useQuery({ queryKey: ["options", "products.items"], queryFn: () => productsApi.items.list({ limit: 200 }) });
  return (products.data?.items ?? []).filter((p) => p.isPurchasable && p.status === "active");
}

function useActiveSuppliers() {
  const q = useQuery({ queryKey: ["options", "procurement.suppliers"], queryFn: () => procurementApi.suppliers.list({ limit: 200, sort: "nameLower" }) });
  return (q.data?.items ?? []).filter((s) => s.status === "active");
}

function useWarehouses() {
  const q = useQuery({ queryKey: ["options", "inventory.warehouses.raw"], queryFn: () => inventoryApi.warehouses.list({ limit: 200 }) });
  return (q.data?.items ?? []).filter((w) => w.isActive);
}

// ─── New requisition ──────────────────────────────────────────────────────────

interface ReqLineForm { productId: string; description: string; qty: string; estimatedPrice: string }
const blankReqLine = (): ReqLineForm => ({ productId: "", description: "", qty: "1", estimatedPrice: "" });

function ReqLinesEditor({ lines, onChange }: { lines: ReqLineForm[]; onChange: (l: ReqLineForm[]) => void }) {
  const products = usePurchasable();
  const set = (i: number, patch: Partial<ReqLineForm>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <section className="card p-5 space-y-2">
      <h2 className="font-semibold">Items</h2>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-12 gap-2">
          <select className="input-base col-span-12 sm:col-span-4" value={l.productId} onChange={(e) => set(i, { productId: e.target.value })} aria-label="Product">
            <option value="">Not a catalogue item</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
          <input className="input-base col-span-12 sm:col-span-4" placeholder={l.productId ? "Description (optional)" : "Description"} value={l.description} onChange={(e) => set(i, { description: e.target.value })} aria-label="Description" />
          <input className="input-base col-span-5 sm:col-span-1" placeholder="Qty" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label="Quantity" />
          <input className="input-base col-span-5 sm:col-span-2" placeholder="Est. price" value={l.estimatedPrice} onChange={(e) => set(i, { estimatedPrice: e.target.value })} aria-label="Estimated price" />
          <button type="button" className="btn-ghost col-span-2 sm:col-span-1" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 size={15} /></button>
        </div>
      ))}
      <button type="button" className="btn-ghost text-blue-600" onClick={() => onChange([...lines, blankReqLine()])}><Plus size={14} /> Item</button>
    </section>
  );
}

const reqLineBody = (lines: ReqLineForm[]) =>
  lines.filter((l) => (l.productId || l.description) && l.qty).map((l) => ({
    productId: l.productId || undefined, description: l.description || undefined, qty: l.qty, estimatedPrice: l.estimatedPrice || undefined,
  }));

function NewRequisition() {
  const router = useRouter();
  const [justification, setJustification] = useState("");
  const [requiredDate, setRequiredDate] = useState("");
  const [lines, setLines] = useState<ReqLineForm[]>([blankReqLine()]);
  const save = useMutation({
    mutationFn: () => procurementApi.requisitions.create({ justification: justification || undefined, requiredDate: requiredDate || undefined, lines: reqLineBody(lines) }),
    onSuccess: (r) => { toast.success(`${r.number} created`); router.push(`/procurement/requisitions/${r.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form className="max-w-5xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title="New purchase requisition" subtitle="Ask for goods or services; it is routed for approval when you submit it." />
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2"><Field label="Purpose"><input className="input-base" value={justification} onChange={(e) => setJustification(e.target.value)} /></Field></div>
        <Field label="Needed by"><input type="date" className="input-base" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} /></Field>
      </section>
      <ReqLinesEditor lines={lines} onChange={setLines} />
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href="/procurement/requisitions">Cancel</Link>
        <button className="btn-primary" disabled={save.isPending || reqLineBody(lines).length === 0}>Create requisition</button>
      </div>
    </form>
  );
}

// ─── New RFQ ──────────────────────────────────────────────────────────────────

function NewRfq() {
  const router = useRouter();
  const params = useSearchParams();
  const requisitionId = params.get("requisition") ?? "";
  const suppliers = useActiveSuppliers();
  const req = useQuery({ queryKey: ["procurement.requisition", "one", requisitionId], queryFn: () => procurementApi.requisitions.get(requisitionId), enabled: !!requisitionId });
  const [invited, setInvited] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<ReqLineForm[]>([blankReqLine()]);
  const save = useMutation({
    mutationFn: () => procurementApi.rfqs.create({ requisitionId: requisitionId || undefined, supplierIds: invited, dueDate: dueDate || undefined, ...(requisitionId ? {} : { lines: reqLineBody(lines) }) }),
    onSuccess: (r) => { toast.success(`${r.number} created`); router.push(`/procurement/rfqs/${r.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = (id: string) => setInvited(invited.includes(id) ? invited.filter((x) => x !== id) : [...invited, id]);
  return (
    <form className="max-w-5xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title="New request for quotation" subtitle={req.data ? `For ${req.data.number}` : "Invite suppliers to quote."} />
      <section className="card p-5 space-y-4">
        <Field label="Quotes due"><input type="date" className="input-base max-w-xs" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        <div>
          <p className="text-sm font-medium mb-2">Invite suppliers</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {suppliers.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={invited.includes(s.id)} onChange={() => toggle(s.id)} /> {s.name} <span className="text-slate-500">{s.code}</span>
              </label>
            ))}
          </div>
        </div>
      </section>
      {requisitionId ? (
        <section className="card p-5 text-sm">
          <h2 className="font-semibold mb-2">Items from the requisition</h2>
          <ul className="list-disc pl-5">{(req.data?.lines ?? []).map((l) => <li key={l.lineId}>{l.description} × {toQtyText(l.qty)}</li>)}</ul>
        </section>
      ) : (
        <ReqLinesEditor lines={lines} onChange={setLines} />
      )}
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href="/procurement/rfqs">Cancel</Link>
        <button className="btn-primary" disabled={save.isPending || invited.length === 0}>Send RFQ</button>
      </div>
    </form>
  );
}

// ─── New / amended purchase order ─────────────────────────────────────────────

interface PoLineForm { productId: string; qty: string; unitPrice: string; taxCode: string }
const blankPoLine = (): PoLineForm => ({ productId: "", qty: "1", unitPrice: "", taxCode: "" });

interface OrderSeed { supplierId: string; warehouseId: string; expectedDate: string; notes: string; lines: PoLineForm[] }

function NewOrder() {
  const params = useSearchParams();
  const requisitionId = params.get("requisition") ?? "";
  const amendId = params.get("amend") ?? "";
  const req = useQuery({ queryKey: ["procurement.requisition", "one", requisitionId], queryFn: () => procurementApi.requisitions.get(requisitionId), enabled: !!requisitionId });
  const amend = useQuery({ queryKey: ["procurement.order", "one", amendId], queryFn: () => procurementApi.orders.get(amendId), enabled: !!amendId });
  const pending = (requisitionId && req.isLoading) || (amendId && amend.isLoading);
  if (pending) return <Spinner />;
  if (req.isError || amend.isError) return <ErrorState message={errorMessage(req.error ?? amend.error)} />;
  const r: Requisition | undefined = req.data;
  const o: PurchaseOrder | undefined = amend.data;
  const seed: OrderSeed = o
    ? { supplierId: o.supplierId, warehouseId: o.warehouseId, expectedDate: o.expectedDate ?? "", notes: o.notes ?? "", lines: o.lines.map((l) => ({ productId: l.productId, qty: toQtyText(l.qty), unitPrice: toMoneyText(l.unitPrice), taxCode: l.taxCode ?? "" })) }
    : r
      ? {
          supplierId: r.lines.find((l) => l.suggestedSupplierId)?.suggestedSupplierId ?? "", warehouseId: "", expectedDate: r.requiredDate ?? "", notes: "",
          lines: r.lines.filter((l) => l.productId).map((l) => ({ productId: l.productId!, qty: toQtyText(l.qty), unitPrice: l.estimatedPrice ? toMoneyText(l.estimatedPrice) : "", taxCode: "" })),
        }
      : { supplierId: "", warehouseId: "", expectedDate: "", notes: "", lines: [blankPoLine()] };
  return <OrderForm seed={seed} requisitionId={requisitionId} amend={o} />;
}

function OrderForm({ seed, requisitionId, amend }: { seed: OrderSeed; requisitionId: string; amend?: PurchaseOrder }) {
  const router = useRouter();
  const suppliers = useActiveSuppliers();
  const warehouses = useWarehouses();
  const products = usePurchasable();
  const settings = useQuery({ queryKey: ["sales-settings"], queryFn: () => api.get("/sales/settings").then((r) => r.data as { taxRates: { code: string; name: string }[]; defaultWarehouseId?: string | null }) });
  const [supplierId, setSupplierId] = useState(seed.supplierId);
  const [chosenWarehouse, setWarehouseId] = useState(seed.warehouseId);
  const warehouseId = chosenWarehouse || settings.data?.defaultWarehouseId || "";
  const [expectedDate, setExpectedDate] = useState(seed.expectedDate);
  const [notes, setNotes] = useState(seed.notes);
  const [lines, setLines] = useState<PoLineForm[]>(seed.lines);


  const save = useMutation({
    mutationFn: () => {
      const body = {
        expectedDate: expectedDate || undefined, notes: notes || undefined,
        lines: lines.filter((l) => l.productId && l.qty).map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice || undefined, taxCode: l.taxCode || undefined })),
      };
      return amend
        ? procurementApi.orders.update(amend.id, body, amend.version)
        : procurementApi.orders.create({ ...body, supplierId, warehouseId, requisitionId: requisitionId || undefined });
    },
    onSuccess: (o) => { toast.success(`${o.number} saved`); router.push(`/procurement/orders/${o.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (i: number, patch: Partial<PoLineForm>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const locked = !!amend;

  return (
    <form className="max-w-5xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title={amend ? `Amend ${amend.number}` : "New purchase order"} subtitle="Prices left blank use the product's purchase price." />
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Supplier" required>
          <select className="input-base" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={locked}>
            <option value="">Choose…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
        </Field>
        <Field label="Deliver to" required>
          <select className="input-base" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={locked}>
            <option value="">Choose…</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
        </Field>
        <Field label="Expected delivery"><input type="date" className="input-base" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></Field>
        <div className="sm:col-span-3"><Field label="Notes to supplier"><input className="input-base" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      </section>
      <section className="card p-5 space-y-2">
        <h2 className="font-semibold">Lines</h2>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <select className="input-base col-span-12 sm:col-span-5" value={l.productId} onChange={(e) => set(i, { productId: e.target.value })} aria-label="Product">
              <option value="">Product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku}) · {formatMoney(p.purchasePrice, p.currency)}</option>)}
            </select>
            <input className="input-base col-span-3 sm:col-span-2" placeholder="Qty" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label="Quantity" />
            <input className="input-base col-span-4 sm:col-span-2" placeholder="Price (auto)" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} aria-label="Unit price" />
            <select className="input-base col-span-4 sm:col-span-2" value={l.taxCode} onChange={(e) => set(i, { taxCode: e.target.value })} aria-label="Tax">
              <option value="">Tax (default)</option>
              {(settings.data?.taxRates ?? []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
            <button type="button" className="btn-ghost col-span-1" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" className="btn-ghost text-blue-600" onClick={() => setLines([...lines, blankPoLine()])}><Plus size={14} /> Line</button>
      </section>
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href="/procurement/orders">Cancel</Link>
        <button className="btn-primary" disabled={!supplierId || !warehouseId || save.isPending || !lines.some((l) => l.productId)}>{amend ? "Save amendment" : "Create order"}</button>
      </div>
    </form>
  );
}

// ─── New goods receipt ────────────────────────────────────────────────────────

interface RecvForm { received: string; rejected: string; rejectReason: string; lotNo: string; expiryDate: string }

function NewReceipt() {
  const params = useSearchParams();
  const orderId = params.get("order") ?? "";
  const order = useQuery({ queryKey: ["procurement.order", "one", orderId], queryFn: () => procurementApi.orders.get(orderId), enabled: !!orderId });
  if (!orderId) return <EmptyState title="Open a purchase order and choose Receive" />;
  if (order.isLoading) return <Spinner />;
  if (order.isError) return <ErrorState message={errorMessage(order.error)} />;
  return <ReceiptForm o={order.data!} />;
}

function ReceiptForm({ o }: { o: PurchaseOrder }) {
  const router = useRouter();
  const orderId = o.id;
  const name = useProductNames();
  const [note, setNote] = useState("");
  const [form, setForm] = useState<Record<string, RecvForm>>(() =>
    Object.fromEntries(o.lines.map((l) => [l.lineId, { received: toQtyText(Math.max(0, l.qty - (l.received - l.rejected))), rejected: "", rejectReason: "", lotNo: "", expiryDate: "" }])),
  );
  const save = useMutation({
    mutationFn: () => procurementApi.receipts.create({
      orderId, supplierDeliveryNote: note || undefined,
      lines: Object.entries(form).filter(([, f]) => f.received && Number(f.received) > 0).map(([orderLineId, f]) => ({
        orderLineId, received: f.received, rejected: f.rejected || undefined, rejectReason: f.rejectReason || undefined, lotNo: f.lotNo || undefined, expiryDate: f.expiryDate || undefined,
      })),
    }),
    onSuccess: (g: GoodsReceipt) => { toast.success(`${g.number} created; post it to update stock`); router.push(`/procurement/receipts/${g.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (id: string, patch: Partial<RecvForm>) => setForm({ ...form, [id]: { ...form[id]!, ...patch } });
  return (
    <form className="max-w-5xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title={`Receive against ${o.number}`} subtitle="Enter what arrived; anything failing inspection goes under rejected." />
      <section className="card p-5 space-y-4 overflow-x-auto">
        <Field label="Supplier delivery note"><input className="input-base max-w-xs" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <table className="table-base">
          <thead><tr><th>Product</th><th>Outstanding</th><th>Received</th><th>Rejected</th><th>Reason</th><th>Lot</th><th>Expiry</th></tr></thead>
          <tbody>
            {o.lines.map((l) => {
              const f = form[l.lineId];
              if (!f) return null;
              return (
                <tr key={l.lineId}>
                  <td>{name(l.productId)}</td>
                  <td>{toQtyText(Math.max(0, l.qty - (l.received - l.rejected)))}</td>
                  <td><input className="input-base w-20 py-1" value={f.received} onChange={(e) => set(l.lineId, { received: e.target.value })} aria-label="Received" /></td>
                  <td><input className="input-base w-20 py-1" value={f.rejected} onChange={(e) => set(l.lineId, { rejected: e.target.value })} aria-label="Rejected" /></td>
                  <td><input className="input-base w-36 py-1" value={f.rejectReason} onChange={(e) => set(l.lineId, { rejectReason: e.target.value })} aria-label="Reject reason" disabled={!f.rejected} /></td>
                  <td><input className="input-base w-24 py-1" value={f.lotNo} onChange={(e) => set(l.lineId, { lotNo: e.target.value })} aria-label="Lot" /></td>
                  <td><input type="date" className="input-base py-1" value={f.expiryDate} onChange={(e) => set(l.lineId, { expiryDate: e.target.value })} aria-label="Expiry" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href={`/procurement/orders/${orderId}`}>Cancel</Link>
        <button className="btn-primary" disabled={save.isPending}>Create receipt</button>
      </div>
    </form>
  );
}

// ─── New supplier return ──────────────────────────────────────────────────────

function NewSupplierReturn() {
  const router = useRouter();
  const params = useSearchParams();
  const receiptId = params.get("receipt") ?? "";
  const name = useProductNames();
  const receipt = useQuery({ queryKey: ["procurement.receipt", "one", receiptId], queryFn: () => procurementApi.receipts.get(receiptId), enabled: !!receiptId });
  const [reason, setReason] = useState("");
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const save = useMutation({
    mutationFn: () => procurementApi.returns.create({ receiptId, reason, lines: Object.entries(qtys).filter(([, v]) => v).map(([i, v]) => ({ receiptLineIndex: Number(i), qty: v })) }),
    onSuccess: (r) => router.push(`/procurement/returns/${r.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!receiptId) return <EmptyState title="Open a posted goods receipt and choose Return to supplier" />;
  if (receipt.isLoading) return <Spinner />;
  if (receipt.isError) return <ErrorState message={errorMessage(receipt.error)} />;
  return (
    <form className="max-w-3xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title={`Return from ${receipt.data!.number}`} />
      <section className="card p-5 space-y-4">
        <Field label="Reason" required><input className="input-base" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <table className="table-base">
          <thead><tr><th>Product</th><th>Accepted</th><th>Return qty</th></tr></thead>
          <tbody>
            {receipt.data!.lines.map((l, i) => (
              <tr key={i}>
                <td>{name(l.productId)}</td><td>{toQtyText(l.accepted)}</td>
                <td><input className="input-base w-24 py-1" value={qtys[i] ?? ""} onChange={(e) => setQtys({ ...qtys, [i]: e.target.value })} aria-label="Return quantity" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="flex justify-end"><button className="btn-primary" disabled={!reason || save.isPending}>Create return</button></div>
    </form>
  );
}

const NEW_FORMS: Record<string, () => React.ReactElement> = {
  requisition: NewRequisition,
  rfq: NewRfq,
  order: NewOrder,
  receipt: NewReceipt,
  return: NewSupplierReturn,
};

export function NewProcurementDocument({ kind }: { kind: string }) {
  const Form = NEW_FORMS[kind];
  if (!Form) notFound();
  return <Suspense fallback={<Spinner />}><Form /></Suspense>;
}

// ─── RFQ: record quotes and award ─────────────────────────────────────────────

export function RfqQuotePage({ id }: { id: string }) {
  const router = useRouter();
  const supplierName = useSupplierName();
  const warehouses = useWarehouses();
  const rfq = useQuery({ queryKey: ["procurement.rfq", "one", id], queryFn: () => procurementApi.rfqs.get(id) });
  const [supplierId, setSupplierId] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [leadTime, setLeadTime] = useState("");
  const [awardTo, setAwardTo] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState("");

  const chooseSupplier = (id: string) => {
    setSupplierId(id);
    const q = rfq.data?.quotes.find((x) => x.supplierId === id);
    setPrices(q ? Object.fromEntries(Object.entries(q.prices).map(([k, v]) => [k, toMoneyText(v)])) : {});
    setLeadTime(q?.leadTimeDays != null ? String(q.leadTimeDays) : "");
  };

  const record = useMutation({
    mutationFn: () => procurementApi.post<Rfq>(`/procurement/rfqs/${id}/quotes`, {
      supplierId, prices: Object.fromEntries(Object.entries(prices).filter(([, v]) => v)), leadTimeDays: leadTime ? Number(leadTime) : undefined,
    }),
    onSuccess: () => { toast.success("Quote recorded"); chooseSupplier(""); rfq.refetch(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const award = useMutation({
    mutationFn: () => procurementApi.post<{ order: PurchaseOrder }>(`/procurement/rfqs/${id}/award`, { supplierId: awardTo, warehouseId, reason: reason || undefined }),
    onSuccess: (r) => { toast.success(`${r.order.number} raised`); router.push(`/procurement/orders/${r.order.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (rfq.isLoading) return <Spinner />;
  if (rfq.isError) return <ErrorState message={errorMessage(rfq.error)} />;
  const r = rfq.data!;
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={`${r.number}: quotes`} actions={<Link className="btn-secondary" href={`/procurement/rfqs/${id}`}>Back to the comparison</Link>} />
      <form className="card p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); record.mutate(); }}>
        <h2 className="font-semibold">Record a quote</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Supplier" required>
            <select className="input-base" value={supplierId} onChange={(e) => chooseSupplier(e.target.value)}>
              <option value="">Choose…</option>
              {r.supplierIds.map((s) => <option key={s} value={s}>{supplierName(s)}{r.quotes.some((q) => q.supplierId === s) ? " (quoted)" : ""}</option>)}
            </select>
          </Field>
          <Field label="Lead time (days)"><input className="input-base" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} /></Field>
        </div>
        <table className="table-base">
          <thead><tr><th>Item</th><th>Qty</th><th>Unit price</th></tr></thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.lineId}>
                <td>{l.description}</td><td>{toQtyText(l.qty)}</td>
                <td><input className="input-base w-32 py-1" value={prices[l.lineId] ?? ""} onChange={(e) => setPrices({ ...prices, [l.lineId]: e.target.value })} aria-label={`Price for ${l.description}`} disabled={!supplierId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end"><button className="btn-primary" disabled={!supplierId || record.isPending}>Save quote</button></div>
      </form>
      {r.quotes.length > 0 && (
        <form className="card p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); award.mutate(); }}>
          <h2 className="font-semibold">Award</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Supplier" required>
              <select className="input-base" value={awardTo} onChange={(e) => setAwardTo(e.target.value)}>
                <option value="">Choose…</option>
                {r.quotes.map((q) => <option key={q.supplierId} value={q.supplierId}>{supplierName(q.supplierId)}</option>)}
              </select>
            </Field>
            <Field label="Deliver to" required>
              <select className="input-base" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">Choose…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2"><Field label="Reason" hint="Required when not choosing the cheapest complete quote"><input className="input-base" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
          </div>
          <div className="flex justify-end"><button className="btn-primary" disabled={!awardTo || !warehouseId || award.isPending}><Award size={15} /> Award and raise order</button></div>
        </form>
      )}
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

interface ProcurementAnalytics {
  orders: number;
  totalSpend: number;
  openCommitment: number;
  byCategory: Record<string, number>;
  byDepartment: Record<string, number>;
  suppliers: { supplierId: string; name: string; spend: number; performanceScore: number | null; onTimeRate: number | null; acceptanceRate: number | null; averageLeadTimeDays: number | null }[];
  priceVariance: { productId: string; qty: number; averagePrice: number; minPrice: number; maxPrice: number; standardPrice: number | null; variance: number }[];
}

function SpendBars({ data, label }: { data: Record<string, number>; label: (k: string) => string }) {
  const max = Math.max(1, ...Object.values(data));
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!rows.length) return <p className="text-sm text-slate-500">No spend yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map(([k, v]) => (
        <li key={k} className="text-sm">
          <div className="flex justify-between gap-2"><span className="truncate">{label(k)}</span><span className="text-slate-500">{formatMoney(v, "LKR")}</span></div>
          <div className="h-2 rounded bg-slate-100 dark:bg-slate-800 mt-1"><div className="h-2 rounded bg-blue-500" style={{ width: `${(v / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function AnalyticsBody({ a }: { a: ProcurementAnalytics }) {
  const product = useProductNames();
  const categories = useQuery({ queryKey: ["options", "products.categories.raw"], queryFn: () => productsApi.categories.list({ limit: 200 }) });
  const departments = useQuery({ queryKey: ["options", "org.departments.raw"], queryFn: () => orgApi.departments.list({ limit: 200 }) });
  const catName = (id: string) => (id === "uncategorised" ? "Uncategorised" : categories.data?.items.find((c) => c.id === id)?.name ?? "…");
  const depName = (id: string) => (id === "unassigned" ? "No department" : departments.data?.items.find((d) => d.id === id)?.name ?? "…");
  const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card"><p className="text-xl font-semibold">{formatMoney(a.totalSpend, "LKR")}</p><p className="text-sm text-slate-500">Spend before tax ({a.orders} orders)</p></div>
        <div className="stat-card"><p className="text-xl font-semibold">{formatMoney(a.openCommitment, "LKR")}</p><p className="text-sm text-slate-500">Still to be received</p></div>
        <div className="stat-card"><p className="text-xl font-semibold">{a.suppliers.length}</p><p className="text-sm text-slate-500">Suppliers with activity</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="card p-5"><h2 className="font-semibold mb-3">By supplier</h2><SpendBars data={Object.fromEntries(a.suppliers.map((s) => [s.name, s.spend]))} label={(k) => k} /></section>
        <section className="card p-5"><h2 className="font-semibold mb-3">By category</h2><SpendBars data={a.byCategory} label={catName} /></section>
        <section className="card p-5"><h2 className="font-semibold mb-3">By department</h2><SpendBars data={a.byDepartment} label={depName} /></section>
      </div>
      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">Supplier performance</h2>
        <table className="table-base">
          <thead><tr><th>Supplier</th><th>Spend</th><th>Score</th><th>On time</th><th>Accepted</th><th>Avg. lead time</th></tr></thead>
          <tbody>
            {a.suppliers.map((s) => (
              <tr key={s.supplierId}>
                <td><Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/procurement/suppliers/${s.supplierId}`}>{s.name}</Link></td>
                <td>{formatMoney(s.spend, "LKR")}</td><td>{s.performanceScore ?? "—"}</td><td>{pct(s.onTimeRate)}</td><td>{pct(s.acceptanceRate)}</td>
                <td>{s.averageLeadTimeDays === null ? "—" : `${s.averageLeadTimeDays} days`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">Price variance against standard purchase price</h2>
        <table className="table-base">
          <thead><tr><th>Product</th><th>Qty</th><th>Standard</th><th>Average</th><th>Range</th><th className="text-right">Variance</th></tr></thead>
          <tbody>
            {a.priceVariance.map((p) => (
              <tr key={p.productId}>
                <td>{product(p.productId)}</td><td>{toQtyText(p.qty)}</td>
                <td>{p.standardPrice === null ? "—" : formatMoney(p.standardPrice, "LKR")}</td>
                <td>{formatMoney(p.averagePrice, "LKR")}</td>
                <td>{formatMoney(p.minPrice, "LKR")} – {formatMoney(p.maxPrice, "LKR")}</td>
                <td className={`text-right ${p.variance > 0 ? "text-red-600 dark:text-red-400" : p.variance < 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{formatMoney(p.variance, "LKR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function ProcurementDashboard() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useQuery({
    queryKey: ["procurement-analytics", from, to],
    queryFn: () => api.get("/procurement/analytics", { params: { from: from || undefined, to: to || undefined } }).then((r) => r.data as ProcurementAnalytics),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Procurement"
        subtitle="Spend, prices and supplier performance"
        actions={
          <div className="flex gap-2 items-center">
            <input type="date" className="input-base py-1" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <input type="date" className="input-base py-1" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </div>
        }
      />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : <AnalyticsBody a={q.data!} />}
    </div>
  );
}
