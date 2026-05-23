"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Search, Loader2, X, Trash2, CheckCircle, Eye, PlusCircle, Clock } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";
import Link from "next/link";

const STATUS_BADGES: Record<string, string> = {
  DRAFT: "badge-yellow",
  PENDING_APPROVAL: "badge-blue",
  APPROVED: "badge-purple",
  POSTED: "badge-green",
  PAID: "badge-slate",
  CANCELLED: "badge-red",
};

const lineSchema = z.object({
  accountId: z.string().min(1, "Select account"),
  description: z.string().min(1, "Description required"),
  quantity: z.coerce.number().min(0).optional(),
  unitPrice: z.coerce.number().min(0),
  amount: z.coerce.number().min(0),
  taxAmount: z.coerce.number().min(0).optional(),
});

const invoiceSchema = z.object({
  vendorId: z.string().min(1, "Select vendor"),
  date: z.string().min(1, "Date required"),
  dueDate: z.string().min(1, "Due date required"),
  vendorRef: z.string().optional(),
  currency: z.string().default("USD"),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, "At least one line required"),
});

type InvoiceForm = z.infer<typeof invoiceSchema>;

export default function ApInvoicesPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ["ap-invoices", activeCompany?.id, page, search, statusFilter],
    queryFn: () => apApi.invoices.list({ page, limit: 25, search, status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["ap-vendors-all", activeCompany?.id],
    queryFn: () => apApi.vendors.list({ limit: 200 }).then((r: any) => r.data),
    enabled: !!activeCompany,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["gl-accounts", activeCompany?.id],
    queryFn: () => import("@/lib/api").then((m) => m.glApi.accounts.list()),
    enabled: !!activeCompany,
  });

  const expenseAccounts = (accounts as any[]).filter((a: any) => a.type === "EXPENSE" && a.isPosting && a.isActive);

  const { mutate: createInvoice, isPending: isCreating } = useMutation({
    mutationFn: (data: InvoiceForm) => apApi.invoices.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ap-invoices"] });
      toast.success("Invoice created");
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed to create invoice"),
  });

  const { mutate: approveInvoice } = useMutation({
    mutationFn: (id: string) => apApi.invoices.approve(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ap-invoices"] }); toast.success("Invoice approved"); setSelected(null); },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const { mutate: postInvoice } = useMutation({
    mutationFn: (id: string) => apApi.invoices.post(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ap-invoices"] }); toast.success("Invoice posted"); setSelected(null); },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const { register, handleSubmit, control, watch, reset, setValue, formState: { errors } } = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      currency: activeCompany?.currency || "USD",
      lines: [{ accountId: "", description: "", unitPrice: 0, amount: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = watch("lines");
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0) + (Number(l.taxAmount) || 0), 0);

  const invoices = invoiceData?.data || [];
  const totalCount = invoiceData?.total || 0;
  const pages = invoiceData?.pages || 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts Payable</h1>
          <p className="page-subtitle">{totalCount} invoices in {activeCompany?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/finance/ap/vendors" className="btn-secondary">Vendors</Link>
          <Link href="/finance/ap/aging" className="btn-secondary">
            <Clock size={15} />
            Aging Report
          </Link>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={16} />
            New Invoice
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 p-3">
          <Search size={16} className="text-slate-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="text-sm border-0 outline-none text-slate-600 bg-transparent"
          >
            <option value="">All statuses</option>
            {Object.keys(STATUS_BADGES).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Vendor</th>
                    <th>Date</th>
                    <th>Due Date</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any) => (
                    <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-medium text-blue-700">{inv.number}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800">{inv.vendor?.name || "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{format(new Date(inv.date), "dd MMM yyyy")}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{format(new Date(inv.dueDate), "dd MMM yyyy")}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{Number(inv.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{Number(inv.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3">
                        <span className={clsx("badge", STATUS_BADGES[inv.status] || "badge-slate")}>{inv.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSelected(inv)} className="btn-ghost px-2 py-1" title="View"><Eye size={14} /></button>
                          {inv.status === "DRAFT" && (
                            <button onClick={() => approveInvoice(inv.id)} className="btn-ghost px-2 py-1 text-blue-600 hover:bg-blue-50" title="Approve"><CheckCircle size={14} /></button>
                          )}
                          {inv.status === "APPROVED" && (
                            <button onClick={() => postInvoice(inv.id)} className="btn-ghost px-2 py-1 text-green-600 hover:bg-green-50" title="Post"><CheckCircle size={14} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-12 text-slate-400">No invoices found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-sm text-slate-500">Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, totalCount)} of {totalCount}</p>
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary px-3 py-1 text-xs">Previous</button>
                  <span className="text-sm text-slate-600">Page {page} of {pages}</span>
                  <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-secondary px-3 py-1 text-xs">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* View Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.number}</h2>
                <p className="text-sm text-slate-500">{selected.vendor?.name} · {format(new Date(selected.date), "dd MMM yyyy")}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.status === "DRAFT" && <button onClick={() => approveInvoice(selected.id)} className="btn-secondary">Approve</button>}
                {selected.status === "APPROVED" && <button onClick={() => postInvoice(selected.id)} className="btn-primary">Post</button>}
                <span className={clsx("badge", STATUS_BADGES[selected.status])}>{selected.status}</span>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><p className="text-slate-500">Due Date</p><p className="font-medium">{format(new Date(selected.dueDate), "dd MMM yyyy")}</p></div>
                <div><p className="text-slate-500">Vendor Ref</p><p className="font-medium">{selected.vendorRef || "—"}</p></div>
                <div><p className="text-slate-500">Currency</p><p className="font-medium">{selected.currency}</p></div>
              </div>
              <table className="table-base">
                <thead><tr><th>Description</th><th className="text-right">Amount</th><th className="text-right">Tax</th></tr></thead>
                <tbody>
                  {selected.lines?.map((l: any, i: number) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-4 py-2 text-sm">{l.description}</td>
                      <td className="px-4 py-2 text-sm text-right font-mono">{Number(l.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-2 text-sm text-right font-mono">{Number(l.taxAmount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <td colSpan={2} className="px-4 py-2 text-sm">Total</td>
                    <td className="px-4 py-2 text-sm text-right font-mono">{Number(selected.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New AP Invoice</h2>
              <button onClick={() => { setShowCreate(false); reset(); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => createInvoice(d))} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="form-label">Vendor *</label>
                  <select {...register("vendorId")} className="input-base">
                    <option value="">Select vendor...</option>
                    {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  {errors.vendorId && <p className="form-error">{errors.vendorId.message}</p>}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="form-label">Invoice Date *</label>
                    <input {...register("date")} type="date" className="input-base" />
                  </div>
                  <div>
                    <label className="form-label">Due Date *</label>
                    <input {...register("dueDate")} type="date" className="input-base" />
                  </div>
                  <div>
                    <label className="form-label">Vendor Ref</label>
                    <input {...register("vendorRef")} className="input-base" placeholder="Vendor's inv number" />
                  </div>
                </div>
                <div>
                  <label className="form-label">Notes</label>
                  <input {...register("notes")} className="input-base" placeholder="Optional notes" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="form-label mb-0">Lines</label>
                    <span className="text-sm font-mono text-slate-600">Total: {total.toFixed(2)}</span>
                  </div>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 w-1/3">Account</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Description</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-24">Amount</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field, idx) => (
                          <tr key={field.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-2 py-1.5">
                              <select {...register(`lines.${idx}.accountId`)} className="w-full text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                                <option value="">Select account...</option>
                                {expenseAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <input {...register(`lines.${idx}.description`)} className="w-full text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Description" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                {...register(`lines.${idx}.amount`)}
                                type="number" step="0.01" min="0"
                                onChange={(e) => { register(`lines.${idx}.amount`).onChange(e); setValue(`lines.${idx}.unitPrice`, Number(e.target.value)); }}
                                className="w-full text-sm text-right border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {fields.length > 1 && <button type="button" onClick={() => remove(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={() => append({ accountId: "", description: "", unitPrice: 0, amount: 0 })} className="mt-2 btn-ghost text-blue-600">
                    <PlusCircle size={14} />Add Line
                  </button>
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 flex gap-3">
                <button type="button" onClick={() => { setShowCreate(false); reset(); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={isCreating} className="btn-primary flex-1">
                  {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
