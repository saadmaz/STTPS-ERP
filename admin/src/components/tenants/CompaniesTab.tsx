"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { companiesApi, type Company } from "@/lib/api";
import { Plus, Building2, Users, Loader2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(1, "Required"),
  code: z.string().min(1, "Required").toUpperCase(),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  currency: z.string().default("USD"),
  timezone: z.string().default("UTC"),
});
type FormValues = z.infer<typeof schema>;

export function CompaniesTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["admin-companies", tenantId],
    queryFn: () => companiesApi.list(tenantId),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currency: "USD", timezone: "UTC" },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await companiesApi.create(tenantId, data);
      toast.success("Company created");
      qc.invalidateQueries({ queryKey: ["admin-companies", tenantId] });
      qc.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
      reset();
      setShowAdd(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Failed to create company");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900">Companies ({companies.length})</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> Add Company
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">Loading...</div>
      ) : companies.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">No companies yet</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {companies.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.code} · {c.currency}</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-slate-500">
                {c.legalName && <p>Legal: {c.legalName}</p>}
                {c.taxId && <p>Tax ID: {c.taxId}</p>}
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {c._count?.companyUsers ?? 0} users
                </div>
                <p>Created {formatDate(c.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Company Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Add Company</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Name *</label>
                  <input {...register("name")} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Code *</label>
                  <input {...register("code")} placeholder="MAIN" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase" />
                  {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Currency</label>
                  <select {...register("currency")} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                    {["USD","EUR","GBP","AED","SAR","PKR","INR"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Legal Name</label>
                  <input {...register("legalName")} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tax ID</label>
                  <input {...register("taxId")} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
                  {isSubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating...</> : "Add Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
