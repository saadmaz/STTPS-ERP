"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, Users } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "badge-green",
  ON_LEAVE: "badge-yellow",
  TERMINATED: "badge-red",
};

const EMP_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
};

export default function EmployeesPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const { data: depts } = useQuery({
    queryKey: ["hr-departments", activeCompany?.id],
    queryFn: () => hrApi.departments.list(),
    enabled: !!activeCompany,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["employees", activeCompany?.id, statusFilter],
    queryFn: () => hrApi.employees.list({ status: statusFilter || undefined }),
    enabled: !!activeCompany,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      employeeNumber: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      departmentId: "",
      positionId: "",
      employmentType: "FULL_TIME",
      hireDate: new Date().toISOString().split("T")[0],
      salary: "",
      payFrequency: "MONTHLY",
      nationality: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => hrApi.employees.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee created");
      reset();
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create employee"),
  });

  const onSubmit = (values: any) => {
    createMutation.mutate({
      ...values,
      salary: values.salary ? Number(values.salary) : undefined,
      departmentId: values.departmentId || undefined,
      positionId: values.positionId || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const employees = data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">{data?.total ?? 0} employees</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input-base text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On Leave</option>
            <option value="TERMINATED">Terminated</option>
          </select>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} /> New Employee
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Employee</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Employee #</label>
                <input className="input-base" {...register("employeeNumber", { required: true })} placeholder="EMP-001" />
                {errors.employeeNumber && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">First Name</label>
                <input className="input-base" {...register("firstName", { required: true })} />
                {errors.firstName && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Last Name</label>
                <input className="input-base" {...register("lastName", { required: true })} />
                {errors.lastName && <p className="form-error">Required</p>}
              </div>
              <div>
                <label className="form-label">Email</label>
                <input className="input-base" type="email" {...register("email", { required: true })} />
                {errors.email && <p className="form-error">Required</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Phone</label>
                <input className="input-base" {...register("phone")} />
              </div>
              <div>
                <label className="form-label">Department</label>
                <select className="input-base" {...register("departmentId")}>
                  <option value="">— None —</option>
                  {(depts ?? []).map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Employment Type</label>
                <select className="input-base" {...register("employmentType")}>
                  {Object.entries(EMP_TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Hire Date</label>
                <input className="input-base" type="date" {...register("hireDate", { required: true })} />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Annual Salary</label>
                <input className="input-base" type="number" step="100" {...register("salary")} placeholder="0.00" />
              </div>
              <div>
                <label className="form-label">Pay Frequency</label>
                <select className="input-base" {...register("payFrequency")}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="BIWEEKLY">Bi-weekly</option>
                  <option value="WEEKLY">Weekly</option>
                </select>
              </div>
              <div>
                <label className="form-label">Nationality (tax)</label>
                <input className="input-base" {...register("nationality")} placeholder="US, GB, DE..." />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Employee"}
              </button>
            </div>
          </form>
        </div>
      )}

      {employees.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <Users size={32} className="mx-auto mb-3 text-slate-300" />
          <p>No employees yet. Add your first employee.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Department</th>
                <th>Position</th>
                <th>Type</th>
                <th>Hire Date</th>
                <th>Salary</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp: any) => (
                <tr key={emp.id}>
                  <td className="font-mono text-xs text-slate-500">{emp.employeeNumber}</td>
                  <td>
                    <div>
                      <p className="font-medium text-slate-800">{emp.firstName} {emp.lastName}</p>
                      <p className="text-xs text-slate-400">{emp.email}</p>
                    </div>
                  </td>
                  <td>{emp.department?.name ?? "—"}</td>
                  <td>{emp.position?.title ?? "—"}</td>
                  <td>{EMP_TYPE_LABELS[emp.employmentType] ?? emp.employmentType}</td>
                  <td>{format(new Date(emp.hireDate), "MMM d, yyyy")}</td>
                  <td className="font-mono text-sm">
                    {emp.salary ? `$${Number(emp.salary).toLocaleString()}` : "—"}
                  </td>
                  <td>
                    <span className={clsx("badge", STATUS_COLORS[emp.status] ?? "badge-gray")}>
                      {emp.status}
                    </span>
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
