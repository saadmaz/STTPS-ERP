"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, Plus, RotateCw, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { EmptyState, ErrorState, Field, PageHeader, Spinner } from "@/components/ui/kit";
import { Account, FINANCE_SCREENS as CORE_SCREENS, financeApi, Journal, useAccountName, useAccounts } from "./config";
import { AR_SCREENS, NewArDocument } from "./receivables";

const FINANCE_SCREENS = { ...CORE_SCREENS, ...AR_SCREENS };

export function FinanceList({ entity }: { entity: string }) {
  const config = FINANCE_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function FinanceRecord({ entity, id }: { entity: string; id: string }) {
  const config = FINANCE_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}

const thisMonth = () => new Date().toISOString().slice(0, 7);
const money = (n: number) => formatMoney(n, "LKR");

interface Settings {
  baseCurrency: string;
  accounts: Record<string, string>;
  configured: boolean;
  missingRoles: string[];
  autoInvoiceDeliveries?: boolean;
}

function useSettings() {
  return useQuery({ queryKey: ["finance-settings"], queryFn: () => financeApi.get<Settings>("/finance/settings") });
}

// ─── Overview and setup ───────────────────────────────────────────────────────

interface PnL { totalIncome: number; totalExpenses: number; netProfit: number }
interface BalanceSheet { totalAssets: number; totalLiabilities: number; totalEquity: number; balanced: boolean }
interface Issue { id: string; eventType: string; entity: string; entityId: string; error: string; createdAt: string; status: string }

export function FinanceHome() {
  const qc = useQueryClient();
  const settings = useSettings();
  const canSetup = useCan("finance.settings.edit");
  const month = thisMonth();
  const configured = settings.data?.configured;
  const pnl = useQuery({ queryKey: ["finance-pnl", month], queryFn: () => financeApi.get<PnL>("/finance/reports/profit-and-loss", { from: month, to: month }), enabled: !!configured });
  const bs = useQuery({ queryKey: ["finance-bs", month], queryFn: () => financeApi.get<BalanceSheet>("/finance/reports/balance-sheet", { to: month }), enabled: !!configured });
  const issues = useQuery({ queryKey: ["finance-issues"], queryFn: () => financeApi.get<Issue[]>("/finance/posting-issues"), enabled: !!configured });
  const setup = useMutation({
    mutationFn: () => financeApi.post<{ accounts: number }>("/finance/setup"),
    onSuccess: (r) => { toast.success(`${r.accounts} accounts created`); qc.invalidateQueries({ queryKey: ["finance-settings"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (settings.isLoading) return <Spinner />;
  if (settings.isError) return <ErrorState message={errorMessage(settings.error)} onRetry={() => settings.refetch()} />;
  if (!configured) {
    return (
      <div className="space-y-6">
        <PageHeader title="Finance" />
        <EmptyState
          title="Finance is not set up yet"
          body="Create a standard chart of accounts with posting rules, then adjust it to suit. Make sure a fiscal year covers the dates you will post."
          action={canSetup ? <button className="btn-primary" disabled={setup.isPending} onClick={() => setup.mutate()}><Wand2 size={15} /> Set up the standard chart</button> : undefined}
        />
      </div>
    );
  }
  const kpis = [
    { label: "Income this month", value: pnl.data ? money(pnl.data.totalIncome) : "…" },
    { label: "Expenses this month", value: pnl.data ? money(pnl.data.totalExpenses) : "…" },
    { label: "Net profit this month", value: pnl.data ? money(pnl.data.netProfit) : "…" },
    { label: "Total assets", value: bs.data ? money(bs.data.totalAssets) : "…" },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Finance" subtitle={`Base currency ${settings.data!.baseCurrency}`} actions={<Link className="btn-primary" href="/finance/new/journal"><Plus size={15} /> Journal</Link>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => <div key={k.label} className="stat-card"><p className="text-xl font-semibold">{k.value}</p><p className="text-sm text-slate-500">{k.label}</p></div>)}
      </div>
      {(issues.data?.length ?? 0) > 0 && (
        <Link href="/finance/issues" className="card p-4 flex items-center gap-3 border-amber-300 dark:border-amber-700">
          <AlertTriangle className="text-amber-600" size={18} />
          <span className="text-sm">{issues.data!.length} automatic posting{issues.data!.length === 1 ? "" : "s"} could not be made. Review and retry.</span>
        </Link>
      )}
      {settings.data!.missingRoles.length > 0 && (
        <Link href="/finance/settings" className="card p-4 flex items-center gap-3">
          <AlertTriangle className="text-amber-600" size={18} />
          <span className="text-sm">No account mapped for: {settings.data!.missingRoles.map(humanize).join(", ")}.</span>
        </Link>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ["Trial balance", "/finance/reports/trial-balance"],
          ["Profit and loss", "/finance/reports/profit-and-loss"],
          ["Balance sheet", "/finance/reports/balance-sheet"],
        ].map(([label, href]) => <Link key={href} href={href!} className="card p-5 font-medium hover:border-blue-400"><BookOpen size={16} className="inline mr-2" />{label}</Link>)}
      </div>
    </div>
  );
}

// ─── Posting rules ────────────────────────────────────────────────────────────

const ROLE_HELP: Record<string, string> = {
  receivable: "Customer balances (invoices and receipts)",
  payable: "Supplier balances (bills and payments)",
  grni: "Goods received, not yet invoiced",
  inventory: "Stock value",
  wip: "Work in progress (manufacturing)",
  cogs: "Cost of goods sold",
  inventoryAdjustment: "Stock adjustments and count differences",
  priceVariance: "Purchase price differences",
  revenue: "Sales revenue",
  salesReturns: "Sales returns and credit notes",
  taxOutput: "Tax charged on sales",
  taxInput: "Tax paid on purchases",
  retainedEarnings: "Profit carried forward at year end",
  fx: "Exchange gains and losses",
  rounding: "Rounding differences",
  bank: "Default bank account",
  cash: "Cash on hand",
  depreciation: "Depreciation expense",
  accumulatedDepreciation: "Accumulated depreciation",
};

export function FinanceSettingsPage() {
  const qc = useQueryClient();
  const settings = useSettings();
  const accounts = useAccounts().filter((a) => !a.isGroup);
  const can = useCan("finance.settings.edit");
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const save = useMutation({
    mutationFn: (body: { accounts?: Record<string, string>; autoInvoiceDeliveries?: boolean }) => financeApi.put<Settings>("/finance/settings", body),
    onSuccess: () => { toast.success("Posting rules saved"); setDraft(null); qc.invalidateQueries({ queryKey: ["finance-settings"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (settings.isLoading) return <Spinner />;
  if (settings.isError) return <ErrorState message={errorMessage(settings.error)} />;
  const values = draft ?? settings.data!.accounts;
  return (
    <form className="max-w-4xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate({ accounts: values }); }}>
      <PageHeader title="Posting rules" subtitle="The account each automatic posting uses." />
      <section className="card p-5">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={!!settings.data!.autoInvoiceDeliveries} disabled={!can || save.isPending} onChange={(e) => save.mutate({ autoInvoiceDeliveries: e.target.checked })} />
          Invoice dispatched deliveries and credit received returns automatically
        </label>
      </section>
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Object.keys(ROLE_HELP).map((role) => (
          <Field key={role} label={humanize(role)} hint={ROLE_HELP[role]}>
            <select className="input-base" value={values[role] ?? ""} disabled={!can} onChange={(e) => setDraft({ ...values, [role]: e.target.value })}>
              <option value="">Not mapped</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </Field>
        ))}
      </section>
      {can && <div className="flex justify-end"><button className="btn-primary" disabled={!draft || save.isPending}>Save</button></div>}
    </form>
  );
}

// ─── Posting issues ───────────────────────────────────────────────────────────

export function PostingIssuesPage() {
  const issues = useQuery({ queryKey: ["finance-issues"], queryFn: () => financeApi.get<Issue[]>("/finance/posting-issues") });
  const retry = useMutation({
    mutationFn: (id: string) => financeApi.post<{ issue: Issue | null }>(`/finance/posting-issues/${id}/retry`),
    onSuccess: (r) => { if (r.issue?.status === "resolved") toast.success("Posted"); else toast.error(r.issue?.error ?? "Still failing"); issues.refetch(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (issues.isLoading) return <Spinner />;
  if (issues.isError) return <ErrorState message={errorMessage(issues.error)} />;
  return (
    <div className="space-y-6">
      <PageHeader title="Posting issues" subtitle="Automatic postings that failed. Fix the cause (open the period, map the account), then retry." />
      {issues.data!.length === 0 ? <EmptyState title="Nothing to fix" /> : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>When</th><th>Event</th><th>Problem</th><th /></tr></thead>
            <tbody>
              {issues.data!.map((i) => (
                <tr key={i.id}>
                  <td>{formatDate(i.createdAt)}</td><td>{humanize(i.eventType)}</td><td>{i.error}</td>
                  <td><button className="btn-ghost" disabled={retry.isPending} onClick={() => retry.mutate(i.id)}><RotateCw size={15} /> Retry</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// ─── New journal ──────────────────────────────────────────────────────────────

interface LineForm { accountId: string; debit: string; credit: string; description: string }
const blank = (): LineForm => ({ accountId: "", debit: "", credit: "", description: "" });
const cents = (v: string) => Math.round(Number(v || "0") * 100);

export function NewFinanceDocument({ kind }: { kind: string }) {
  return kind === "journal" ? <NewJournal /> : <NewArDocument kind={kind} />;
}

function NewJournal() {
  const router = useRouter();
  const accounts = useAccounts().filter((a: Account) => !a.isGroup && a.status === "active");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<LineForm[]>([blank(), blank()]);
  const set = (i: number, patch: Partial<LineForm>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const dr = lines.reduce((a, l) => a + cents(l.debit), 0);
  const cr = lines.reduce((a, l) => a + cents(l.credit), 0);
  const save = useMutation({
    mutationFn: () => financeApi.journals.create({
      date, memo: memo || undefined,
      lines: lines.filter((l) => l.accountId && (l.debit || l.credit)).map((l) => ({ accountId: l.accountId, debit: l.debit || undefined, credit: l.credit || undefined, description: l.description || undefined })),
    }),
    onSuccess: (j: Journal) => { toast.success(`${j.number} saved as draft`); router.push(`/finance/journals/${j.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form className="max-w-5xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title="New journal" subtitle="Saved as a draft; post it from the journal page." />
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Date" required><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Memo"><input className="input-base" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field></div>
      </section>
      <section className="card p-5 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <select className="input-base col-span-12 sm:col-span-4" value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })} aria-label="Account">
              <option value="">Account…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}{a.isControl ? " (control)" : ""}</option>)}
            </select>
            <input className="input-base col-span-12 sm:col-span-3" placeholder="Description" value={l.description} onChange={(e) => set(i, { description: e.target.value })} aria-label="Description" />
            <input className="input-base col-span-5 sm:col-span-2" placeholder="Debit" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} aria-label="Debit" />
            <input className="input-base col-span-5 sm:col-span-2" placeholder="Credit" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} aria-label="Credit" />
            <button type="button" className="btn-ghost col-span-2 sm:col-span-1" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 size={15} /></button>
          </div>
        ))}
        <div className="flex justify-between items-center pt-2">
          <button type="button" className="btn-ghost text-blue-600" onClick={() => setLines([...lines, blank()])}><Plus size={14} /> Line</button>
          <p className={`text-sm ${dr === cr ? "text-slate-600" : "text-red-600 dark:text-red-400"}`}>
            Debits {money(dr)} · Credits {money(cr)}{dr !== cr ? ` · out by ${money(Math.abs(dr - cr))}` : ""}
          </p>
        </div>
      </section>
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href="/finance/journals">Cancel</Link>
        <button className="btn-primary" disabled={save.isPending || dr === 0 || dr !== cr}>Save draft</button>
      </div>
    </form>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────

interface Row { accountId: string; code: string; name: string; type: string; debit: number; credit: number; balance: number; closingDebit?: number; closingCredit?: number }

function RowsTable({ rows, total, label }: { rows: Row[]; total: number; label: string }) {
  return (
    <table className="table-base">
      <tbody>
        {rows.map((r) => (
          <tr key={r.accountId}>
            <td><Link className="hover:underline" href={`/finance/ledger/${r.accountId}`}>{r.code} {r.name}</Link></td>
            <td className="text-right">{money(r.balance)}</td>
          </tr>
        ))}
        <tr className="font-semibold"><td>{label}</td><td className="text-right">{money(total)}</td></tr>
      </tbody>
    </table>
  );
}

function MonthInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="text-sm flex items-center gap-2">{label}<input type="month" className="input-base py-1" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

function TrialBalance() {
  const [to, setTo] = useState(thisMonth());
  const q = useQuery({ queryKey: ["finance-tb", to], queryFn: () => financeApi.get<{ lines: Row[]; totalDebit: number; totalCredit: number }>("/finance/reports/trial-balance", { to: to || undefined }) });
  return (
    <div className="space-y-6">
      <PageHeader title="Trial balance" actions={<MonthInput label="To end of" value={to} onChange={setTo} />} />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message={errorMessage(q.error)} /> : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Account</th><th>Type</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
            <tbody>
              {q.data!.lines.map((l) => (
                <tr key={l.accountId}>
                  <td><Link className="hover:underline" href={`/finance/ledger/${l.accountId}`}>{l.code} {l.name}</Link></td><td>{humanize(l.type)}</td>
                  <td className="text-right">{l.closingDebit ? money(l.closingDebit) : ""}</td><td className="text-right">{l.closingCredit ? money(l.closingCredit) : ""}</td>
                </tr>
              ))}
              <tr className="font-semibold"><td colSpan={2}>Total</td><td className="text-right">{money(q.data!.totalDebit)}</td><td className="text-right">{money(q.data!.totalCredit)}</td></tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function ProfitAndLoss() {
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01`);
  const [to, setTo] = useState(thisMonth());
  const q = useQuery({ queryKey: ["finance-pl", from, to], queryFn: () => financeApi.get<{ income: Row[]; expenses: Row[]; totalIncome: number; totalExpenses: number; netProfit: number }>("/finance/reports/profit-and-loss", { from: from || undefined, to: to || undefined }) });
  return (
    <div className="space-y-6">
      <PageHeader title="Profit and loss" actions={<div className="flex gap-3"><MonthInput label="From" value={from} onChange={setFrom} /><MonthInput label="To" value={to} onChange={setTo} /></div>} />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message={errorMessage(q.error)} /> : (
        <div className="space-y-6 max-w-3xl">
          <section className="card overflow-x-auto"><h2 className="px-4 pt-4 font-semibold">Income</h2><RowsTable rows={q.data!.income} total={q.data!.totalIncome} label="Total income" /></section>
          <section className="card overflow-x-auto"><h2 className="px-4 pt-4 font-semibold">Expenses</h2><RowsTable rows={q.data!.expenses} total={q.data!.totalExpenses} label="Total expenses" /></section>
          <div className="card p-4 flex justify-between font-semibold"><span>Net profit</span><span>{money(q.data!.netProfit)}</span></div>
        </div>
      )}
    </div>
  );
}

function BalanceSheetReport() {
  const [to, setTo] = useState(thisMonth());
  const q = useQuery({ queryKey: ["finance-bs-full", to], queryFn: () => financeApi.get<{ assets: Row[]; liabilities: Row[]; equity: Row[]; currentEarnings: number; totalAssets: number; totalLiabilities: number; totalEquity: number; balanced: boolean }>("/finance/reports/balance-sheet", { to: to || undefined }) });
  return (
    <div className="space-y-6">
      <PageHeader title="Balance sheet" actions={<MonthInput label="At end of" value={to} onChange={setTo} />} />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message={errorMessage(q.error)} /> : (
        <div className="space-y-6 max-w-3xl">
          <section className="card overflow-x-auto"><h2 className="px-4 pt-4 font-semibold">Assets</h2><RowsTable rows={q.data!.assets} total={q.data!.totalAssets} label="Total assets" /></section>
          <section className="card overflow-x-auto"><h2 className="px-4 pt-4 font-semibold">Liabilities</h2><RowsTable rows={q.data!.liabilities} total={q.data!.totalLiabilities} label="Total liabilities" /></section>
          <section className="card overflow-x-auto">
            <h2 className="px-4 pt-4 font-semibold">Equity</h2>
            <RowsTable rows={[...q.data!.equity, { accountId: "earnings", code: "", name: "Current earnings", type: "equity", debit: 0, credit: 0, balance: q.data!.currentEarnings }]} total={q.data!.totalEquity} label="Total equity" />
          </section>
          {!q.data!.balanced && <p className="text-sm text-red-600">Assets do not equal liabilities plus equity; check for unbalanced opening entries.</p>}
        </div>
      )}
    </div>
  );
}

const REPORTS: Record<string, () => React.ReactElement> = {
  "trial-balance": TrialBalance,
  "profit-and-loss": ProfitAndLoss,
  "balance-sheet": BalanceSheetReport,
};

export function FinanceReport({ report }: { report: string }) {
  const R = REPORTS[report];
  if (!R) notFound();
  return <R />;
}

interface LedgerView {
  account: { id: string; code: string; name: string; type: string };
  opening: number;
  closing: number;
  lines: { id: string; journalId: string; journalNumber: string; date: string; description: string | null; debit: number; credit: number; balance: number }[];
}

export function AccountLedger({ accountId }: { accountId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const name = useAccountName();
  const q = useQuery({ queryKey: ["finance-ledger", accountId, from, to], queryFn: () => financeApi.get<LedgerView>(`/finance/reports/ledger/${accountId}`, { from: from || undefined, to: to || undefined }) });
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Ledger: ${name(accountId)}`}
        actions={
          <div className="flex gap-2 items-center">
            <input type="date" className="input-base py-1" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <input type="date" className="input-base py-1" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </div>
        }
      />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message={errorMessage(q.error)} /> : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Date</th><th>Journal</th><th>Description</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              <tr className="text-slate-500"><td colSpan={5}>Opening balance</td><td className="text-right">{money(q.data!.opening)}</td></tr>
              {q.data!.lines.map((l) => (
                <tr key={l.id}>
                  <td>{formatDate(l.date)}</td>
                  <td><Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/finance/journals/${l.journalId}`}>{l.journalNumber}</Link></td>
                  <td>{l.description ?? ""}</td>
                  <td className="text-right">{l.debit ? money(l.debit) : ""}</td><td className="text-right">{l.credit ? money(l.credit) : ""}</td>
                  <td className="text-right">{money(l.balance)}</td>
                </tr>
              ))}
              <tr className="font-semibold"><td colSpan={5}>Closing balance</td><td className="text-right">{money(q.data!.closing)}</td></tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
