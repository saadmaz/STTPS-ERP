"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, ErrorState, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { employeeOptions, useEmployeeName } from "./config";

export interface StatutoryRate extends BaseRecord { code: string; rate: number; effectiveFrom: string; effectiveTo: string | null; notes: string | null; }
export interface ApitBracket extends BaseRecord { effectiveFrom: string; effectiveTo: string | null; lowerBound: number; rate: number; subtractAmount: number; notes: string | null; }
export interface SalaryComponent extends BaseRecord { code: string; name: string; type: "earning" | "deduction"; category: string; calculationType: "fixed" | "percentage_of_basic"; isTaxable: boolean; notes: string | null; }
export interface SalaryStructure extends BaseRecord { employeeId: string; effectiveFrom: string; currency: string; basicSalary: number; lines: { componentId: string; amount: number }[]; notes: string | null; }
export interface Loan extends BaseRecord { employeeId: string; type: "loan" | "advance"; principal: number; installmentAmount: number; remainingBalance: number; grantedOn: string; status: "active" | "completed" | "cancelled"; notes: string | null; }
export interface PayrollRun extends BaseRecord {
  period: string; payDate: string | null; status: "draft" | "calculated" | "approved" | "locked" | "cancelled"; employeeCount: number;
  totalGross: number; totalDeductions: number; totalNet: number; totalEmployerCost: number; notes: string | null;
}
export interface Payslip {
  id: string; employeeId: string; period: string; currency: string; earnings: { label: string; amount: number }[]; deductions: { label: string; amount: number }[];
  grossPay: number; netPay: number; totalDeductions: number; overtimeMinutes: number; status: "ok" | "error"; statusReason: string | null;
}

export const payrollApi = {
  statutoryRates: crud<StatutoryRate>("/hr/statutory-rates"),
  apitBrackets: crud<ApitBracket>("/hr/apit-brackets"),
  components: crud<SalaryComponent>("/hr/salary-components"),
  structures: crud<SalaryStructure>("/hr/salary-structures"),
  loans: crud<Loan>("/hr/loans"),
  runs: crud<PayrollRun>("/hr/payroll-runs"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
  payslipsForRun: (runId: string) => api.get(`/hr/payroll-runs/${runId}/payslips`).then((r) => r.data as Payslip[]),
  bankFile: (runId: string) => api.get(`/hr/payroll-runs/${runId}/bank-file`).then((r) => r.data as { csv: string }),
  myPayslips: () => api.get("/hr/self-service/me/payslips").then((r) => r.data as Payslip[]),
};

export const componentOptions = { queryKey: ["options", "hr.salaryComponents"], load: async () => (await payrollApi.components.list({ limit: 200 })).items.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })) };
const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

function EmployeeLink({ id }: { id: string }) {
  const name = useEmployeeName();
  return <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/hr/employees/${id}`}>{name(id)}</Link>;
}
function useComponentName() {
  const { data } = useQuery({ queryKey: ["options", "hr.salaryComponents-raw"], queryFn: () => payrollApi.components.list({ limit: 200 }) });
  return (id: string) => data?.items.find((c) => c.id === id)?.name ?? "…";
}
function ComponentAmount({ id, amount }: { id: string; amount: number }) {
  const name = useComponentName();
  return <>{name(id)}: {(amount / 100).toFixed(2)}</>;
}

// ─── Admin: statutory configuration ─────────────────────────────────────────

export const statutoryRates: MasterConfig<StatutoryRate> = {
  entityType: "hr.statutoryRate", permission: "hr.statutoryRate", plural: "Statutory rates", singular: "Statutory rate",
  description: "Effective-dated EPF and ETF rates. Hundredths of a percent — 800 means 8%.",
  route: "/hr/statutory-rates", client: payrollApi.statutoryRates, defaultSort: "-effectiveFrom",
  columns: [
    { key: "code", label: "Code", render: (r) => humanize(r.code) },
    { key: "rate", label: "Rate", render: (r) => `${(r.rate / 100).toFixed(2)}%` },
    { key: "effectiveFrom", label: "From", render: (r) => formatDate(r.effectiveFrom) },
  ],
  fields: [
    { key: "code", label: "Code", type: "select", options: [{ value: "epf_employee", label: "EPF (employee)" }, { value: "epf_employer", label: "EPF (employer)" }, { value: "etf_employer", label: "ETF (employer)" }], required: true, createOnly: true },
    { key: "rate", label: "Rate (hundredths of a percent, 800 = 8%)", type: "number", required: true },
    { key: "effectiveFrom", label: "Effective from", type: "date", required: true },
    { key: "effectiveTo", label: "Effective to", type: "date" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => humanize(r.code), subtitle: (r) => `${(r.rate / 100).toFixed(2)}%`,
};

export const apitBrackets: MasterConfig<ApitBracket> = {
  entityType: "hr.apitBracket", permission: "hr.apitBracket", plural: "APIT brackets", singular: "APIT bracket",
  description: "The APIT table in \"tax = income x rate - subtract\" form. Enter the current Inland Revenue figures before running real payroll — these are not pre-filled with official rates.",
  route: "/hr/apit-brackets", client: payrollApi.apitBrackets, defaultSort: "-effectiveFrom",
  columns: [
    { key: "lowerBound", label: "From", render: (r) => formatMoney(r.lowerBound, "LKR") },
    { key: "rate", label: "Rate", render: (r) => `${(r.rate / 100).toFixed(2)}%` },
    { key: "subtractAmount", label: "Subtract", render: (r) => formatMoney(r.subtractAmount, "LKR") },
  ],
  fields: [
    { key: "effectiveFrom", label: "Effective from", type: "date", required: true },
    { key: "effectiveTo", label: "Effective to", type: "date" },
    { key: "lowerBound", label: "From (monthly taxable income)", type: "text", placeholder: "100000.00", required: true },
    { key: "rate", label: "Rate (hundredths of a percent)", type: "number", required: true },
    { key: "subtractAmount", label: "Subtract amount", type: "text", placeholder: "18000.00", required: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => `From ${formatMoney(r.lowerBound, "LKR")}`, subtitle: (r) => `${(r.rate / 100).toFixed(2)}%`,
};

export const salaryComponents: MasterConfig<SalaryComponent> = {
  entityType: "hr.salaryComponent", permission: "hr.salaryComponent", plural: "Salary components", singular: "Salary component",
  description: "An earning or deduction line a salary structure can use.",
  route: "/hr/salary-components", client: payrollApi.components, defaultSort: "code",
  columns: [
    { key: "code", label: "Code" }, { key: "name", label: "Name" },
    { key: "type", label: "Type", render: (r) => humanize(r.type) }, { key: "category", label: "Category", render: (r) => humanize(r.category) },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true }, { key: "name", label: "Name", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: opts(["earning", "deduction"]), required: true },
    { key: "category", label: "Category", type: "select", options: opts(["basic", "allowance", "bonus", "commission", "incentive", "other_earning", "other_deduction"]), required: true },
    { key: "calculationType", label: "Calculation", type: "select", options: [{ value: "fixed", label: "Fixed amount" }, { value: "percentage_of_basic", label: "Percentage of basic" }] },
    { key: "isTaxable", label: "Taxable (earnings only)", type: "boolean" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => r.name, subtitle: (r) => r.code,
};

export const salaryStructures: MasterConfig<SalaryStructure> = {
  entityType: "hr.salaryStructure", permission: "hr.salaryStructure", plural: "Salary structures", singular: "Salary structure",
  description: "One employee's pay, effective from a date. The most recent one on or before a payroll run's period is used.",
  route: "/hr/salary-structures", client: payrollApi.structures, defaultSort: "-effectiveFrom",
  columns: [
    { key: "employeeId", label: "Employee", render: (r) => <EmployeeLink id={r.employeeId} /> },
    { key: "effectiveFrom", label: "From", render: (r) => formatDate(r.effectiveFrom) },
    { key: "basicSalary", label: "Basic", render: (r) => formatMoney(r.basicSalary, r.currency) },
  ],
  fields: [
    { key: "employeeId", label: "Employee", type: "reference", reference: employeeOptions, required: true, createOnly: true },
    { key: "effectiveFrom", label: "Effective from", type: "date", required: true, createOnly: true },
    { key: "currency", label: "Currency", type: "text", placeholder: "LKR" },
    { key: "basicSalary", label: "Basic salary", type: "text", placeholder: "100000.00", required: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => `From ${formatDate(r.effectiveFrom)}`, subtitle: (r) => formatMoney(r.basicSalary, r.currency),
  details: (r) => [
    { label: "Employee", value: <EmployeeLink id={r.employeeId} /> },
    ...r.lines.map((l, i) => ({ label: `Line ${i + 1}`, value: <ComponentAmount id={l.componentId} amount={l.amount} /> })),
  ],
};

function CancelLoan({ loan, refresh }: { loan: Loan; refresh: (l: Loan) => void }) {
  const can = useCan("hr.loan.edit");
  const [open, setOpen] = useState(false);
  const run = useMutation({
    mutationFn: () => payrollApi.post<Loan>(`/hr/loans/${loan.id}/cancel`),
    onSuccess: (updated) => { setOpen(false); toast.success("Cancelled"); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || loan.status !== "active") return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>Cancel</button>
      <ConfirmDialog open={open} title="Cancel this loan?" body="No further installments will be deducted from payroll." confirmLabel="Cancel" danger busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)} />
    </>
  );
}

export const loans: MasterConfig<Loan> = {
  entityType: "hr.loan", permission: "hr.loan", plural: "Loans and advances", singular: "Loan or advance",
  description: "Granting one posts the disbursement to the general ledger; payroll recovers the installment each run until it's paid off.",
  route: "/hr/loans", client: payrollApi.loans, defaultSort: "-grantedOn",
  columns: [
    { key: "employeeId", label: "Employee", render: (r) => <EmployeeLink id={r.employeeId} /> },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "remainingBalance", label: "Remaining", render: (r) => formatMoney(r.remainingBalance, "LKR") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { key: "employeeId", label: "Employee", type: "reference", reference: employeeOptions, required: true, createOnly: true },
    { key: "type", label: "Type", type: "select", options: opts(["loan", "advance"]), required: true, createOnly: true },
    { key: "principal", label: "Principal", type: "text", placeholder: "50000.00", required: true, createOnly: true },
    { key: "installmentAmount", label: "Installment per run", type: "text", placeholder: "10000.00", required: true, createOnly: true },
    { key: "grantedOn", label: "Granted on", type: "date", required: true, createOnly: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => humanize(r.type), subtitle: (r) => formatMoney(r.principal, "LKR"), status: (r) => r.status,
  editable: () => false,
  actions: (r, refresh) => <CancelLoan loan={r} refresh={refresh} />,
  details: (r) => [{ label: "Employee", value: <EmployeeLink id={r.employeeId} /> }, { label: "Principal", value: formatMoney(r.principal, "LKR") }, { label: "Installment", value: formatMoney(r.installmentAmount, "LKR") }],
};

// ─── Admin: payroll runs ─────────────────────────────────────────────────────

function RunAction({ run, action, label, refresh }: { run: PayrollRun; action: "calculate" | "approve" | "lock" | "cancel"; label: string; refresh: (r: PayrollRun) => void }) {
  const can = useCan("hr.payrollRun.edit");
  const run_ = useMutation({
    mutationFn: () => payrollApi.post<PayrollRun>(`/hr/payroll-runs/${run.id}/${action}`, {}),
    onSuccess: (updated) => { toast.success(label); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return <button className={action === "cancel" ? "btn-ghost" : "btn-primary"} disabled={run_.isPending} onClick={() => run_.mutate()}>{run_.isPending && <Spinner size={14} />} {label}</button>;
}

function DownloadBankFile({ runId }: { runId: string }) {
  const run = useMutation({
    mutationFn: () => payrollApi.bankFile(runId),
    onSuccess: (r) => {
      const blob = new Blob([r.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `payroll-${runId}.csv`; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return <button className="btn-ghost" disabled={run.isPending} onClick={() => run.mutate()}>Download bank file</button>;
}

function PayrollRunExtra({ r }: { r: PayrollRun }) {
  const [current, setCurrent] = useState(r);
  const empName = useEmployeeName();
  const q = useQuery({ queryKey: ["hr-payslips", current.id], queryFn: () => payrollApi.payslipsForRun(current.id) });
  return (
    <div className="space-y-6">
      <section className="card p-4 flex flex-wrap gap-2">
        {current.status === "draft" && <RunAction run={current} action="calculate" label="Calculate" refresh={setCurrent} />}
        {current.status === "calculated" && <RunAction run={current} action="calculate" label="Recalculate" refresh={setCurrent} />}
        {current.status === "calculated" && <RunAction run={current} action="approve" label="Approve" refresh={setCurrent} />}
        {current.status === "approved" && <RunAction run={current} action="lock" label="Lock (posts to GL)" refresh={setCurrent} />}
        {(current.status === "draft" || current.status === "calculated" || current.status === "approved") && <RunAction run={current} action="cancel" label="Cancel" refresh={setCurrent} />}
        {current.status === "locked" && <DownloadBankFile runId={current.id} />}
      </section>
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Payslips</h2>
        {q.isLoading ? <Spinner /> : (
          <table className="table-base">
            <thead><tr><th>Employee</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status</th></tr></thead>
            <tbody>
              {q.data?.map((p) => (
                <tr key={p.id}>
                  <td>{empName(p.employeeId)}</td><td>{formatMoney(p.grossPay, p.currency)}</td><td>{formatMoney(p.totalDeductions, p.currency)}</td>
                  <td className="font-medium">{formatMoney(p.netPay, p.currency)}</td><td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
              {q.data?.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-6">Not calculated yet.</td></tr>}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export const payrollRuns: MasterConfig<PayrollRun> = {
  entityType: "hr.payrollRun", permission: "hr.payrollRun", plural: "Payroll runs", singular: "Payroll run",
  description: "One pay period: calculate every employee's payslip, approve, then lock to post the journal and release the bank file.",
  route: "/hr/payroll-runs", client: payrollApi.runs, defaultSort: "-period",
  columns: [
    { key: "period", label: "Period" },
    { key: "employeeCount", label: "Employees" },
    { key: "totalNet", label: "Net pay", render: (r) => formatMoney(r.totalNet, "LKR") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { key: "period", label: "Period (YYYY-MM)", type: "text", placeholder: "2026-12", required: true, createOnly: true },
    { key: "payDate", label: "Pay date", type: "date" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => r.period, subtitle: (r) => `${r.employeeCount} employee(s)`, status: (r) => r.status,
  editable: (r) => r.status !== "locked" && r.status !== "cancelled",
  details: (r) => [
    { label: "Gross", value: formatMoney(r.totalGross, "LKR") },
    { label: "Deductions", value: formatMoney(r.totalDeductions, "LKR") },
    { label: "Net", value: formatMoney(r.totalNet, "LKR") },
    { label: "Employer cost", value: formatMoney(r.totalEmployerCost, "LKR") },
  ],
  extra: (r) => <PayrollRunExtra r={r} />,
};

export const PAYROLL_SCREENS: Record<string, MasterConfig<never>> = {
  "statutory-rates": statutoryRates as unknown as MasterConfig<never>,
  "apit-brackets": apitBrackets as unknown as MasterConfig<never>,
  "salary-components": salaryComponents as unknown as MasterConfig<never>,
  "salary-structures": salaryStructures as unknown as MasterConfig<never>,
  loans: loans as unknown as MasterConfig<never>,
  "payroll-runs": payrollRuns as unknown as MasterConfig<never>,
};

// ─── Self-service: My Payslips ──────────────────────────────────────────────

function PayslipDetail({ p }: { p: Payslip }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>View</button>
      <ConfirmDialog open={open} title={`Payslip — ${p.period}`} confirmLabel="Close" onConfirm={() => setOpen(false)} onClose={() => setOpen(false)}>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium mb-1">Earnings</p>
            {p.earnings.map((e, i) => <div key={i} className="flex justify-between"><span>{e.label}</span><span>{formatMoney(e.amount, p.currency)}</span></div>)}
          </div>
          <div>
            <p className="font-medium mb-1">Deductions</p>
            {p.deductions.map((d, i) => <div key={i} className="flex justify-between"><span>{d.label}</span><span>{formatMoney(d.amount, p.currency)}</span></div>)}
          </div>
          <div className="flex justify-between font-semibold border-t border-slate-200 dark:border-slate-800 pt-2"><span>Net pay</span><span>{formatMoney(p.netPay, p.currency)}</span></div>
        </div>
      </ConfirmDialog>
    </>
  );
}

export function MyPayslipsPage() {
  const q = useQuery({ queryKey: ["hr-my-payslips"], queryFn: payrollApi.myPayslips });
  return (
    <div className="space-y-6">
      <PageHeader title="My Payslips" />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message="Could not load your payslips. Make sure you have an employee record linked to your account." /> : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Period</th><th>Gross</th><th>Net</th><th /></tr></thead>
            <tbody>
              {q.data!.map((p) => <tr key={p.id}><td>{p.period}</td><td>{formatMoney(p.grossPay, p.currency)}</td><td className="font-medium">{formatMoney(p.netPay, p.currency)}</td><td><PayslipDetail p={p} /></td></tr>)}
              {q.data!.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-6">No payslips yet.</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
