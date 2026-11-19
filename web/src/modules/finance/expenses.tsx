"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { MasterConfig, MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { Field, PageHeader, StatusBadge } from "@/components/ui/kit";
import { useUserName } from "@/components/record/panels";
import { Action } from "@/modules/sales/config";
import { financeApi } from "./config";

interface Category extends BaseRecord {
  code: string;
  name: string;
  accountId: string;
  taxCode: string | null;
  receiptRequired: boolean;
  limit: number | null;
  status: string;
}
interface ClaimLine { lineId: string; date: string; categoryId: string; description: string; amount: number; taxCode: string | null; tax: number; net: number }
interface Claim extends BaseRecord {
  number: string;
  employeeId: string;
  title: string;
  currency: string;
  lines: ClaimLine[];
  total: number;
  tax: number;
  status: string;
  journalId: string | null;
  paymentJournalId: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  rejectionReason: string | null;
}

const expensesApi = { categories: crud<Category>("/expenses/categories"), claims: crud<Claim>("/expenses/claims") };
const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const linkCls = "text-blue-700 dark:text-blue-400 hover:underline";

const accountOptions = {
  queryKey: ["options", "finance.accounts.expense"],
  load: async () => (await financeApi.accounts.list({ limit: 1000, sort: "code" })).items.filter((a) => a.type === "expense" && !a.isGroup).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
};

function useCategories() {
  const q = useQuery({ queryKey: ["options", "expenses.categories"], queryFn: () => expensesApi.categories.list({ limit: 200 }) });
  return q.data?.items ?? [];
}

function Employee({ id }: { id: string }) {
  const name = useUserName();
  return <>{name(id)}</>;
}

function ClaimLines({ c }: { c: Claim }) {
  const cats = useCategories();
  return (
    <section className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="text-right">Tax</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {c.lines.map((l) => (
            <tr key={l.lineId}>
              <td>{formatDate(l.date)}</td><td>{cats.find((x) => x.id === l.categoryId)?.name ?? "…"}</td><td>{l.description}</td>
              <td className="text-right">{l.tax ? formatMoney(l.tax, c.currency) : "—"}</td><td className="text-right">{formatMoney(l.amount, c.currency)}</td>
            </tr>
          ))}
          <tr className="font-semibold"><td colSpan={3}>Total</td><td className="text-right">{formatMoney(c.tax, c.currency)}</td><td className="text-right">{formatMoney(c.total, c.currency)}</td></tr>
        </tbody>
      </table>
      <p className="px-4 pb-4 text-xs text-slate-500">Attach receipts on the Files tab before submitting.</p>
    </section>
  );
}

const categories: MasterConfig<Category> = {
  entityType: "expenses.category",
  permission: "expenses.category",
  plural: "Expense categories",
  singular: "Category",
  route: "/expenses/categories",
  client: expensesApi.categories,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "taxCode", label: "Tax" },
    { key: "receiptRequired", label: "Receipt", render: (r) => (r.receiptRequired ? "Required" : "Optional") },
    { key: "limit", label: "Limit per line", render: (r) => (r.limit === null ? "" : formatMoney(r.limit, "LKR")) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "accountId", label: "Expense account", type: "reference", reference: accountOptions, required: true },
    { key: "taxCode", label: "Reclaimable tax code", type: "text", placeholder: "VAT" },
    { key: "receiptRequired", label: "Receipt required", type: "boolean" },
    { key: "limit", label: "Limit per line", type: "text" },
    { key: "status", label: "Status", type: "select", options: opts(["active", "inactive"]) },
  ],
  toForm: (r) => ({ ...r, limit: r.limit === null ? "" : (r.limit / 100).toFixed(2) }),
  defaults: { receiptRequired: true, status: "active" },
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => r.status,
};

const claims: MasterConfig<Claim> = {
  entityType: "expenses.claim",
  permission: "expenses.claim",
  plural: "Expense claims",
  singular: "Claim",
  route: "/expenses/claims",
  client: expensesApi.claims,
  defaultSort: "-createdAt",
  createHref: "/expenses/new",
  columns: [
    { key: "number", label: "Number" },
    { key: "title", label: "Title" },
    { key: "employeeId", label: "Claimant", render: (r) => <Employee id={r.employeeId} /> },
    { key: "total", label: "Total", render: (r) => formatMoney(r.total, r.currency), text: (r) => String(r.total / 100) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "pending_approval", "approved", "rejected", "paid"]) }],
  fields: [{ key: "title", label: "Title", type: "text", required: true, wide: true }],
  title: (r) => `${r.number} ${r.title}`,
  subtitle: (r) => `${formatMoney(r.total, r.currency)} · ${formatDate(r.createdAt)}`,
  status: (r) => r.status,
  editable: (r) => ["draft", "rejected"].includes(r.status),
  actions: (r, refresh) => (
    <>
      {["draft", "rejected"].includes(r.status) && <Action<Claim> label="Submit" icon={Send} path={`/expenses/claims/${r.id}/submit`} permission="expenses.claim.create" onDone={refresh} />}
      {r.status === "approved" && <Action<Claim> label="Reimburse" icon={Banknote} path={`/expenses/claims/${r.id}/reimburse`} permission="expenses.claim.edit" onDone={refresh} confirm="Pay the claimant from the default bank account?" />}
    </>
  ),
  details: (r) => [
    { label: "Claimant", value: <Employee id={r.employeeId} /> },
    { label: "Approved", value: formatDate(r.approvedAt) },
    { label: "Paid", value: formatDate(r.paidAt) },
    { label: "Returned with", value: r.rejectionReason },
    { label: "Journal", value: r.journalId ? <Link className={linkCls} href={`/finance/journals/${r.journalId}`}>Open journal</Link> : null },
  ],
  extra: (r) => <ClaimLines c={r} />,
};

const SCREENS: Record<string, MasterConfig<never>> = {
  categories: categories as unknown as MasterConfig<never>,
  claims: claims as unknown as MasterConfig<never>,
};

export function ExpensesList({ entity }: { entity: string }) {
  const config = SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function ExpensesRecord({ entity, id }: { entity: string; id: string }) {
  const config = SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}

export function NewClaim() {
  const router = useRouter();
  const cats = useCategories().filter((c) => c.status === "active");
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState([{ date: "", categoryId: "", description: "", amount: "" }]);
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const save = useMutation({
    mutationFn: () => expensesApi.claims.create({ title, lines: lines.filter((l) => l.categoryId && l.amount && l.description).map((l) => ({ ...l, date: l.date || undefined })) }),
    onSuccess: (c) => { toast.success(`${c.number} saved; attach receipts, then submit`); router.push(`/expenses/claims/${c.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form className="max-w-4xl space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader title="New expense claim" subtitle="Enter amounts as paid, tax included; reclaimable tax is worked out from the category." />
      <section className="card p-5"><Field label="Title" required><input className="input-base" value={title} onChange={(e) => setTitle(e.target.value)} /></Field></section>
      <section className="card p-5 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input type="date" className="input-base col-span-6 sm:col-span-2" value={l.date} onChange={(e) => set(i, { date: e.target.value })} aria-label="Date" />
            <select className="input-base col-span-6 sm:col-span-3" value={l.categoryId} onChange={(e) => set(i, { categoryId: e.target.value })} aria-label="Category">
              <option value="">Category…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.receiptRequired ? " (receipt)" : ""}</option>)}
            </select>
            <input className="input-base col-span-12 sm:col-span-4" placeholder="Description" value={l.description} onChange={(e) => set(i, { description: e.target.value })} aria-label="Description" />
            <input className="input-base col-span-10 sm:col-span-2" placeholder="Amount" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label="Amount" />
            <button type="button" className="btn-ghost col-span-2 sm:col-span-1" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" className="btn-ghost text-blue-600" onClick={() => setLines([...lines, { date: "", categoryId: "", description: "", amount: "" }])}><Plus size={14} /> Line</button>
      </section>
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary" href="/expenses/claims">Cancel</Link>
        <button className="btn-primary" disabled={!title || save.isPending || !lines.some((l) => l.categoryId && l.amount && l.description)}>Save claim</button>
      </div>
    </form>
  );
}
