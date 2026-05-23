"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { arApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Search, Loader2, X, Eye } from "lucide-react";
import Link from "next/link";

const customerSchema = z.object({
  code: z.string().min(1, "Code required"),
  name: z.string().min(1, "Name required"),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  currency: z.string().default("USD"),
  paymentTerms: z.coerce.number().int().min(0).default(30),
  creditLimit: z.coerce.number().min(0).optional(),
});

type CustomerForm = z.infer<typeof customerSchema>;

export default function CustomersPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data: customerData, isLoading } = useQuery({
    queryKey: ["ar-customers", activeCompany?.id, page, search],
    queryFn: () => arApi.customers.list({ page, limit: 25, search }),
    enabled: !!activeCompany,
  });

  const { mutate: createCustomer, isPending: isCreating } = useMutation({
    mutationFn: (data: CustomerForm) => arApi.customers.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ar-customers"] });
      toast.success("Customer created");
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed to create customer"),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: { currency: "USD", paymentTerms: 30 },
  });

  const customers = customerData?.data || [];
  const total = customerData?.total || 0;
  const pages = customerData?.pages || 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">{total} customers</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/finance/ar" className="btn-secondary">AR Invoices</Link>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={16} />
            New Customer
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex items-center gap-3 p-3">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Currency</th>
                    <th>Payment Terms</th>
                    <th>Credit Limit</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c: any) => (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3"><span className="font-mono text-sm text-slate-600">{c.code}</span></td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.email || "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.phone || "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.currency}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.paymentTerms} days</td>
                      <td className="px-4 py-3 text-sm text-slate-600 font-mono">{c.creditLimit ? Number(c.creditLimit).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}</td>
                      <td className="px-4 py-3">
                        <Link href={`/finance/ar/customers/${c.id}`} className="btn-ghost px-2 py-1" title="View"><Eye size={14} /></Link>
                      </td>
                    </tr>
                  ))}
                  {customers.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-slate-400">No customers found.</td></tr>}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-sm text-slate-500">Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}</p>
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary px-3 py-1 text-xs">Previous</button>
                  <span className="text-sm">{page} / {pages}</span>
                  <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-secondary px-3 py-1 text-xs">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New Customer</h2>
              <button onClick={() => { setShowCreate(false); reset(); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => createCustomer(d))} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Code *</label>
                  <input {...register("code")} className="input-base" placeholder="CUST-001" />
                  {errors.code && <p className="form-error">{errors.code.message}</p>}
                </div>
                <div>
                  <label className="form-label">Name *</label>
                  <input {...register("name")} className="input-base" placeholder="Customer name" />
                  {errors.name && <p className="form-error">{errors.name.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Email</label>
                  <input {...register("email")} type="email" className="input-base" placeholder="ar@customer.com" />
                  {errors.email && <p className="form-error">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input {...register("phone")} className="input-base" placeholder="+1 234 567 8900" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
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
                <div>
                  <label className="form-label">Payment Terms (days)</label>
                  <input {...register("paymentTerms")} type="number" min="0" className="input-base" placeholder="30" />
                </div>
                <div>
                  <label className="form-label">Credit Limit</label>
                  <input {...register("creditLimit")} type="number" min="0" step="0.01" className="input-base" placeholder="0.00" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); reset(); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={isCreating} className="btn-primary flex-1">
                  {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
