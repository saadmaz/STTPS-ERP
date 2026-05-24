"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, X, Building2 } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function AccountsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["crm-accounts", activeCompany?.id, search],
    queryFn: () => crmApi.accounts.list({ search: search || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const create = useMutation({
    mutationFn: (d: FormData) => crmApi.accounts.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-accounts"] });
      toast.success("Account created");
      setShowForm(false);
      reset();
    },
    onError: () => toast.error("Failed to create account"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">Manage company accounts</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> New Account
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          className="input-base max-w-xs"
          placeholder="Search accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">New Account</h2>
            <button onClick={() => { setShowForm(false); reset(); }} className="btn-ghost"><X size={16} /></button>
          </div>
          <form onSubmit={handleSubmit((d) => create.mutate(d))} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="form-label">Account Name *</label>
              <input className="input-base" {...register("name")} />
              {errors.name && <p className="form-error">Required</p>}
            </div>
            <div>
              <label className="form-label">Industry</label>
              <input className="input-base" {...register("industry")} />
            </div>
            <div>
              <label className="form-label">Website</label>
              <input className="input-base" {...register("website")} />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input className="input-base" {...register("phone")} />
            </div>
            <div>
              <label className="form-label">Email</label>
              <input className="input-base" type="email" {...register("email")} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="form-label">Notes</label>
              <textarea className="input-base" rows={2} {...register("notes")} />
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex gap-3">
              <button type="submit" className="btn-primary" disabled={create.isPending}>
                {create.isPending && <Loader2 size={14} className="animate-spin" />} Save
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); reset(); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </div>
        ) : (data?.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Building2 size={40} className="mb-3" />
            <p className="text-sm">No accounts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Industry</th>
                  <th>Website</th>
                  <th>Phone</th>
                  <th className="text-right">Contacts</th>
                  <th className="text-right">Opportunities</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((acc: any) => (
                  <tr key={acc.id}>
                    <td className="font-medium text-slate-900">{acc.name}</td>
                    <td className="text-slate-600">{acc.industry ?? "—"}</td>
                    <td className="text-slate-500 text-xs">{acc.website ?? "—"}</td>
                    <td className="text-slate-600">{acc.phone ?? "—"}</td>
                    <td className="text-right text-sm">{acc._count?.contacts ?? 0}</td>
                    <td className="text-right text-sm">{acc._count?.opportunities ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
