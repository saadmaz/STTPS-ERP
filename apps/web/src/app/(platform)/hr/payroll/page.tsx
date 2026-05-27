"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "badge-gray",
  APPROVED: "badge-green",
  POSTED: "badge-blue",
  CANCELLED: "badge-red",
};

const LINE_TYPE_COLORS: Record<string, string> = {
  EARNING: "text-emerald-700",
  DEDUCTION: "text-red-600",
  TAX: "text-orange-600",
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PayrollPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: runs, isLoading } = useQuery({
    queryKey: ["payroll-runs", activeCompany?.id],
    queryFn: () => hrApi.payroll.list(),
    enabled: !!activeCompany,
  });

  const { data: expandedRun, isLoading: runLoading } = useQuery({
    queryKey: ["payroll-run", expandedId],
    queryFn: () => hrApi.payroll.get(expandedId!),
    enabled: !!expandedId,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      reference: "",
      periodStart: "",
      periodEnd: "",
      payDate: "",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => hrApi.payroll.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll run created and computed");
      reset();
      setShowForm(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? "Failed to run payroll"),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => hrApi.payroll.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      if (expandedId) qc.invalidateQueries({ queryKey: ["payroll-run", expandedId] });
      toast.success("Payroll approved");
    },
    onError: () => toast.error("Failed to approve payroll"),
  });

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  const runList = runs ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-subtitle">Gross-to-net payroll processing</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Run Payroll
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">New Payroll Run</h2>
          <p className="text-xs text-slate-500 mb-4">
            Calculates gross pay, income tax, and social security for all active employees with a salary. Tax rates are applied per employee nationality (US 22%, GB 20%, DE 19%, AU 19%, AE 0%, others 15%).
          </p>
          <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Reference</label>
                <input className="input-base" {...register("reference", { required: true })} placeholder="PR-2024-01" />
                {errors.reference && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Period Start</label>
                <input className="input-base" type="date" {...register("periodStart", { required: true })} />
              </div>
              <div>
                <label className="form-label">Period End</label>
                <input className="input-base" type="date" {...register("periodEnd", { required: true })} />
              </div>
              <div>
                <label className="form-label">Pay Date</label>
                <input className="input-base" type="date" {...register("payDate", { required: true })} />
              </div>
            </div>
            <div>
              <label className="form-label">Notes</label>
              <input className="input-base" {...register("notes")} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Computing...</> : "Run Payroll"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {runList.length === 0 ? (
          <div className="card p-12 text-center text-slate-400">No payroll runs yet. Run your first payroll.</div>
        ) : (
          runList.map((run: any) => (
            <div key={run.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button className="text-slate-400 hover:text-slate-600" onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}>
                    {expandedId === run.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <div>
                    <p className="font-medium text-slate-800">{run.reference}</p>
                    <p className="text-xs text-slate-500">
                      {format(new Date(run.periodStart), "MMM d")} – {format(new Date(run.periodEnd), "MMM d, yyyy")}
                      {" · "}Pay date: {format(new Date(run.payDate), "MMM d, yyyy")}
                      {" · "}{run._count?.payslips ?? 0} employees
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800">${fmt(Number(run.totalNet))} net</p>
                    <p className="text-xs text-slate-400">${fmt(Number(run.totalGross))} gross · ${fmt(Number(run.totalTax))} tax</p>
                  </div>
                  <span className={clsx("badge", STATUS_COLORS[run.status] ?? "badge-gray")}>{run.status}</span>
                  {run.status === "DRAFT" && (
                    <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => approveMutation.mutate(run.id)} disabled={approveMutation.isPending}>
                      <CheckCircle size={12} /> Approve
                    </button>
                  )}
                </div>
              </div>

              {expandedId === run.id && (
                <div className="mt-4 ml-6">
                  {runLoading ? (
                    <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                      <Loader2 size={14} className="animate-spin" /> Loading payslips...
                    </div>
                  ) : expandedRun?.payslips?.length > 0 ? (
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Gross Pay</th>
                          <th>Tax</th>
                          <th>Deductions</th>
                          <th>Net Pay</th>
                          <th>Breakdown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expandedRun.payslips.map((slip: any) => (
                          <tr key={slip.id}>
                            <td>
                              <p className="text-sm font-medium">{slip.employee.firstName} {slip.employee.lastName}</p>
                              <p className="text-xs text-slate-400">{slip.employee.employeeNumber}</p>
                            </td>
                            <td className="font-mono text-sm">${fmt(Number(slip.grossPay))}</td>
                            <td className="font-mono text-sm text-orange-600">${fmt(Number(slip.taxAmount))}</td>
                            <td className="font-mono text-sm text-red-600">${fmt(Number(slip.totalDeductions))}</td>
                            <td className="font-mono text-sm font-bold text-emerald-700">${fmt(Number(slip.netPay))}</td>
                            <td>
                              <div className="space-y-0.5">
                                {slip.lines.map((l: any) => (
                                  <p key={l.id} className={clsx("text-xs", LINE_TYPE_COLORS[l.type] ?? "text-slate-500")}>
                                    {l.description}: ${fmt(Math.abs(Number(l.amount)))}
                                  </p>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-slate-400 py-2">No payslips in this run.</p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

