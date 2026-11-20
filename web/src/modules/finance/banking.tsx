"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, CheckCircle2, Link2, Unlink, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { ConfirmDialog, EmptyState, ErrorState, Field, PageHeader, Spinner, StatusBadge, Tabs } from "@/components/ui/kit";
import { useAccounts } from "./config";

interface BankAccount {
  id: string;
  code: string;
  name: string;
  subtype: string;
  currency: string | null;
  balance: number;
  unmatchedStatementLines: number;
  lastReconciled: { statementDate: string; statementBalance: number } | null;
}
interface StatementLine { id: string; date: string; description: string; reference: string | null; amount: number; status: "unmatched" | "matched"; matchedBy: string | null; entryIds: string[] }
interface LedgerLine { id: string; journalId: string; journalNumber: string; date: string; description: string | null; amount: number }
interface Reconciliation { id: string; statementDate: string; statementBalance: number; clearedBalance: number; bookBalance: number; outstanding: { entryId: string; date: string; description: string | null; amount: number }[]; createdAt: string }

const money = (n: number) => formatMoney(n, "LKR");
const get = <T,>(path: string, params?: object) => api.get(path, { params }).then((r) => r.data as T);
const post = <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T);

export function BankingPage() {
  const can = useCan("finance.bank.edit");
  const q = useQuery({ queryKey: ["finance-bank-accounts"], queryFn: () => get<BankAccount[]>("/finance/bank/accounts") });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const transfer = useMutation({
    mutationFn: () => post("/finance/bank/transfers", { fromAccountId: from, toAccountId: to, amount }),
    onSuccess: () => { toast.success("Transferred"); setAmount(""); q.refetch(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const accounts = q.data!;
  return (
    <div className="space-y-6">
      <PageHeader title="Bank and cash" subtitle="Import statements, match them to the books and reconcile." />
      {accounts.length === 0 ? <EmptyState title="No bank or cash accounts" body="Add an account with “Used for” set to bank or cash in the chart of accounts." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((a) => (
            <Link key={a.id} href={`/finance/bank/${a.id}`} className="card p-5 hover:border-blue-400 space-y-1">
              <p className="text-sm text-slate-500">{a.code} · {humanize(a.subtype)}</p>
              <p className="font-semibold">{a.name}</p>
              <p className="text-xl font-semibold">{money(a.balance)}</p>
              <p className="text-xs text-slate-500">
                {a.unmatchedStatementLines ? `${a.unmatchedStatementLines} statement line${a.unmatchedStatementLines === 1 ? "" : "s"} to match · ` : ""}
                {a.lastReconciled ? `reconciled to ${formatDate(a.lastReconciled.statementDate)}` : "never reconciled"}
              </p>
            </Link>
          ))}
        </div>
      )}
      {can && accounts.length > 1 && (
        <form className="card p-5 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end" onSubmit={(e) => { e.preventDefault(); transfer.mutate(); }}>
          <Field label="From"><select className="input-base" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Choose…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></Field>
          <Field label="To"><select className="input-base" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></Field>
          <Field label="Amount"><input className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <button className="btn-primary" disabled={!from || !to || !amount || transfer.isPending}><ArrowLeftRight size={15} /> Transfer</button>
        </form>
      )}
    </div>
  );
}

function ImportStatement({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [format, setFormat] = useState<"csv" | "ofx">("csv");
  const [dateOrder, setDateOrder] = useState("YMD");
  const run = useMutation({
    mutationFn: (content: string) => post<{ imported: number; duplicates: number; matched: number }>("/finance/bank/statements", { accountId, format, content, dateOrder }),
    onSuccess: (r) => { toast.success(`${r.imported} lines imported, ${r.matched} matched${r.duplicates ? `, ${r.duplicates} already there` : ""}`); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="card p-5 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
      <Field label="Format"><select className="input-base" value={format} onChange={(e) => setFormat(e.target.value as "csv" | "ofx")}><option value="csv">CSV</option><option value="ofx">OFX / QFX</option></select></Field>
      {format === "csv" && (
        <Field label="Dates written as"><select className="input-base" value={dateOrder} onChange={(e) => setDateOrder(e.target.value)}><option value="YMD">2026-11-30</option><option value="DMY">30/11/2026</option><option value="MDY">11/30/2026</option></select></Field>
      )}
      <label className="btn-primary cursor-pointer sm:col-span-2 justify-center">
        <Upload size={15} /> {run.isPending ? "Importing…" : "Choose statement file"}
        <input type="file" className="sr-only" accept=".csv,.txt,.ofx,.qfx" disabled={run.isPending} onChange={async (e) => { const f = e.target.files?.[0]; if (f) run.mutate(await f.text()); e.target.value = ""; }} />
      </label>
    </section>
  );
}

function MatchDialog({ line, accountId, onClose, onDone }: { line: StatementLine; accountId: string; onClose: () => void; onDone: () => void }) {
  const accounts = useAccounts().filter((a) => !a.isGroup && !a.isControl && a.status === "active");
  const entries = useQuery({ queryKey: ["finance-bank-entries", accountId], queryFn: () => get<LedgerLine[]>(`/finance/bank/${accountId}/unmatched-entries`) });
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const match = useMutation({ mutationFn: () => post(`/finance/bank/lines/${line.id}/match`, { entryIds: picked }), onSuccess: () => { toast.success("Matched"); onDone(); }, onError: (e) => toast.error(errorMessage(e)) });
  const create = useMutation({ mutationFn: () => post(`/finance/bank/lines/${line.id}/create`, { accountId: other }), onSuccess: () => { toast.success("Posted and matched"); onDone(); }, onError: (e) => toast.error(errorMessage(e)) });
  const rows = entries.data ?? [];
  const sum = rows.filter((e) => picked.includes(e.id)).reduce((a, e) => a + e.amount, 0);
  return (
    <ConfirmDialog open title={`${formatDate(line.date)} · ${line.description} · ${money(line.amount)}`} confirmLabel="Match selected" busy={match.isPending} onConfirm={() => (sum === line.amount ? match.mutate() : toast.error("The selected lines must add up to the statement amount"))} onClose={onClose}>
      <div className="space-y-4">
        <div className="max-h-60 overflow-y-auto">
          {entries.isLoading ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-slate-500">No unmatched ledger lines.</p> : (
            <table className="table-base">
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className={e.amount === line.amount ? "font-medium" : ""}>
                    <td><input type="checkbox" aria-label={e.journalNumber} checked={picked.includes(e.id)} onChange={(x) => setPicked(x.target.checked ? [...picked, e.id] : picked.filter((p) => p !== e.id))} /></td>
                    <td>{formatDate(e.date)}</td><td>{e.journalNumber}</td><td>{e.description ?? ""}</td><td className="text-right">{money(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className={`text-sm ${sum === line.amount ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"}`}>Selected {money(sum)} of {money(line.amount)}</p>
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex gap-2 items-end">
          <Field label="Not in the books? Post it against">
            <select className="input-base" value={other} onChange={(e) => setOther(e.target.value)}>
              <option value="">Choose account…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </Field>
          <button type="button" className="btn-secondary" disabled={!other || create.isPending} onClick={() => create.mutate()}>Post</button>
        </div>
      </div>
    </ConfirmDialog>
  );
}

export function BankAccountPage({ accountId }: { accountId: string }) {
  const can = useCan("finance.bank.edit");
  const [tab, setTab] = useState("unmatched");
  const [matching, setMatching] = useState<StatementLine | null>(null);
  const [statementDate, setStatementDate] = useState("");
  const [statementBalance, setStatementBalance] = useState("");
  const accounts = useQuery({ queryKey: ["finance-bank-accounts"], queryFn: () => get<BankAccount[]>("/finance/bank/accounts") });
  const lines = useQuery({ queryKey: ["finance-bank-lines", accountId], queryFn: () => get<StatementLine[]>(`/finance/bank/${accountId}/lines`) });
  const history = useQuery({ queryKey: ["finance-bank-recs", accountId], queryFn: () => get<Reconciliation[]>(`/finance/bank/${accountId}/reconciliations`) });
  const refresh = () => { lines.refetch(); accounts.refetch(); history.refetch(); };
  const auto = useMutation({ mutationFn: () => post<{ matched: number }>(`/finance/bank/${accountId}/auto-match`), onSuccess: (r) => { toast.success(`${r.matched} matched`); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const unmatch = useMutation({ mutationFn: (id: string) => post(`/finance/bank/lines/${id}/unmatch`), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const reconcile = useMutation({
    mutationFn: () => post<Reconciliation>("/finance/bank/reconciliations", { accountId, statementDate, statementBalance }),
    onSuccess: () => { toast.success("Reconciled"); setTab("history"); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const account = accounts.data?.find((a) => a.id === accountId);
  const shown = (lines.data ?? []).filter((l) => tab === "all" || l.status === tab);
  return (
    <div className="space-y-6">
      <PageHeader
        title={account ? `${account.code} ${account.name}` : "Bank account"}
        subtitle={account ? `Book balance ${money(account.balance)}${account.lastReconciled ? ` · reconciled to ${formatDate(account.lastReconciled.statementDate)}` : ""}` : undefined}
        actions={can ? <button className="btn-secondary" onClick={() => auto.mutate()} disabled={auto.isPending}><Wand2 size={15} /> Auto-match</button> : undefined}
      />
      {can && <ImportStatement accountId={accountId} onDone={refresh} />}
      <Tabs active={tab} onChange={setTab} tabs={[{ key: "unmatched", label: "To match", count: (lines.data ?? []).filter((l) => l.status === "unmatched").length }, { key: "matched", label: "Matched" }, { key: "all", label: "All lines" }, { key: "history", label: "Reconciliations" }]} />
      {tab !== "history" ? (
        lines.isLoading ? <Spinner /> : shown.length === 0 ? <EmptyState title={tab === "unmatched" ? "Everything is matched" : "No statement lines"} /> : (
          <section className="card overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="text-right">Amount</th><th>Status</th><th /></tr></thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id}>
                    <td>{formatDate(l.date)}</td><td>{l.description}</td><td>{l.reference ?? ""}</td>
                    <td className={`text-right ${l.amount < 0 ? "text-red-700 dark:text-red-400" : ""}`}>{money(l.amount)}</td>
                    <td><StatusBadge status={l.status} />{l.matchedBy ? <span className="text-xs text-slate-500 ml-1">{humanize(l.matchedBy)}</span> : null}</td>
                    <td className="text-right">
                      {can && l.status === "unmatched" && <button className="btn-ghost" onClick={() => setMatching(l)}><Link2 size={15} /> Match</button>}
                      {can && l.status === "matched" && <button className="btn-ghost" onClick={() => unmatch.mutate(l.id)}><Unlink size={15} /> Unmatch</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      ) : (
        <div className="space-y-4">
          {can && (
            <form className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end" onSubmit={(e) => { e.preventDefault(); reconcile.mutate(); }}>
              <Field label="Statement date"><input type="date" className="input-base" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} /></Field>
              <Field label="Closing balance on the statement"><input className="input-base" value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} /></Field>
              <button className="btn-primary" disabled={!statementDate || !statementBalance || reconcile.isPending}><CheckCircle2 size={15} /> Reconcile</button>
            </form>
          )}
          {(history.data ?? []).map((r) => (
            <section key={r.id} className="card p-5 space-y-2 text-sm">
              <p className="font-semibold">Statement {formatDate(r.statementDate)} · {money(r.statementBalance)}</p>
              <p>Book balance {money(r.bookBalance)} · {r.outstanding.length} outstanding item{r.outstanding.length === 1 ? "" : "s"} ({money(r.bookBalance - r.clearedBalance)})</p>
              {r.outstanding.length > 0 && (
                <ul className="list-disc pl-5 text-slate-600 dark:text-slate-300">{r.outstanding.map((o) => <li key={o.entryId}>{formatDate(o.date)} · {o.description ?? ""} · {money(o.amount)}</li>)}</ul>
              )}
            </section>
          ))}
        </div>
      )}
      {matching && <MatchDialog line={matching} accountId={accountId} onClose={() => setMatching(null)} onDone={() => { setMatching(null); refresh(); }} />}
    </div>
  );
}
