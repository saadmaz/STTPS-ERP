"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Ban, BookOpen, CheckCircle2, Undo2 } from "lucide-react";
import { api, BaseRecord, crud } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { MasterConfig } from "@/components/master/MasterData";
import { StatusBadge } from "@/components/ui/kit";
import { Action } from "@/modules/sales/config";

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;

export interface Account extends BaseRecord {
  code: string;
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  subtype: string | null;
  parentId: string | null;
  isGroup: boolean;
  isControl: boolean;
  currency: string | null;
  status: "active" | "inactive";
  description: string | null;
}

export interface JournalLine {
  lineId: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string | null;
  partyType: string | null;
  partyId: string | null;
  departmentId: string | null;
  costCentreId: string | null;
}

export interface Journal extends BaseRecord {
  number: string;
  date: string;
  period: string;
  source: "manual" | "system" | "reversal";
  sourceEvent: { type: string; id: string } | null;
  reference: { entityType: string; entityId: string; label?: string | null } | null;
  memo: string | null;
  currency: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  status: string;
  postedAt: string | null;
  reversalOfId: string | null;
  reversedById: string | null;
}

export const financeApi = {
  accounts: crud<Account>("/finance/accounts"),
  journals: crud<Journal>("/finance/journals"),
  get: <T,>(path: string, params?: object) => api.get(path, { params }).then((r) => r.data as T),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
  put: <T,>(path: string, body: object = {}) => api.put(path, body).then((r) => r.data as T),
};

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const linkCls = "text-blue-700 dark:text-blue-400 hover:underline";

export function useAccounts() {
  const q = useQuery({ queryKey: ["options", "finance.accounts"], queryFn: () => financeApi.accounts.list({ limit: 1000, sort: "code" }) });
  return q.data?.items ?? [];
}

export function useAccountName() {
  const accounts = useAccounts();
  return (id: string | null) => {
    const a = id ? accounts.find((x) => x.id === id) : undefined;
    return a ? `${a.code} ${a.name}` : id ? "…" : "—";
  };
}

const groupOptions = {
  queryKey: ["options", "finance.accounts.groups"],
  load: async () => (await financeApi.accounts.list({ limit: 1000, sort: "code" })).items.filter((a) => a.isGroup).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
};

function JournalLines({ j }: { j: Journal }) {
  const name = useAccountName();
  return (
    <section className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>Account</th><th>Description</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
        <tbody>
          {j.lines.map((l) => (
            <tr key={l.lineId}>
              <td><Link className={linkCls} href={`/finance/ledger/${l.accountId}`}>{name(l.accountId)}</Link></td>
              <td>{l.description ?? ""}</td>
              <td className="text-right">{l.debit ? formatMoney(l.debit, j.currency || "LKR") : ""}</td>
              <td className="text-right">{l.credit ? formatMoney(l.credit, j.currency || "LKR") : ""}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td colSpan={2}>Total</td>
            <td className="text-right">{formatMoney(j.totalDebit, j.currency || "LKR")}</td>
            <td className="text-right">{formatMoney(j.totalCredit, j.currency || "LKR")}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

const accounts: MasterConfig<Account> = {
  entityType: "finance.account",
  permission: "finance.account",
  plural: "Chart of accounts",
  singular: "Account",
  route: "/finance/accounts",
  client: financeApi.accounts,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name", render: (r) => (r.isGroup ? <span className="font-semibold">{r.name}</span> : r.name) },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "subtype", label: "Used for", render: (r) => (r.subtype ? humanize(r.subtype) : "") },
    { key: "isControl", label: "Control", render: (r) => (r.isControl ? "Yes" : "") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.isGroup ? "group" : r.status} /> },
  ],
  filters: [
    { key: "type", label: "Type", options: opts(ACCOUNT_TYPES) },
    { key: "status", label: "Status", options: opts(["active", "inactive"]) },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "type", label: "Type", type: "select", required: true, options: opts(ACCOUNT_TYPES), createOnly: true },
    { key: "parentId", label: "Group", type: "reference", reference: groupOptions, hint: "Must be a group of the same type" },
    { key: "isGroup", label: "Group (header) account", type: "boolean" },
    { key: "isControl", label: "Control account (posted from a sub-ledger)", type: "boolean" },
    { key: "subtype", label: "Used for", type: "text", placeholder: "bank, receivable …" },
    { key: "currency", label: "Currency", type: "text", placeholder: "Any" },
    { key: "status", label: "Status", type: "select", options: opts(["active", "inactive"]) },
    { key: "description", label: "Description", type: "textarea", wide: true },
  ],
  defaults: { status: "active" },
  title: (r) => `${r.code} ${r.name}`,
  subtitle: (r) => `${humanize(r.type)}${r.isGroup ? " group" : ""}${r.subtype ? ` · ${humanize(r.subtype)}` : ""}`,
  status: (r) => r.status,
  actions: (r) => (!r.isGroup ? <Link className="btn-primary" href={`/finance/ledger/${r.id}`}><BookOpen size={15} /> Ledger</Link> : null),
  details: (r) => [
    { label: "Control account", value: r.isControl ? "Yes: only its sub-ledger posts here" : "No" },
    { label: "Currency", value: r.currency ?? "Any" },
    { label: "Description", value: r.description },
  ],
};

const journals: MasterConfig<Journal> = {
  entityType: "finance.journal",
  permission: "finance.journal",
  plural: "Journals",
  singular: "Journal",
  route: "/finance/journals",
  client: financeApi.journals,
  defaultSort: "-date",
  createHref: "/finance/new/journal",
  columns: [
    { key: "number", label: "Number" },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "memo", label: "Memo", render: (r) => r.memo ?? r.reference?.label ?? "" },
    { key: "source", label: "Source", render: (r) => humanize(r.source) },
    { key: "totalDebit", label: "Amount", render: (r) => formatMoney(r.totalDebit, r.currency || "LKR"), text: (r) => String(r.totalDebit / 100) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(["draft", "pending_approval", "posted", "reversed", "cancelled"]) },
    { key: "source", label: "Source", options: opts(["manual", "system", "reversal"]) },
  ],
  fields: [{ key: "memo", label: "Memo", type: "text", wide: true }],
  title: (r) => r.number,
  subtitle: (r) => `${formatDate(r.date)} · ${formatMoney(r.totalDebit, r.currency || "LKR")}${r.memo ? ` · ${r.memo}` : ""}`,
  status: (r) => r.status,
  editable: (r) => r.status === "draft",
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && <Action<Journal> label="Post" icon={CheckCircle2} path={`/finance/journals/${r.id}/post`} permission="finance.journal.edit" onDone={refresh} confirm="Post this journal to the ledger?" />}
      {r.status === "draft" && <Action<Journal> label="Cancel" icon={Ban} path={`/finance/journals/${r.id}/cancel`} permission="finance.journal.edit" onDone={refresh} danger />}
      {r.status === "posted" && (
        <Action<Journal> label="Reverse" icon={Undo2} path={`/finance/journals/${r.id}/reverse`} permission="finance.journal.edit" danger confirm="Reverse this journal? A mirror-image journal is posted." onDone={() => refresh({ ...r, status: "reversed" })} />
      )}
    </>
  ),
  details: (r) => [
    { label: "Period", value: r.period },
    { label: "Posted", value: formatDateTime(r.postedAt) },
    { label: "Created from", value: r.sourceEvent ? `${humanize(r.sourceEvent.type)}${r.reference?.label ? ` · ${r.reference.label}` : ""}` : null },
    { label: "Reverses", value: r.reversalOfId ? <Link className={linkCls} href={`/finance/journals/${r.reversalOfId}`}>Original journal</Link> : null },
    { label: "Reversed by", value: r.reversedById ? <Link className={linkCls} href={`/finance/journals/${r.reversedById}`}>Reversal</Link> : null },
  ],
  extra: (r) => <JournalLines j={r} />,
};

export const FINANCE_SCREENS: Record<string, MasterConfig<never>> = {
  accounts: accounts as unknown as MasterConfig<never>,
  journals: journals as unknown as MasterConfig<never>,
};
