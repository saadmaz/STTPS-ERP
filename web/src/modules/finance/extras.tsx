"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Play, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, ErrorState, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";

const money = (n: number) => formatMoney(n, "LKR");
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;
const todayIso = () => new Date().toISOString().slice(0, 10);

function Range({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <div className="flex gap-2 items-center">
      <input type="date" className="input-base py-1" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
      <input type="date" className="input-base py-1" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
    </div>
  );
}

interface TaxReport {
  lines: { taxCode: string; rate: number; outputNet: number; outputTax: number; inputNet: number; inputTax: number }[];
  outputTax: number;
  inputTax: number;
  netPayable: number;
}

export function TaxReportPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayIso);
  const q = useQuery({ queryKey: ["finance-tax", from, to], queryFn: () => api.get("/finance/reports/tax", { params: { from, to } }).then((r) => r.data as TaxReport) });
  const download = async () => {
    try {
      const res = await api.get("/finance/reports/tax.csv", { params: { from, to }, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tax-return-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Tax return" subtitle="Output tax on sales against input tax on purchases and expenses, from posted documents." actions={<><Range from={from} to={to} setFrom={setFrom} setTo={setTo} /><button className="btn-secondary" onClick={download}><Download size={15} /> CSV</button></>} />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message={errorMessage(q.error)} /> : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Tax</th><th className="text-right">Sales (net)</th><th className="text-right">Output tax</th><th className="text-right">Purchases (net)</th><th className="text-right">Input tax</th></tr></thead>
            <tbody>
              {q.data!.lines.map((l) => (
                <tr key={`${l.taxCode}-${l.rate}`}>
                  <td>{l.taxCode} {l.rate ? `${l.rate / 100}%` : ""}</td>
                  <td className="text-right">{money(l.outputNet)}</td><td className="text-right">{money(l.outputTax)}</td>
                  <td className="text-right">{money(l.inputNet)}</td><td className="text-right">{money(l.inputTax)}</td>
                </tr>
              ))}
              <tr className="font-semibold"><td>Total</td><td /><td className="text-right">{money(q.data!.outputTax)}</td><td /><td className="text-right">{money(q.data!.inputTax)}</td></tr>
              <tr className="font-semibold"><td colSpan={4}>{q.data!.netPayable >= 0 ? "Net tax payable" : "Net tax refundable"}</td><td className="text-right">{money(Math.abs(q.data!.netPayable))}</td></tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

interface CashFlow {
  opening: number;
  operating: { lines: Record<string, number>; total: number };
  investing: { lines: Record<string, number>; total: number };
  financing: { lines: Record<string, number>; total: number };
  netChange: number;
  closing: number;
}

export function CashFlowPage() {
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(todayIso);
  const q = useQuery({ queryKey: ["finance-cashflow", from, to], queryFn: () => api.get("/finance/reports/cash-flow", { params: { from, to } }).then((r) => r.data as CashFlow) });
  const section = (title: string, s: CashFlow["operating"]) => (
    <section className="card overflow-x-auto">
      <h2 className="px-4 pt-4 font-semibold">{title}</h2>
      <table className="table-base">
        <tbody>
          {Object.entries(s.lines).map(([k, v]) => <tr key={k}><td>{k}</td><td className="text-right">{money(v)}</td></tr>)}
          <tr className="font-semibold"><td>Net cash from {title.toLowerCase()}</td><td className="text-right">{money(s.total)}</td></tr>
        </tbody>
      </table>
    </section>
  );
  return (
    <div className="space-y-6">
      <PageHeader title="Cash flow" subtitle="Movements on bank and cash accounts, classed by the other side of each journal." actions={<Range from={from} to={to} setFrom={setFrom} setTo={setTo} />} />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message={errorMessage(q.error)} /> : (
        <div className="space-y-6 max-w-3xl">
          <div className="card p-4 flex justify-between"><span>Opening cash</span><span>{money(q.data!.opening)}</span></div>
          {section("Operating activities", q.data!.operating)}
          {section("Investing activities", q.data!.investing)}
          {section("Financing activities", q.data!.financing)}
          <div className="card p-4 flex justify-between font-semibold"><span>Closing cash ({q.data!.netChange >= 0 ? "+" : ""}{money(q.data!.netChange)})</span><span>{money(q.data!.closing)}</span></div>
        </div>
      )}
    </div>
  );
}

interface Ratios { currentRatio: number | null; quickRatio: number | null; grossMarginPct: number | null; netMarginPct: number | null; debtToEquity: number | null }

export function RatiosPage() {
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 7));
  const q = useQuery({ queryKey: ["finance-ratios", from, to], queryFn: () => api.get("/finance/reports/ratios", { params: { from, to } }).then((r) => r.data as Ratios) });
  const items: [string, number | null, string, string][] = q.data ? [
    ["Current ratio", q.data.currentRatio, "", "Current assets for each unit of current liabilities"],
    ["Quick ratio", q.data.quickRatio, "", "As above, without inventory"],
    ["Gross margin", q.data.grossMarginPct, "%", "Revenue less cost of sales"],
    ["Net margin", q.data.netMarginPct, "%", "Net profit on revenue"],
    ["Debt to equity", q.data.debtToEquity, "", "Liabilities for each unit of equity"],
  ] : [];
  return (
    <div className="space-y-6">
      <PageHeader title="Financial ratios" actions={<div className="flex gap-2"><input type="month" className="input-base py-1" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /><input type="month" className="input-base py-1" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" /></div>} />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message={errorMessage(q.error)} /> : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {items.map(([label, value, unit, hint]) => (
            <div key={label} className="stat-card"><p className="text-xl font-semibold">{value === null ? "—" : `${value}${unit}`}</p><p className="text-sm">{label}</p><p className="text-xs text-slate-500">{hint}</p></div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RevalueAction() {
  const can = useCan("finance.journal.edit");
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso);
  const run = useMutation({
    mutationFn: () => api.post("/finance/fx-revaluation", { date }).then((r) => r.data as { receivable: number; payable: number; details: unknown[] }),
    onSuccess: (r) => { setOpen(false); toast.success(r.details.length ? `Revalued ${r.details.length} document(s): receivables ${money(r.receivable)}, payables ${money(r.payable)}` : "Nothing to revalue"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}><RefreshCcw size={15} /> Revalue foreign balances</button>
      <ConfirmDialog open={open} title="Revalue open foreign-currency invoices and bills" body="Posts the unrealised exchange difference at this date and reverses it on the first day of the next month." confirmLabel="Revalue" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <Field label="At"><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  );
}

interface Recurring extends BaseRecord {
  code: string;
  name: string;
  frequency: string;
  nextRunDate: string;
  endDate: string | null;
  status: string;
  runs: number;
  lastJournalId: string | null;
}

function RunDue() {
  const can = useCan("finance.journal.edit");
  const run = useMutation({
    mutationFn: () => api.post("/finance/recurring/run-due", {}).then((r) => r.data as { posted: unknown[]; failed: { error: string }[] }),
    onSuccess: (r) => { if (r.failed.length) toast.error(r.failed.map((f) => f.error).join("; ")); toast.success(`${r.posted.length} journal(s) posted`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return <button className="btn-primary" onClick={() => run.mutate()} disabled={run.isPending}><Play size={15} /> Run due now</button>;
}

const recurring: MasterConfig<Recurring> = {
  entityType: "finance.recurringJournal",
  permission: "finance.journal",
  plural: "Recurring journals",
  singular: "Recurring journal",
  description: "Create a template with the API or from an existing journal; the schedule posts it on each due date when “Run due now” is used.",
  route: "/finance/recurring",
  client: crud<Recurring>("/finance/recurring"),
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "frequency", label: "Every", render: (r) => humanize(r.frequency) },
    { key: "nextRunDate", label: "Next", render: (r) => formatDate(r.nextRunDate) },
    { key: "runs", label: "Runs" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }] },
    { key: "endDate", label: "End date", type: "date" },
  ],
  title: (r) => `${r.code} ${r.name}`,
  subtitle: (r) => `${humanize(r.frequency)} · next ${formatDate(r.nextRunDate)}`,
  status: (r) => r.status,
  editable: (r) => r.status !== "ended",
  actions: () => <RunDue />,
};

export const EXTRA_SCREENS: Record<string, MasterConfig<never>> = { recurring: recurring as unknown as MasterConfig<never> };
