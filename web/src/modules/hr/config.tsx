"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney, minorToDecimal } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { FieldDef } from "@/components/forms/SchemaForm";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";
import { orgApi } from "@/modules/org/config";

export interface Address {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}
export interface EmergencyContact {
  name: string;
  relationship: string | null;
  phone: string;
}
export interface BankDetails {
  bankName: string | null;
  branch: string | null;
  accountName: string | null;
  accountNumber: string | null;
}
export interface Compensation {
  salary: number;
  currency: string;
  payFrequency: string;
  effectiveDate: string;
}
export interface Qualification {
  title: string;
  institution: string | null;
  year: number | null;
}
export interface Certification {
  name: string;
  issuer: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
}
export interface EmploymentHistoryEntry {
  date: string;
  type: string;
  description: string;
  departmentId: string | null;
  positionId: string | null;
  managerId: string | null;
}

export interface Employee extends BaseRecord {
  employeeNumber: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  nationalId: string | null;
  address: Address | null;
  emergencyContact: EmergencyContact | null;
  branchId: string | null;
  departmentId: string | null;
  positionId: string | null;
  jobGradeId: string | null;
  managerId: string | null;
  employmentType: string;
  status: string;
  joiningDate: string;
  probationEndDate: string | null;
  contractType: string | null;
  contractEndDate: string | null;
  terminationDate: string | null;
  terminationReason: string | null;
  compensation: Compensation | null;
  bankDetails: BankDetails | null;
  qualifications: Qualification[];
  skills: string[];
  certifications: Certification[];
  employmentHistory: EmploymentHistoryEntry[];
  notes: string | null;
}
export interface Position extends BaseRecord {
  code: string;
  title: string;
  departmentId: string | null;
  jobGradeId: string | null;
  description: string | null;
  status: string;
}
export interface JobGrade extends BaseRecord {
  code: string;
  name: string;
  currency: string;
  minSalary: number | null;
  maxSalary: number | null;
  notes: string | null;
}

export interface OrgChartNode {
  id: string;
  name: string;
  employeeNumber: string;
  positionId: string | null;
  departmentId: string | null;
  status: string;
  reports: OrgChartNode[];
}

export const hrApi = {
  employees: crud<Employee>("/hr/employees"),
  positions: crud<Position>("/hr/positions"),
  jobGrades: crud<JobGrade>("/hr/job-grades"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export function useEmployeeName() {
  const { data } = useQuery({ queryKey: ["options", "hr.employees"], queryFn: () => hrApi.employees.list({ limit: 200 }) });
  return (id: string | null) => {
    if (!id) return "—";
    const e = data?.items.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : "…";
  };
}
export function useDepartmentName() {
  const { data } = useQuery({ queryKey: ["options", "departments"], queryFn: () => orgApi.departments.list({ limit: 200 }) });
  return (id: string | null) => (id ? data?.items.find((x) => x.id === id)?.name ?? "…" : "—");
}
export function usePositionName() {
  const { data } = useQuery({ queryKey: ["options", "hr.positions"], queryFn: () => hrApi.positions.list({ limit: 200 }) });
  return (id: string | null) => (id ? data?.items.find((x) => x.id === id)?.title ?? "…" : "—");
}
export function useJobGradeName() {
  const { data } = useQuery({ queryKey: ["options", "hr.jobGrades"], queryFn: () => hrApi.jobGrades.list({ limit: 200 }) });
  return (id: string | null) => (id ? data?.items.find((x) => x.id === id)?.name ?? "…" : "—");
}

const employeeOptions = { queryKey: ["options", "hr.employees"], load: async () => (await hrApi.employees.list({ limit: 200 })).items.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.employeeNumber})` })) };
const positionOptions = { queryKey: ["options", "hr.positions"], load: async () => (await hrApi.positions.list({ limit: 200, where: "status:active" })).items.map((p) => ({ value: p.id, label: `${p.code} · ${p.title}` })) };
const jobGradeOptions = { queryKey: ["options", "hr.jobGrades"], load: async () => (await hrApi.jobGrades.list({ limit: 200 })).items.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` })) };
const departmentOptions = { queryKey: ["options", "departments"], load: async () => (await orgApi.departments.list({ limit: 200, where: "isActive:true" })).items.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` })) };
const branchOptions = { queryKey: ["options", "branches"], load: async () => (await orgApi.branches.list({ limit: 200, where: "isActive:true" })).items.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` })) };

const employeeFields: FieldDef[] = [
  { key: "firstName", label: "First name", type: "text", required: true },
  { key: "lastName", label: "Last name", type: "text", required: true },
  { key: "preferredName", label: "Preferred name", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "gender", label: "Gender", type: "text" },
  { key: "maritalStatus", label: "Marital status", type: "text" },
  { key: "nationality", label: "Nationality", type: "text" },
  { key: "branchId", label: "Branch", type: "reference", reference: branchOptions },
  { key: "departmentId", label: "Department", type: "reference", reference: departmentOptions },
  { key: "positionId", label: "Position", type: "reference", reference: positionOptions },
  { key: "jobGradeId", label: "Job grade", type: "reference", reference: jobGradeOptions },
  { key: "managerId", label: "Manager", type: "reference", reference: employeeOptions },
  { key: "userId", label: "Linked user account", type: "user", hint: "So they can see their own record once self-service exists" },
  { key: "employmentType", label: "Employment type", type: "select", options: opts(["full_time", "part_time", "contract", "intern", "probation"]) },
  { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "on_leave", label: "On leave" }, { value: "suspended", label: "Suspended" }], hint: "Use Terminate / Reinstate to end or resume employment" },
  { key: "joiningDate", label: "Joining date", type: "date", required: true },
  { key: "probationEndDate", label: "Probation ends", type: "date" },
  { key: "contractType", label: "Contract type", type: "select", options: opts(["permanent", "fixed_term", "casual"]) },
  { key: "contractEndDate", label: "Contract end", type: "date" },
  { key: "notes", label: "Notes", type: "textarea", wide: true },
];

function ManagerLink({ id }: { id: string }) {
  const name = useEmployeeName();
  return <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/hr/employees/${id}`}>{name(id)}</Link>;
}

function Terminate({ emp, refresh }: { emp: Employee; refresh: (e: Employee) => void }) {
  const can = useCan("hr.employee.terminate");
  const [open, setOpen] = useState(false);
  const run = useMutation({
    mutationFn: (reason: string) => hrApi.post<Employee>(`/hr/employees/${emp.id}/terminate`, { reason }),
    onSuccess: (e) => { setOpen(false); toast.success("Terminated"); refresh(e); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><UserX size={15} /> Terminate</button>
      <ConfirmDialog
        open={open} title={`Terminate ${emp.firstName} ${emp.lastName}?`} confirmLabel="Terminate" danger reason="required" busy={run.isPending}
        onConfirm={(why) => run.mutate(why)} onClose={() => setOpen(false)}
      />
    </>
  );
}

function Reinstate({ emp, refresh }: { emp: Employee; refresh: (e: Employee) => void }) {
  const can = useCan("hr.employee.terminate");
  const run = useMutation({
    mutationFn: () => hrApi.post<Employee>(`/hr/employees/${emp.id}/reinstate`, {}),
    onSuccess: (e) => { toast.success("Reinstated"); refresh(e); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return <button className="btn-primary" onClick={() => run.mutate()} disabled={run.isPending}><UserCheck size={15} /> Reinstate</button>;
}

function EditCompensation({ emp, onSaved }: { emp: Employee; onSaved: (e: Employee) => void }) {
  const can = useCan("hr.employee.compensation");
  const [open, setOpen] = useState(false);
  const [salary, setSalary] = useState(() => minorToDecimal(emp.compensation?.salary ?? null, emp.compensation?.currency ?? "LKR"));
  const [currency, setCurrency] = useState(emp.compensation?.currency ?? "LKR");
  const [payFrequency, setPayFrequency] = useState(emp.compensation?.payFrequency ?? "monthly");
  const [nationalId, setNationalId] = useState(emp.nationalId ?? "");
  const [bankName, setBankName] = useState(emp.bankDetails?.bankName ?? "");
  const [branch, setBranch] = useState(emp.bankDetails?.branch ?? "");
  const [accountName, setAccountName] = useState(emp.bankDetails?.accountName ?? "");
  const [accountNumber, setAccountNumber] = useState(emp.bankDetails?.accountNumber ?? "");
  const save = useMutation({
    mutationFn: () => hrApi.employees.update(emp.id, {
      compensation: salary ? { salary, currency, payFrequency } : null,
      bankDetails: bankName || branch || accountName || accountNumber ? { bankName, branch, accountName, accountNumber } : null,
      nationalId: nationalId || null,
    }),
    onSuccess: (e) => { toast.success("Compensation saved"); setOpen(false); onSaved(e); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><Pencil size={15} /> Edit</button>
      <ConfirmDialog open={open} title="Compensation and banking" confirmLabel="Save" busy={save.isPending} onConfirm={() => save.mutate()} onClose={() => setOpen(false)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Salary"><input className="input-base" value={salary} onChange={(e) => setSalary(e.target.value)} /></Field>
          <Field label="Currency"><input className="input-base" value={currency} onChange={(e) => setCurrency(e.target.value)} /></Field>
          <Field label="Pay frequency">
            <select className="input-base" value={payFrequency} onChange={(e) => setPayFrequency(e.target.value)}>
              {["monthly", "biweekly", "weekly"].map((f) => <option key={f} value={f}>{humanize(f)}</option>)}
            </select>
          </Field>
          <Field label="National ID"><input className="input-base" value={nationalId} onChange={(e) => setNationalId(e.target.value)} /></Field>
          <Field label="Bank"><input className="input-base" value={bankName} onChange={(e) => setBankName(e.target.value)} /></Field>
          <Field label="Branch"><input className="input-base" value={branch} onChange={(e) => setBranch(e.target.value)} /></Field>
          <Field label="Account name"><input className="input-base" value={accountName} onChange={(e) => setAccountName(e.target.value)} /></Field>
          <Field label="Account number"><input className="input-base" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function EmployeeExtra({ emp }: { emp: Employee }) {
  const can = useCan("hr.employee.compensation");
  const [current, setCurrent] = useState(emp);
  const depName = useDepartmentName();
  const posName = usePositionName();
  const mgrName = useEmployeeName();
  return (
    <div className="space-y-6">
      <section className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Compensation & banking</h2>
          <EditCompensation emp={current} onSaved={setCurrent} />
        </div>
        {can ? (
          current.compensation || current.bankDetails || current.nationalId ? (
            <dl className="text-sm space-y-1">
              {current.compensation && <div className="flex justify-between"><dt>Salary</dt><dd>{formatMoney(current.compensation.salary, current.compensation.currency)} / {humanize(current.compensation.payFrequency)}</dd></div>}
              {current.nationalId && <div className="flex justify-between"><dt>National ID</dt><dd>{current.nationalId}</dd></div>}
              {current.bankDetails && <div className="flex justify-between"><dt>Bank</dt><dd>{[current.bankDetails.bankName, current.bankDetails.branch].filter(Boolean).join(" · ") || "—"}</dd></div>}
              {current.bankDetails?.accountNumber && <div className="flex justify-between"><dt>Account</dt><dd>{current.bankDetails.accountName ? `${current.bankDetails.accountName} · ` : ""}{current.bankDetails.accountNumber}</dd></div>}
            </dl>
          ) : <p className="text-sm text-slate-500 dark:text-slate-400">Not set.</p>
        ) : <p className="text-sm text-slate-500 dark:text-slate-400">Hidden: needs the compensation permission.</p>}
      </section>
      {current.qualifications.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold mb-2">Qualifications</h2>
          <ul className="text-sm space-y-1">
            {current.qualifications.map((q, i) => <li key={i}>{q.title}{q.institution ? ` · ${q.institution}` : ""}{q.year ? ` · ${q.year}` : ""}</li>)}
          </ul>
        </section>
      )}
      {current.certifications.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold mb-2">Certifications</h2>
          <ul className="text-sm space-y-1">
            {current.certifications.map((c, i) => (
              <li key={i}>{c.name}{c.issuer ? ` · ${c.issuer}` : ""}{c.expiryDate ? ` · expires ${formatDate(c.expiryDate)}` : ""}</li>
            ))}
          </ul>
        </section>
      )}
      {current.skills.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold mb-2">Skills</h2>
          <p className="text-sm">{current.skills.join(", ")}</p>
        </section>
      )}
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Employment history</h2>
        <table className="table-base">
          <thead><tr><th>Date</th><th>Event</th><th>Department</th><th>Position</th><th>Manager</th></tr></thead>
          <tbody>
            {current.employmentHistory.map((h, i) => (
              <tr key={i}>
                <td>{formatDate(h.date)}</td><td>{humanize(h.type)} — {h.description}</td>
                <td>{depName(h.departmentId)}</td><td>{posName(h.positionId)}</td><td>{mgrName(h.managerId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export const employees: MasterConfig<Employee> = {
  entityType: "hr.employee",
  permission: "hr.employee",
  plural: "Employees",
  singular: "Employee",
  description: "Full record and profile for each employee. Salary, bank details and national ID need the compensation permission.",
  route: "/hr/employees",
  client: hrApi.employees,
  defaultSort: "employeeNumber",
  columns: [
    { key: "employeeNumber", label: "ID" },
    { key: "name", label: "Name", render: (r) => `${r.firstName} ${r.lastName}`, text: (r) => `${r.firstName} ${r.lastName}` },
    { key: "employmentType", label: "Type", render: (r) => humanize(r.employmentType) },
    { key: "joiningDate", label: "Joined", render: (r) => r.joiningDate },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(["active", "on_leave", "suspended", "terminated"]) },
    { key: "employmentType", label: "Type", options: opts(["full_time", "part_time", "contract", "intern", "probation"]) },
  ],
  fields: employeeFields,
  defaults: { employmentType: "full_time", status: "active" },
  title: (r) => `${r.firstName} ${r.lastName}`,
  subtitle: (r) => `${r.employeeNumber} · ${humanize(r.employmentType)}`,
  status: (r) => r.status,
  editable: (r) => r.status !== "terminated",
  actions: (r, refresh) => (
    <>
      {r.status !== "terminated" && <Terminate emp={r} refresh={refresh} />}
      {r.status === "terminated" && <Reinstate emp={r} refresh={refresh} />}
    </>
  ),
  details: (r) => [
    { label: "Email", value: r.email },
    { label: "Phone", value: r.phone },
    { label: "Date of birth", value: r.dateOfBirth ? formatDate(r.dateOfBirth) : null },
    { label: "Emergency contact", value: r.emergencyContact ? `${r.emergencyContact.name} (${r.emergencyContact.phone})` : null },
    { label: "Manager", value: r.managerId ? <ManagerLink id={r.managerId} /> : null },
    { label: "Probation ends", value: r.probationEndDate ? formatDate(r.probationEndDate) : null },
    { label: "Contract", value: r.contractType ? `${humanize(r.contractType)}${r.contractEndDate ? ` until ${formatDate(r.contractEndDate)}` : ""}` : null },
    { label: "Terminated", value: r.terminationDate ? `${formatDate(r.terminationDate)} — ${r.terminationReason}` : null },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <EmployeeExtra emp={r} />,
};

export const positions: MasterConfig<Position> = {
  entityType: "hr.position",
  permission: "hr.position",
  plural: "Positions",
  singular: "Position",
  description: "Roles in the org chart, independent of who currently holds them.",
  route: "/hr/positions",
  client: hrApi.positions,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["active", "inactive"]) }],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "title", label: "Title", type: "text", required: true },
    { key: "departmentId", label: "Department", type: "reference", reference: departmentOptions },
    { key: "jobGradeId", label: "Job grade", type: "reference", reference: jobGradeOptions },
    { key: "status", label: "Status", type: "select", options: opts(["active", "inactive"]) },
    { key: "description", label: "Description", type: "textarea", wide: true },
  ],
  defaults: { status: "active" },
  title: (r) => r.title,
  subtitle: (r) => r.code,
  status: (r) => r.status,
};

export const jobGrades: MasterConfig<JobGrade> = {
  entityType: "hr.jobGrade",
  permission: "hr.jobGrade",
  plural: "Job grades",
  singular: "Job grade",
  description: "Salary bands positions are graded against.",
  route: "/hr/job-grades",
  client: hrApi.jobGrades,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "currency", label: "Currency" },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "currency", label: "Currency", type: "text", placeholder: "LKR" },
    { key: "minSalary", label: "Minimum salary", type: "text", placeholder: "0.00" },
    { key: "maxSalary", label: "Maximum salary", type: "text", placeholder: "0.00" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  toForm: (r) => ({ code: r.code, name: r.name, currency: r.currency, minSalary: minorToDecimal(r.minSalary, r.currency), maxSalary: minorToDecimal(r.maxSalary, r.currency), notes: r.notes ?? "" }),
  title: (r) => r.name,
  subtitle: (r) => r.code,
};

export const HR_SCREENS: Record<string, MasterConfig<never>> = {
  employees: employees as unknown as MasterConfig<never>,
  positions: positions as unknown as MasterConfig<never>,
  "job-grades": jobGrades as unknown as MasterConfig<never>,
};
