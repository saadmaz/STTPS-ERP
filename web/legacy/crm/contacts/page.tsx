"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, X, Users } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function ContactsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["crm-contacts", activeCompany?.id, search],
    queryFn: () => crmApi.contacts.list({ search: search || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const create = useMutation({
    mutationFn: (d: FormData) => crmApi.contacts.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contacts"] });
      toast.success("Contact created");
      setShowForm(false);
      reset();
    },
    onError: () => toast.error("Failed to create contact"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">Manage individual contacts</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> New Contact
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          className="input-base max-w-xs"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">New Contact</h2>
            <button onClick={() => { setShowForm(false); reset(); }} className="btn-ghost"><X size={16} /></button>
          </div>
          <form onSubmit={handleSubmit((d) => create.mutate(d))} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="form-label">First Name *</label>
              <input className="input-base" {...register("firstName")} />
              {errors.firstName && <p className="form-error">Required</p>}
            </div>
            <div>
              <label className="form-label">Last Name *</label>
              <input className="input-base" {...register("lastName")} />
              {errors.lastName && <p className="form-error">Required</p>}
            </div>
            <div>
              <label className="form-label">Title</label>
              <input className="input-base" {...register("title")} />
            </div>
            <div>
              <label className="form-label">Email</label>
              <input className="input-base" type="email" {...register("email")} />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input className="input-base" {...register("phone")} />
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
            <Users size={40} className="mb-3" />
            <p className="text-sm">No contacts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Title</th>
                  <th>Account</th>
                  <th>Email</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((c: any) => (
                  <tr key={c.id}>
                    <td className="font-medium text-slate-900">{c.firstName} {c.lastName}</td>
                    <td className="text-slate-600">{c.title ?? "—"}</td>
                    <td className="text-slate-600">{c.account?.name ?? "—"}</td>
                    <td className="text-slate-500 text-xs">{c.email ?? "—"}</td>
                    <td className="text-slate-600">{c.phone ?? "—"}</td>
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
