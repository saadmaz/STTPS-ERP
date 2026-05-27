"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, CheckCircle, XCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "badge-yellow",
  APPROVED: "badge-green",
  REJECTED: "badge-red",
  CANCELLED: "badge-gray",
};

export default function LeavePage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("PENDING");

  const { data, isLoading } = useQuery({
    queryKey: ["leave-requests", activeCompany?.id, statusFilter],
    queryFn: () => hrApi.leave.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { data: leaveTypes } = useQuery({
    queryKey: ["leave-types", activeCompany?.id],
    queryFn: () => hrApi.leaveTypes.list(),
    enabled: !!activeCompany,
  });

  const { data: employees } = useQuery({
    queryKey: ["employees-select", activeCompany?.id],
    queryFn: () => hrApi.employees.list({ status: "ACTIVE", limit: 200 }),
    enabled: !!activeCompany,
  });

  const requestForm = useForm({
    defaultValues: {
      employeeId: "",
      leaveTypeId: "",
      startDate: "",
      endDate: "",
      days: 1,
      reason: "",
    },
  });

  const typeForm = useForm({
    defaultValues: { code: "", name: "", daysPerYear: 20, isPaid: true, carryForward: false },
  });

  const createRequestMutation = useMutation({
    mutationFn: (data: any) => hrApi.leave.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success("Leave request created");
      requestForm.reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create leave request"),
  });

  const createTypeMutation = useMutation({
    mutationFn: (data: any) => hrApi.leaveTypes.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-types"] });
      toast.success("Leave type created");
      typeForm.reset();
      setShowTypeForm(false);
    },
    onError: () => toast.error("Failed to create leave type"),
  });

  const processMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      hrApi.leave.process(id, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success("Leave request updated");
    },
    onError: () => toast.error("Failed to process request"),
  });

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  const requests = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave Management</h1>
          <p className="page-subtitle">{data?.total ?? 0} requests</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" onClick={() => setShowTypeForm(!showTypeForm)}>
            Leave Types
          </button>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} /> New Request
          </button>
        </div>
      </div>

      {/* Leave Type Form */}
      {showTypeForm && (
        <div className="card p-5 mb-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">New Leave Type</h2>
          <form onSubmit={typeForm.handleSubmit((v) => createTypeMutation.mutate({ ...v, daysPerYear: Number(v.daysPerYear) }))} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="form-label">Code</label>
                <input className="input-base" {...typeForm.register("code", { required: true })} placeholder="ANNUAL" />
              </div>
              <div>
                <label className="form-label">Name</label>
                <input className="input-base" {...typeForm.register("name", { required: true })} placeholder="Annual Leave" />
              </div>
              <div>
                <label className="form-label">Days/Year</label>
                <input className="input-base" type="number" {...typeForm.register("daysPerYear")} />
              </div>
              <div className="flex items-end gap-4 pb-1">
                <label className="flex items-center gap-1 text-sm text-slate-700">
                  <input type="checkbox" {...typeForm.register("isPaid")} /> Paid
                </label>
                <label className="flex items-center gap-1 text-sm text-slate-700">
                  <input type="checkbox" {...typeForm.register("carryForward")} /> Carry Forward
                </label>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => setShowTypeForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createTypeMutation.isPending}>
                {createTypeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create"}
              </button>
            </div>
          </form>
          {(leaveTypes ?? []).length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 mb-2">Existing Leave Types</p>
              <div className="flex flex-wrap gap-2">
                {(leaveTypes ?? []).map((lt: any) => (
                  <span key={lt.id} className="badge badge-blue">{lt.name} ({lt.daysPerYear} days)</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Leave Request Form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Leave Request</h2>
          <form onSubmit={requestForm.handleSubmit((v) => createRequestMutation.mutate({ ...v, days: Number(v.days) }))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Employee</label>
                <select className="input-base" {...requestForm.register("employeeId", { required: true })}>
                  <option value="">Select Employee</option>
                  {(employees?.data ?? []).map((e: any) => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeNumber})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Leave Type</label>
                <select className="input-base" {...requestForm.register("leaveTypeId", { required: true })}>
                  <option value="">Select Type</option>
                  {(leaveTypes ?? []).map((lt: any) => (
                    <option key={lt.id} value={lt.id}>{lt.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Days</label>
                <input className="input-base" type="number" step="0.5" {...requestForm.register("days")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Start Date</label>
                <input className="input-base" type="date" {...requestForm.register("startDate", { required: true })} />
              </div>
              <div>
                <label className="form-label">End Date</label>
                <input className="input-base" type="date" {...requestForm.register("endDate", { required: true })} />
              </div>
            </div>
            <div>
              <label className="form-label">Reason</label>
              <input className="input-base" {...requestForm.register("reason")} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { requestForm.reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createRequestMutation.isPending}>
                {createRequestMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Submit Request"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {["", "PENDING", "APPROVED", "REJECTED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors", statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">No leave requests found.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req: any) => (
                <tr key={req.id}>
                  <td>
                    <p className="font-medium text-slate-800">{req.employee.firstName} {req.employee.lastName}</p>
                    <p className="text-xs text-slate-400">{req.employee.employeeNumber}</p>
                  </td>
                  <td>
                    <span>{req.leaveType.name}</span>
                    {!req.leaveType.isPaid && <span className="ml-1 text-xs text-slate-400">(unpaid)</span>}
                  </td>
                  <td className="text-xs">
                    {format(new Date(req.startDate), "MMM d")} – {format(new Date(req.endDate), "MMM d, yyyy")}
                  </td>
                  <td>{req.days}</td>
                  <td className="text-slate-500 text-xs max-w-xs truncate">{req.reason || "—"}</td>
                  <td>
                    <span className={clsx("badge", STATUS_COLORS[req.status] ?? "badge-gray")}>{req.status}</span>
                  </td>
                  <td>
                    {req.status === "PENDING" && (
                      <div className="flex gap-1">
                        <button
                          className="text-emerald-600 hover:text-emerald-800"
                          onClick={() => processMutation.mutate({ id: req.id, action: "APPROVE" })}
                          disabled={processMutation.isPending}
                          title="Approve"
                        >
                          <CheckCircle size={16} />
                        </button>
                        <button
                          className="text-red-500 hover:text-red-700"
                          onClick={() => processMutation.mutate({ id: req.id, action: "REJECT" })}
                          disabled={processMutation.isPending}
                          title="Reject"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

