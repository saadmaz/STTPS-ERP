"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fsmApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, Users } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "badge-green",
  ON_SITE: "badge-blue",
  UNAVAILABLE: "badge-gray",
};

export default function TechniciansPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: technicians, isLoading } = useQuery({
    queryKey: ["fsm-technicians", activeCompany?.id],
    queryFn: () => fsmApi.technicians.list(),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      code: "", name: "", email: "", phone: "",
      skills: "", employeeId: "",
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fsmApi.technicians.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fsm-technicians"] }); toast.success("Status updated"); },
    onError: () => toast.error("Failed to update status"),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => fsmApi.technicians.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fsm-technicians"] });
      toast.success("Technician created");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create technician"),
  });

  const onSubmit = (values: any) => {
    createMutation.mutate({
      ...values,
      skills: values.skills ? values.skills.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
      employeeId: values.employeeId || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const techList = technicians ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Technicians</h1>
          <p className="page-subtitle">{techList.length} technicians</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Add Technician
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Technician</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Code</label>
                <input className="input-base" {...register("code", { required: true })} placeholder="TECH-001" />
                {errors.code && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Full Name</label>
                <input className="input-base" {...register("name", { required: true })} />
                {errors.name && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Email</label>
                <input className="input-base" type="email" {...register("email", { required: true })} />
                {errors.email && <p className="form-error">Required</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Phone</label>
                <input className="input-base" {...register("phone")} />
              </div>
              <div>
                <label className="form-label">Skills (comma-separated)</label>
                <input className="input-base" {...register("skills")} placeholder="HVAC, Electrical, Plumbing" />
              </div>
              <div>
                <label className="form-label">Employee ID (optional)</label>
                <input className="input-base" {...register("employeeId")} placeholder="Link to HR employee" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Technician"}
              </button>
            </div>
          </form>
        </div>
      )}

      {techList.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <Users size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No technicians yet. Add your first technician.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {techList.map((t: any) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{t.code}</p>
                </div>
                <span className={clsx("badge", STATUS_COLORS[t.status] ?? "badge-gray")}>{t.status}</span>
              </div>
              <p className="text-xs text-slate-500 mb-1">{t.email}</p>
              {t.phone && <p className="text-xs text-slate-500 mb-2">{t.phone}</p>}
              {t.skills?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {t.skills.map((s: string) => (
                    <span key={s} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{s}</span>
                  ))}
                </div>
              )}
              <div className="flex gap-1 pt-2 border-t border-slate-100">
                {["AVAILABLE", "ON_SITE", "UNAVAILABLE"].map((s) => (
                  <button
                    key={s}
                    onClick={() => statusMutation.mutate({ id: t.id, status: s })}
                    disabled={t.status === s || statusMutation.isPending}
                    className={clsx("text-xs px-2 py-1 rounded font-medium transition-colors",
                      t.status === s
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                    )}
                  >
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">{t._count?.serviceOrders ?? 0} orders assigned</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
