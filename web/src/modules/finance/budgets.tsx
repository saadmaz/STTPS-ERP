"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, GitBranch, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { orgApi } from "@/modules/org/config";
import { Action } from "@/modules/sales/config";
import { useAccounts } from "./config";

export interface Budget extends BaseRecord {
  code: string;
  name: string;
  fiscalYearId: string;
  dimension: "company" | "department" | "branch" | "costCentre" | "project";
  dimensionId: string | null;
  revision: number;
  previousId: string | null;
  control: "none" | "warn" | "block";
  lines: { accountId: string; amounts: number[] }[];
  total: number;
  status: string;
  notes: string | null;
}

interface VsActual {
  periods: string[];
  lines: { accountId: string; code: string; name: string; budget: number[]; actual: number[]; totalBudget: number; totalActual: number; variance: number; usedPct: number | null }[];
  totalBudget: number;
  totalActual: number;
}

const budgetsApi = crud<Budget>("/finance/budgets");
const money = (n: number) => formatMoney(n, "LKR");
const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

function ReviseBudget({ b }: { b: Budget }) {
  const router = useRouter();
  const can = useCan("finance.budget.create");
  const run = useMutation({ mutationFn: () => api.post(`/finance/budgets/${b.id}/revise`).then((r) => r.data as Budget), onSuccess: (r) => router.push(`/finance/budgets/${r.id}`), onError: (e) => toast.error(errorMessage(e)) });
  if (!can) return null;
  return <button className="btn-ghost" onClick={() => run.mutate()} disabled={run.isPending}><GitBranch size={15} /> Revise</button>;
}

function VsActualTable({ b }: { b: Budget }) {
  const [monthly, setMonthly] = useState(false);
  const q = useQuery({ queryKey: ["finance-budget-vs", b.id, b.version], queryFn: () => api.get(`/finance/budgets/${b.id}/vs-actual`).then((r) => r.data as VsActual) });
  if (q.isLoading) return <Spinner />;
  if (!q.data) return null;
  const v = q.data;
  return (
    <section className="card overflow-x-auto">
      <div className="flex justify-between items-center px-4 pt-4">
        <h2 className="font-semibold">Budget vs actual</h2>
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} /> By period</label>
      </div>
      <table className="table-base">
        <thead>
          <tr>
            <th>Account</th>
            {monthly ? v.periods.map((p) => <th key={p} className="text-right">{p}</th>) : <><th className="text-right">Budget</th><th className="text-right">Actual</th><th className="text-right">Remaining</th><th className="text-right">Used</th></>}
          </tr>
        </thead>
        <tbody>
          {v.lines.map((l) => (
            <tr key={l.accountId}>
              <td>{l.code} {l.name}</td>
              {monthly
                ? l.budget.map((amt, i) => <td key={i} className="text-right text-xs"><div>{money(l.actual[i] ?? 0)}</div><div className="text-slate-500">of {money(amt)}</div></td>)
                : <>
                    <td className="text-right">{money(l.totalBudget)}</td><td className="text-right">{money(l.totalActual)}</td>
                    <td className={`text-right ${l.variance < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{money(l.variance)}</td>
                    <td className="text-right">{l.usedPct === null ? "—" : `${l.usedPct}%`}</td>
                  </>}
            </tr>
          ))}
          {!monthly && <tr className="font-semibold"><td>Total</td><td className="text-right">{money(v.totalBudget)}</td><td className="text-right">{money(v.totalActual)}</td><td className="text-right">{money(v.totalBudget - v.totalActual)}</td><td /></tr>}
        </tbody>
      </table>
    </section>
  );
}

const budgets: MasterConfig<Budget> = {
  entityType: "finance.budget",
  permission: "finance.budget",
  plural: "Budgets",
  singular: "Budget",
  route: "/finance/budgets",
  client: budgetsApi,
  defaultSort: "code",
  createHref: "/finance/new/budget",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "dimension", label: "For", render: (r) => humanize(r.dimension) },
    { key: "revision", label: "Revision" },
    { key: "control", label: "Control", render: (r) => humanize(r.control) },
    { key: "total", label: "Total", render: (r) => money(r.total), text: (r) => String(r.total / 100) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "pending_approval", "approved", "superseded", "rejected"]) }],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "control", label: "Control", type: "select", options: opts(["none", "warn", "block"]), hint: "Warn flags over-budget requisitions to approvers; block refuses them" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => `${r.code} ${r.name}`,
  subtitle: (r) => `Revision ${r.revision} · ${humanize(r.dimension)} · ${money(r.total)}`,
  status: (r) => r.status,
  editable: (r) => ["draft", "rejected"].includes(r.status),
  actions: (r, refresh) => (
    <>
      {["draft", "rejected"].includes(r.status) && <Action<Budget> label="Submit" icon={CheckCircle2} path={`/finance/budgets/${r.id}/submit`} permission="finance.budget.edit" onDone={refresh} />}
      {r.status === "approved" && <ReviseBudget b={r} />}
    </>
  ),
  details: (r) => [
    { label: "Control", value: humanize(r.control) },
    { label: "Revises", value: r.previousId ? <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/finance/budgets/${r.previousId}`}>Previous revision</Link> : null },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <VsActualTable b={r} />,
};

export const BUDGET_SCREENS: Record<string, MasterConfig<never>> = { budgets: budgets as unknown as MasterConfig<never> };

export function NewBudget() {
  const router = useRouter();
  const accounts = useAccounts().filter((a) => !a.isGroup && (a.type === "expense" || a.type === "income"));
  const years = useQuery({ queryKey: ["options", "org.fiscalYears"], queryFn: () => orgApi.fiscalYears.list({ limit: 50 }) });
  const departments = useQuery({ queryKey: ["options", "org.departments.raw"], queryFn: () => orgApi.departments.list({ limit: 200 }) });
  const branches = useQuery({ queryKey: ["options", "org.branches.raw"], queryFn: () => orgApi.branches.list({ limit: 200 }) });
  const costCentres = useQuery({ queryKey: ["options", "org.costCentres.raw"], queryFn: () => orgApi.costCentres.list({ limit: 200 }) });
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [fiscalYearId, setYear] = useState("");
  const [dimension, setDimension] = useState("company");
  const [dimensionId, setDimensionId] = useState("");
  const [control, setControl] = useState("none");
  const [lines, setLines] = useState([{ accountId: "", annual: "" }]);
  const choices = dimension === "department" ? departments.data?.items : dimension === "branch" ? branches.data?.items : dimension === "costCentre" ? costCentres.data?.items : [];
  const save = useMutation({
    mutationFn: () => budgetsApi.create({ code, name, fiscalYearId, dimension, dimensionId: dimension === "company" ? undefined : dimensionId, control, lines: lines.filter((l) => l.accountId && l.annual) }),
    onSuccess: (b) => { toast.success(`${b.code} saved as draft`); router.push(`/finance/budgets/${b.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (i: number, patch: Partial<{ accountId: string; annual: string }>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <form className="max-w-4xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title="New budget" subtitle="Annual amounts are spread evenly over the year's periods; adjust them per period later through the API if needed." />
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Code" required><input className="input-base" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <Field label="Name" required><input className="input-base" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Fiscal year" required>
          <select className="input-base" value={fiscalYearId} onChange={(e) => setYear(e.target.value)}>
            <option value="">Choose…</option>
            {(years.data?.items ?? []).map((y) => <option key={y.id} value={y.id}>{y.code}</option>)}
          </select>
        </Field>
        <Field label="For">
          <select className="input-base" value={dimension} onChange={(e) => { setDimension(e.target.value); setDimensionId(""); }}>
            {["company", "department", "branch", "costCentre"].map((d) => <option key={d} value={d}>{humanize(d)}</option>)}
          </select>
        </Field>
        {dimension !== "company" && (
          <Field label={humanize(dimension)} required>
            <select className="input-base" value={dimensionId} onChange={(e) => setDimensionId(e.target.value)}>
              <option value="">Choose…</option>
              {(choices ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Control">
          <select className="input-base" value={control} onChange={(e) => setControl(e.target.value)}>
            {["none", "warn", "block"].map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
          </select>
        </Field>
      </section>
      <section className="card p-5 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <select className="input-base col-span-12 sm:col-span-7" value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })} aria-label="Account">
              <option value="">Account…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
            <input className="input-base col-span-10 sm:col-span-4" placeholder="Annual amount" value={l.annual} onChange={(e) => set(i, { annual: e.target.value })} aria-label="Annual amount" />
            <button type="button" className="btn-ghost col-span-2 sm:col-span-1" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" className="btn-ghost text-blue-600" onClick={() => setLines([...lines, { accountId: "", annual: "" }])}><Plus size={14} /> Account</button>
      </section>
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href="/finance/budgets">Cancel</Link>
        <button className="btn-primary" disabled={!code || !name || !fiscalYearId || (dimension !== "company" && !dimensionId) || save.isPending}>Save draft</button>
      </div>
    </form>
  );
}
