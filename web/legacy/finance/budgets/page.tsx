"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { budgetApi, glApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Loader2, X, Trash2, PlusCircle, CheckCircle } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

const STATUS_BADGES: Record<string, string> = {
  DRAFT: "badge-yellow",
  APPROVED: "badge-green",
  CLOSED: "badge-slate",
};

const lineSchema = z.object({
  accountId: z.string().min(1, "Select account"),
  period: z.coerce.number().int().min(1).max(12),
  amount: z.coerce.number().min(0),
  notes: z.string().optional(),
});

const budgetSchema = z.object({
  name: z.string().min(1, "Name required"),
  fiscalYear: z.coerce.number().int().min(2020),
  description: z.string().optional(),
  lines: z.array(lineSchema).min(1, "At least one budget line required"),
});

type BudgetForm = z.infer<typeof budgetSchema>;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function BudgetsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const currentYear = new Date().getFullYear();

  const { data: budgetData, isLoading } = useQuery({
    queryKey: ["budgets", activeCompany?.id],
    queryFn: () => budgetApi.list({ limit: 50 }),
    enabled: !!activeCompany,
  });

  const { data: selectedDetail } = useQuery({
    queryKey: ["budget-detail", selected?.id],
    queryFn: () => budgetApi.get(selected.id),
    enabled: !!selected,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["gl-accounts", activeCompany?.id],
    queryFn: () => glApi.accounts.list(),
    enabled: !!activeCompany,
  });

  const postingAccounts = (accounts as any[]).filter((a: any) => a.isPosting && a.isActive);

  const { mutate: createBudget, isPending: isCreating } = useMutation({
    mutationFn: (data: BudgetForm) => budgetApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget created");
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed to create budget"),
  });

  const { mutate: approveBudget } = useMutation({
    mutationFn: (id: string) => budgetApi.approve(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["budgets"] }); qc.invalidateQueries({ queryKey: ["budget-detail"] }); toast.success("Budget approved"); },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      fiscalYear: currentYear,
      lines: [{ accountId: "", period: 1, amount: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const budgets = budgetData?.data || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Budgets</h1>
          <p className="page-subtitle">{budgets.length} budgets</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} />
          New Budget
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="col-span-2 flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
        ) : budgets.length === 0 ? (
          <div className="col-span-2 text-center py-16 text-slate-400">No budgets yet. Create your first one.</div>
        ) : (
          budgets.map((b: any) => (
            <div key={b.id} className="card p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelected(b)}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{b.name}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">FY {b.fiscalYear}</p>
                </div>
                <span className={clsx("badge", STATUS_BADGES[b.status] || "badge-slate")}>{b.status}</span>
              </div>
              {b.description && <p className="text-sm text-slate-600 mt-2">{b.description}</p>}
              <p className="text-xs text-slate-400 mt-3">Created {format(new Date(b.createdAt), "dd MMM yyyy")}</p>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
                <p className="text-sm text-slate-500">FY {selected.fiscalYear}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.status === "DRAFT" && (
                  <button onClick={() => approveBudget(selected.id)} className="btn-primary">
                    <CheckCircle size={15} />
                    Approve
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
                      <th>Account</th>
                      <th>Period</th>
                      <th className="text-right">Amount</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDetail.lines.map((l: any) => (
                      <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 text-sm"><span className="font-mono text-slate-500 mr-2">{l.account?.code}</span>{l.account?.name}</td>
                        <td className="px-4 py-2 text-sm text-slate-600">{MONTHS[l.period - 1]}</td>
                        <td className="px-4 py-2 text-sm text-right font-mono font-medium">{fmt(Number(l.amount))}</td>
                        <td className="px-4 py-2 text-sm text-slate-500">{l.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-center py-8 text-slate-400">Loading budget lines...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New Budget</h2>
              <button onClick={() => { setShowCreate(false); reset(); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => createBudget(d))} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Budget Name *</label>
                    <input {...register("name")} className="input-base" placeholder="Annual Budget 2025" />
                    {errors.name && <p className="form-error">{errors.name.message}</p>}
                  </div>
                  <div>
                    <label className="form-label">Fiscal Year *</label>
                    <input {...register("fiscalYear")} type="number" min="2020" max="2030" className="input-base" />
                  </div>
                </div>
                <div>
                  <label className="form-label">Description</label>
                  <input {...register("description")} className="input-base" placeholder="Budget description" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="form-label mb-0">Budget Lines</label>
                  </div>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 w-2/5">Account</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 w-28">Period</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-28">Amount</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field, idx) => (
                          <tr key={field.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-2 py-1.5">
                              <select {...register(`lines.${idx}.accountId`)} className="w-full text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                                <option value="">Select account...</option>
                                {postingAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <select {...register(`lines.${idx}.period`)} className="w-full text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <input {...register(`lines.${idx}.amount`)} type="number" step="0.01" min="0" className="w-full text-sm text-right border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" placeholder="0.00" />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {fields.length > 1 && <button type="button" onClick={() => remove(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={() => append({ accountId: "", period: 1, amount: 0 })} className="mt-2 btn-ghost text-blue-600">
                    <PlusCircle size={14} />Add Line
                  </button>
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 flex gap-3">
                <button type="button" onClick={() => { setShowCreate(false); reset(); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={isCreating} className="btn-primary flex-1">
                  {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create Budget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
