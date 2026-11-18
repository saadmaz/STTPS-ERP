"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { glApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus, Search, Loader2, X, Trash2, CheckCircle, Eye, PlusCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";

const STATUS_BADGES: Record<string, string> = {
  DRAFT: "badge-yellow",
  POSTED: "badge-green",
  REVERSED: "badge-slate",
  VOID: "badge-red",
};

const lineSchema = z.object({
  accountId: z.string().min(1, "Select account"),
  description: z.string().optional(),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
});

const journalSchema = z.object({
  date: z.string().min(1, "Date required"),
  description: z.string().optional(),
  reference: z.string().optional(),
  currency: z.string().default("USD"),
  lines: z.array(lineSchema).min(2, "Minimum 2 lines"),
});

type JournalForm = z.infer<typeof journalSchema>;

export default function JournalsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<any>(null);

  const { data: journalData, isLoading } = useQuery({
    queryKey: ["gl-journals", activeCompany?.id, page, search],
    queryFn: () => glApi.journals.list({ page, limit: 25, search }),
    enabled: !!activeCompany,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["gl-accounts", activeCompany?.id],
    queryFn: () => glApi.accounts.list(),
    enabled: !!activeCompany,
  });

  const postingAccounts = accounts.filter((a: any) => a.isPosting && a.isActive);

  const { mutate: createJournal, isPending: isCreating } = useMutation({
    mutationFn: (data: JournalForm) => glApi.journals.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gl-journals"] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
      toast.success("Journal entry created");
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed to create journal"),
  });

  const { mutate: postJournal } = useMutation({
    mutationFn: (id: string) => glApi.journals.post(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gl-journals"] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
      toast.success("Journal posted successfully");
      setSelectedJournal(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed to post journal"),
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(journalSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      currency: activeCompany?.currency || "USD",
      lines: [
        { accountId: "", debit: 0, credit: 0 },
        { accountId: "", debit: 0, credit: 0 },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = watch("lines");

  const totalDebits = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.001;

  const journals = journalData?.data || [];
  const total = journalData?.total || 0;
  const pages = journalData?.pages || 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Journal Entries</h1>
          <p className="page-subtitle">{total} entries in {activeCompany?.name}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} />
          New Journal
        </button>
      </div>

      {/* Search */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 p-3">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            placeholder="Search by number, description or reference..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400"
          />
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
                    <th>Number</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {journals.map((j: any) => (
                    <tr key={j.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-medium text-blue-700">{j.number}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {format(new Date(j.date), "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800 max-w-[200px] truncate">
                        {j.description || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{j.reference || "—"}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-slate-800">
                        {Number(j.totalDebit).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-slate-800">
                        {Number(j.totalCredit).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge badge-slate">{j.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx("badge", STATUS_BADGES[j.status] || "badge-slate")}>
                          {j.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setSelectedJournal(j)}
                            className="btn-ghost px-2 py-1"
                            title="View"
                          >
                            <Eye size={14} />
                          </button>
                          {j.status === "DRAFT" && (
                            <button
                              onClick={() => postJournal(j.id)}
                              className="btn-ghost px-2 py-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                              title="Post"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {journals.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-slate-400">
                        No journal entries found. Create your first entry.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-sm text-slate-500">
                  Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="btn-secondary px-3 py-1 text-xs"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-600">Page {page} of {pages}</span>
                  <button
                    disabled={page >= pages}
                    onClick={() => setPage(page + 1)}
                    className="btn-secondary px-3 py-1 text-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* View Journal Modal */}
      {selectedJournal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedJournal.number}</h2>
                <p className="text-sm text-slate-500">{format(new Date(selectedJournal.date), "dd MMMM yyyy")}</p>
              </div>
              <div className="flex items-center gap-3">
                {selectedJournal.status === "DRAFT" && (
                  <button
                    onClick={() => postJournal(selectedJournal.id)}
                    className="btn-primary"
                  >
                    <CheckCircle size={16} />
                    Post Journal
                  </button>
                )}
                <span className={clsx("badge", STATUS_BADGES[selectedJournal.status])}>
                  {selectedJournal.status}
                </span>
                <button onClick={() => setSelectedJournal(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto">
              {selectedJournal.description && (
                <p className="text-sm text-slate-600 mb-4">{selectedJournal.description}</p>
              )}
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Description</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedJournal.lines?.map((line: any, i: number) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-4 py-2 text-sm">
                        <span className="font-mono text-slate-500 mr-2">{line.account?.code}</span>
                        {line.account?.name}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-500">{line.description || "—"}</td>
                      <td className="px-4 py-2 text-sm text-right font-mono">
                        {Number(line.debit) > 0 ? Number(line.debit).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono">
                        {Number(line.credit) > 0 ? Number(line.credit).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <td colSpan={2} className="px-4 py-2 text-sm">Total</td>
                    <td className="px-4 py-2 text-sm text-right font-mono">
                      {Number(selectedJournal.totalDebit).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-mono">
                      {Number(selectedJournal.totalCredit).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create Journal Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New Journal Entry</h2>
              <button
                onClick={() => { setShowCreate(false); reset(); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit((data) => createJournal(data))}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="form-label">Date *</label>
                    <input {...register("date")} type="date" className="input-base" />
                    {errors.date && <p className="form-error">{errors.date.message}</p>}
                  </div>
                  <div>
                    <label className="form-label">Reference</label>
                    <input {...register("reference")} className="input-base" placeholder="e.g. INV-001" />
                  </div>
                  <div>
                    <label className="form-label">Currency</label>
                    <select {...register("currency")} className="input-base">
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label">Description</label>
                  <input {...register("description")} className="input-base" placeholder="Journal description" />
                </div>

                {/* Lines */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="form-label mb-0">Journal Lines</label>
                    <div className="flex items-center gap-4 text-xs">
                      <span className={clsx("font-mono", isBalanced ? "text-green-600" : "text-red-600")}>
                        Dr: {totalDebits.toFixed(2)} | Cr: {totalCredits.toFixed(2)}
                        {isBalanced ? " ✓ Balanced" : " ✗ Unbalanced"}
                      </span>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 w-2/5">Account</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Description</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-24">Debit</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-24">Credit</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field, idx) => (
                          <tr key={field.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-2 py-1.5">
                              <select
                                {...register(`lines.${idx}.accountId`)}
                                className="w-full text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">Select account...</option>
                                {postingAccounts.map((a: any) => (
                                  <option key={a.id} value={a.id}>
                                    {a.code} — {a.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                {...register(`lines.${idx}.description`)}
                                className="w-full text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Description"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                {...register(`lines.${idx}.debit`)}
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-full text-sm text-right border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                {...register(`lines.${idx}.credit`)}
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-full text-sm text-right border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {fields.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => remove(idx)}
                                  className="text-slate-300 hover:text-red-500"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={() => append({ accountId: "", debit: 0, credit: 0 })}
                    className="mt-2 btn-ghost text-blue-600"
                  >
                    <PlusCircle size={14} />
                    Add Line
                  </button>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); reset(); }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !isBalanced}
                  className="btn-primary flex-1"
                >
                  {isCreating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  Save as Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
