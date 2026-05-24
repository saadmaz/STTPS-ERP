"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fsmApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, FileText } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format, isPast } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "badge-green",
  EXPIRED: "badge-red",
  CANCELLED: "badge-red",
  DRAFT: "badge-gray",
};

const CONTRACT_TYPES: Record<string, string> = {
  TIME_AND_MATERIAL: "T&M",
  FIXED_PRICE: "Fixed",
  SLA: "SLA",
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function ServiceContractsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["service-contracts", activeCompany?.id, statusFilter],
    queryFn: () => fsmApi.contracts.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      customerId: "", number: "", name: "", description: "",
      contractType: "TIME_AND_MATERIAL", startDate: "", endDate: "",
      value: "", slaHours: "", notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => fsmApi.contracts.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-contracts"] });
      toast.success("Contract created");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create contract"),
  });

  const onSubmit = (values: any) => {
    createMutation.mutate({
      ...values,
      value: values.value ? Number(values.value) : undefined,
      slaHours: values.slaHours ? Number(values.slaHours) : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const contracts = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Service Contracts</h1>
          <p className="page-subtitle">{data?.total ?? 0} contracts</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New Contract
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Service Contract</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Contract Number</label>
                <input className="input-base" {...register("number", { required: true })} placeholder="SVC-2024-001" />
                {errors.number && <p className="form-error">Required</p>}
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Contract Name</label>
                <input className="input-base" {...register("name", { required: true })} placeholder="Annual Maintenance Agreement" />
                {errors.name && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Type</label>
                <select className="input-base" {...register("contractType")}>
                  {Object.keys(CONTRACT_TYPES).map((t) => (
                    <option key={t} value={t}>{CONTRACT_TYPES[t]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Customer ID</label>
                <input className="input-base" {...register("customerId", { required: true })} placeholder="Customer ID" />
                {errors.customerId && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Start Date</label>
                <input className="input-base" type="date" {...register("startDate", { required: true })} />
                {errors.startDate && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">End Date</label>
                <input className="input-base" type="date" {...register("endDate", { required: true })} />
                {errors.endDate && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">SLA Response (hours)</label>
                <input className="input-base" type="number" {...register("slaHours")} placeholder="e.g. 4, 8, 24" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Contract Value</label>
                <input className="input-base" type="number" step="0.01" {...register("value")} />
              </div>
              <div>
                <label className="form-label">Notes</label>
                <input className="input-base" {...register("notes")} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Contract"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {["", "ACTIVE", "EXPIRED", "CANCELLED"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}>
            {s || "All"}
          </button>
        ))}
      </div>

      {contracts.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <FileText size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No service contracts yet.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Number</th>
                <th>Name</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Period</th>
                <th>SLA</th>
                <th>Value</th>
                <th>Orders</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c: any) => {
                const expired = isPast(new Date(c.endDate)) && c.status === "ACTIVE";
                return (
                  <tr key={c.id}>
                    <td className="font-mono text-sm">{c.number}</td>
                    <td>
                      <p className="font-medium text-slate-800">{c.name}</p>
                      {c.description && <p className="text-xs text-slate-400 truncate max-w-xs">{c.description}</p>}
                    </td>
                    <td className="text-sm">{c.customer?.name ?? "—"}</td>
                    <td><span className="badge badge-gray">{CONTRACT_TYPES[c.contractType] ?? c.contractType}</span></td>
                    <td className="text-xs text-slate-500">
                      {format(new Date(c.startDate), "MMM d, yyyy")} →{" "}
                      <span className={expired ? "text-red-600 font-semibold" : ""}>
                        {format(new Date(c.endDate), "MMM d, yyyy")}
                      </span>
                    </td>
                    <td className="text-sm">{c.slaHours ? `${c.slaHours}h` : "—"}</td>
                    <td className="font-mono text-sm">{c.value ? `$${fmt(Number(c.value))}` : "—"}</td>
                    <td className="text-center text-sm">{c._count?.serviceOrders ?? 0}</td>
                    <td>
                      <span className={clsx("badge", expired ? "badge-red" : (STATUS_COLORS[c.status] ?? "badge-gray"))}>
                        {expired ? "EXPIRED" : c.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
