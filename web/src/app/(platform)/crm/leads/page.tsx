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
  company: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  CONTACTED: "bg-amber-100 text-amber-700",
  QUALIFIED: "bg-emerald-100 text-emerald-700",
  UNQUALIFIED: "bg-slate-100 text-slate-600",
  CONVERTED: "bg-violet-100 text-violet-700",
};

export default function LeadsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["crm-leads", activeCompany?.id, statusFilter, search],
    queryFn: () => crmApi.leads.list({ status: statusFilter || undefined, search: search || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const create = useMutation({
    mutationFn: (d: FormData) => crmApi.leads.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      toast.success("Lead created");
      setShowForm(false);
      reset();
    },
    onError: () => toast.error("Failed to create lead"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">Track and manage sales leads</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> New Lead
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          className="input-base max-w-xs"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input-base max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">New Lead</h2>
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
              <label className="form-label">Email</label>
              <input className="input-base" type="email" {...register("email")} />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input className="input-base" {...register("phone")} />
            </div>
            <div>
              <label className="form-label">Company</label>
              <input className="input-base" {...register("company")} />
            </div>
            <div>
              <label className="form-label">Title</label>
              <input className="input-base" {...register("title")} />
            </div>
            <div>
              <label className="form-label">Source</label>
              <select className="input-base" {...register("source")}>
                <option value="">Select</option>
                {["WEB", "REFERRAL", "COLD_CALL", "EMAIL", "SOCIAL", "EVENT", "OTHER"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Status</label>
              <select className="input-base" {...register("status")}>
                <option value="NEW">NEW</option>
                <option value="CONTACTED">CONTACTED</option>
                <option value="QUALIFIED">QUALIFIED</option>
                <option value="UNQUALIFIED">UNQUALIFIED</option>
              </select>
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="form-label">Notes</label>
              <textarea className="input-base" rows={2} {...register("notes")} />
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex gap-3">
              <button type="submit" className="btn-primary" disabled={create.isPending}>
                {create.isPending && <Loader2 size={14} className="animate-spin" />} Save Lead
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
            <p className="text-sm">No leads found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Source</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((lead: any) => (
                  <tr key={lead.id}>
                    <td className="font-medium text-slate-900">{lead.firstName} {lead.lastName}</td>
                    <td className="text-slate-600">{lead.company ?? "—"}</td>
                    <td className="text-slate-600">{lead.email ?? "—"}</td>
                    <td className="text-slate-600">{lead.phone ?? "—"}</td>
                    <td className="text-slate-500 text-xs">{lead.source ?? "—"}</td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[lead.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {lead.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(data?.pages ?? 0) > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            Page {data?.page} of {data?.pages} — {data?.total} total
          </div>
        )}
      </div>
    </div>
  );
}
