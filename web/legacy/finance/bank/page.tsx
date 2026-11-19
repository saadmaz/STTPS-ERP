"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { bankApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Loader2, X, CreditCard } from "lucide-react";
import { format } from "date-fns";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

const accountSchema = z.object({
  code: z.string().min(1, "Code required"),
  name: z.string().min(1, "Name required"),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  currency: z.string().default("USD"),
  glAccountId: z.string().optional(),
});

type AccountForm = z.infer<typeof accountSchema>;

export default function BankPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);

  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["bank-summary", activeCompany?.id],
    queryFn: () => bankApi.summary(),
    enabled: !!activeCompany,
  });

  const { data: txnData, isLoading: isTxnsLoading } = useQuery({
    queryKey: ["bank-transactions", selectedAccount?.id],
    queryFn: () => bankApi.accounts.transactions(selectedAccount.id, { limit: 50 }),
    enabled: !!selectedAccount,
  });

  const { mutate: createAccount, isPending: isCreating } = useMutation({
    mutationFn: (data: AccountForm) => bankApi.accounts.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-summary"] });
      toast.success("Bank account created");
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: { currency: "USD" },
  });

  const accounts = summary?.accounts || [];
  const totalBalance = summary?.totalBalance || 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cash & Bank</h1>
          <p className="page-subtitle">{accounts.length} bank accounts</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} />
          New Account
        </button>
      </div>

      {/* Total */}
      {!isSummaryLoading && (
        <div className="card p-5 mb-6">
          <p className="text-sm text-slate-500 mb-1">Total Cash Position</p>
          <p className="text-3xl font-bold font-mono text-slate-900">{fmt(totalBalance)}</p>
        </div>
      )}

      {/* Accounts Grid */}
      {isSummaryLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {accounts.map((acc: any) => (
            <div key={acc.id} className="card p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAccount(acc)}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <CreditCard size={18} className="text-blue-600" />
                </div>
                <span className="text-xs font-mono text-slate-400">{acc.currency}</span>
              </div>
              <p className="font-semibold text-slate-900 text-sm">{acc.name}</p>
              {acc.bankName && <p className="text-xs text-slate-500 mt-0.5">{acc.bankName}</p>}
              <p className="text-2xl font-bold font-mono text-slate-900 mt-3">{fmt(Number(acc.balance))}</p>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="col-span-3 text-center py-16 text-slate-400">
              No bank accounts yet. Create your first one.
            </div>
          )}
        </div>
      )}

      {/* Transaction Panel */}
      {selectedAccount && (
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">{selectedAccount.name} — Transactions</h3>
            <button onClick={() => setSelectedAccount(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          {isTxnsLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-blue-600" size={24} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(txnData?.data || []).map((t: any) => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2 text-sm text-slate-600">{format(new Date(t.date), "dd MMM yyyy")}</td>
                      <td className="px-4 py-2 text-sm text-slate-800">{t.description}</td>
                      <td className="px-4 py-2 text-sm text-slate-500">{t.reference || "—"}</td>
                      <td className="px-4 py-2 text-sm text-right font-mono">{Number(t.debit) > 0 ? fmt(Number(t.debit)) : "—"}</td>
                      <td className="px-4 py-2 text-sm text-right font-mono">{Number(t.credit) > 0 ? fmt(Number(t.credit)) : "—"}</td>
                      <td className="px-4 py-2 text-sm text-right font-mono font-medium">{fmt(Number(t.balance))}</td>
                    </tr>
                  ))}
                  {(txnData?.data || []).length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">No transactions yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Account Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New Bank Account</h2>
              <button onClick={() => { setShowCreate(false); reset(); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => createAccount(d))} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Code *</label>
                  <input {...register("code")} className="input-base" placeholder="BANK-001" />
                  {errors.code && <p className="form-error">{errors.code.message}</p>}
                </div>
                <div>
                  <label className="form-label">Name *</label>
                  <input {...register("name")} className="input-base" placeholder="Main Checking" />
                  {errors.name && <p className="form-error">{errors.name.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Bank Name</label>
                  <input {...register("bankName")} className="input-base" placeholder="Chase Bank" />
                </div>
                <div>
                  <label className="form-label">Account Number</label>
                  <input {...register("accountNumber")} className="input-base" placeholder="****1234" />
                </div>
              </div>
              <div>
                <label className="form-label">Currency</label>
                <select {...register("currency")} className="input-base">
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="SAR">SAR</option>
                  <option value="AED">AED</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); reset(); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={isCreating} className="btn-primary flex-1">
                  {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
