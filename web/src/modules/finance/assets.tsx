"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, CalendarClock, PackageCheck, TrendingDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig, MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { ConfirmDialog, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { financeApi, useAccounts } from "./config";

interface Category extends BaseRecord {
  code: string;
  name: string;
  assetAccountId: string;
  accumulatedAccountId: string;
  expenseAccountId: string;
  method: string;
  usefulLifeMonths: number;
  decliningRate: number | null;
}
interface Asset extends BaseRecord {
  code: string;
  name: string;
  categoryId: string;
  serialNo: string | null;
  location: string | null;
  acquisitionDate: string;
  inServiceDate: string;
  cost: number;
  residualValue: number;
  method: string;
  usefulLifeMonths: number;
  accumulatedDepreciation: number;
  impairment: number;
  bookValue: number;
  lastDepreciatedPeriod: string | null;
  status: string;
  history: { date: string; event: string; detail: string; journalId: string | null }[];
  disposal: { date: string; proceeds: number; gainOrLoss: number } | null;
}

const assetsApi = { categories: crud<Category>("/assets/categories"), register: crud<Asset>("/assets/register") };
const money = (n: number) => formatMoney(n, "LKR");
const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const post = <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T);

const accountRef = (type: string) => ({
  queryKey: ["options", "finance.accounts", type],
  load: async () => (await financeApi.accounts.list({ limit: 1000, sort: "code" })).items.filter((a) => a.type === type && !a.isGroup).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
});
const categoryRef = {
  queryKey: ["options", "assets.categories"],
  load: async () => (await assetsApi.categories.list({ limit: 200 })).items.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
};

/** One action that asks for a few fields in a dialog, then posts them. */
function DialogAction({ label, icon: Icon, permission, path, danger, fields, toBody, onDone }: {
  label: string; icon: React.ElementType; permission: string; path: string; danger?: boolean;
  fields: { key: string; label: string; kind: "text" | "date" | "account"; accountType?: string }[];
  toBody: (v: Record<string, string>) => object; onDone: (a: Asset) => void;
}) {
  const can = useCan(permission);
  const accounts = useAccounts();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const run = useMutation({ mutationFn: () => post<Asset>(path, toBody(values)), onSuccess: (a) => { toast.success(`${label}: done`); setOpen(false); onDone(a); }, onError: (e) => toast.error(errorMessage(e)) });
  if (!can) return null;
  return (
    <>
      <button className={danger ? "btn-ghost" : "btn-primary"} onClick={() => setOpen(true)}><Icon size={15} /> {label}</button>
      <ConfirmDialog open={open} title={label} confirmLabel={label} danger={danger} busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.kind === "account" ? (
                <select className="input-base" value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                  <option value="">Choose…</option>
                  {accounts.filter((a) => !a.isGroup && (!f.accountType || a.type === f.accountType)).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
              ) : (
                <input type={f.kind === "date" ? "date" : "text"} className="input-base" value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              )}
            </Field>
          ))}
        </div>
      </ConfirmDialog>
    </>
  );
}

function AssetDetail({ a }: { a: Asset }) {
  const [showSchedule, setShowSchedule] = useState(false);
  const schedule = useQuery({
    queryKey: ["assets-schedule", a.id, a.version], enabled: showSchedule,
    queryFn: () => api.get(`/assets/register/${a.id}/schedule`).then((r) => r.data as { rows: { period: string; charge: number; accumulated: number; bookValue: number }[] }),
  });
  return (
    <div className="space-y-4">
      <section className="card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><p className="text-slate-500">Cost</p><p className="font-semibold">{money(a.cost)}</p></div>
        <div><p className="text-slate-500">Accumulated depreciation</p><p className="font-semibold">{money(a.accumulatedDepreciation)}</p></div>
        <div><p className="text-slate-500">Impairment</p><p className="font-semibold">{money(a.impairment)}</p></div>
        <div><p className="text-slate-500">Book value</p><p className="font-semibold">{money(a.bookValue)}</p></div>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">History</h2>
        <table className="table-base">
          <tbody>
            {[...a.history].reverse().map((h, i) => (
              <tr key={i}>
                <td>{formatDate(h.date)}</td><td>{humanize(h.event)}</td><td>{h.detail}</td>
                <td>{h.journalId ? <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/finance/journals/${h.journalId}`}>Journal</Link> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {a.status !== "disposed" && (
        <section className="card overflow-x-auto">
          <div className="flex justify-between items-center px-4 pt-4">
            <h2 className="font-semibold">Depreciation schedule</h2>
            <button className="btn-ghost" onClick={() => setShowSchedule(!showSchedule)}>{showSchedule ? "Hide" : "Show"}</button>
          </div>
          {showSchedule && (schedule.isLoading ? <Spinner /> : (
            <table className="table-base">
              <thead><tr><th>Period</th><th className="text-right">Charge</th><th className="text-right">Accumulated</th><th className="text-right">Book value</th></tr></thead>
              <tbody>{(schedule.data?.rows ?? []).map((r) => <tr key={r.period}><td>{r.period}</td><td className="text-right">{money(r.charge)}</td><td className="text-right">{money(r.accumulated)}</td><td className="text-right">{money(r.bookValue)}</td></tr>)}</tbody>
            </table>
          ))}
        </section>
      )}
    </div>
  );
}

const categories: MasterConfig<Category> = {
  entityType: "assets.category",
  permission: "assets.category",
  plural: "Asset categories",
  singular: "Category",
  route: "/assets/categories",
  client: assetsApi.categories,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "method", label: "Method", render: (r) => humanize(r.method) },
    { key: "usefulLifeMonths", label: "Life (months)" },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "assetAccountId", label: "Cost account", type: "reference", reference: accountRef("asset"), required: true },
    { key: "accumulatedAccountId", label: "Accumulated depreciation account", type: "reference", reference: accountRef("asset"), required: true },
    { key: "expenseAccountId", label: "Depreciation expense account", type: "reference", reference: accountRef("expense"), required: true },
    { key: "method", label: "Method", type: "select", options: opts(["straight_line", "declining_balance", "none"]) },
    { key: "usefulLifeMonths", label: "Useful life (months)", type: "number", required: true },
    { key: "decliningRate", label: "Declining rate (hundredths of a %, 2500 = 25%)", type: "number" },
  ],
  defaults: { method: "straight_line", usefulLifeMonths: 60 },
  title: (r) => r.name,
  subtitle: (r) => `${humanize(r.method)} · ${r.usefulLifeMonths} months`,
};

const register: MasterConfig<Asset> = {
  entityType: "assets.asset",
  permission: "assets.asset",
  plural: "Fixed assets",
  singular: "Asset",
  route: "/assets/register",
  client: assetsApi.register,
  defaultSort: "-createdAt",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "inServiceDate", label: "In service", render: (r) => formatDate(r.inServiceDate) },
    { key: "cost", label: "Cost", render: (r) => money(r.cost), text: (r) => String(r.cost / 100) },
    { key: "bookValue", label: "Book value", render: (r) => money(r.bookValue), text: (r) => String(r.bookValue / 100) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "active", "fully_depreciated", "disposed"]) }],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "categoryId", label: "Category", type: "reference", reference: categoryRef, required: true, createOnly: true },
    { key: "cost", label: "Cost", type: "text", required: true, createOnly: true },
    { key: "residualValue", label: "Residual value", type: "text", createOnly: true },
    { key: "acquisitionDate", label: "Acquired", type: "date", createOnly: true },
    { key: "inServiceDate", label: "In service from", type: "date", createOnly: true },
    { key: "usefulLifeMonths", label: "Useful life (months, default from category)", type: "number", createOnly: true },
    { key: "serialNo", label: "Serial number", type: "text" },
    { key: "location", label: "Location", type: "text" },
  ],
  title: (r) => `${r.code} ${r.name}`,
  subtitle: (r) => `${money(r.bookValue)} book value · ${humanize(r.method)}`,
  status: (r) => r.status,
  editable: (r) => r.status !== "disposed",
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && (
        <DialogAction label="Capitalise" icon={PackageCheck} permission="assets.asset.edit" path={`/assets/register/${r.id}/capitalise`} onDone={refresh}
          fields={[{ key: "creditAccountId", label: "Credit (leave empty if a supplier bill already posted the cost)", kind: "account" }, { key: "date", label: "Date", kind: "date" }]}
          toBody={(v) => ({ creditAccountId: v.creditAccountId || undefined, date: v.date || undefined })} />
      )}
      {["active", "fully_depreciated"].includes(r.status) && (
        <>
          <DialogAction label="Impair" icon={TrendingDown} permission="assets.asset.edit" path={`/assets/register/${r.id}/impair`} onDone={refresh} danger
            fields={[{ key: "amount", label: "Write-down", kind: "text" }, { key: "accountId", label: "Impairment loss account", kind: "account", accountType: "expense" }, { key: "reason", label: "Reason", kind: "text" }]}
            toBody={(v) => v} />
          <DialogAction label="Transfer" icon={ArrowRightLeft} permission="assets.asset.edit" path={`/assets/register/${r.id}/transfer`} onDone={refresh} danger
            fields={[{ key: "location", label: "New location", kind: "text" }]} toBody={(v) => v} />
          <DialogAction label="Dispose" icon={Trash2} permission="assets.asset.delete" path={`/assets/register/${r.id}/dispose`} onDone={refresh} danger
            fields={[{ key: "proceeds", label: "Proceeds (0 if scrapped)", kind: "text" }, { key: "proceedsAccountId", label: "Proceeds received into", kind: "account", accountType: "asset" }, { key: "gainLossAccountId", label: "Gain or loss account", kind: "account" }, { key: "date", label: "Date", kind: "date" }]}
            toBody={(v) => ({ ...v, proceeds: v.proceeds || "0", proceedsAccountId: v.proceedsAccountId || undefined, date: v.date || undefined })} />
        </>
      )}
    </>
  ),
  details: (r) => [
    { label: "Serial number", value: r.serialNo },
    { label: "Location", value: r.location },
    { label: "Acquired", value: formatDate(r.acquisitionDate) },
    { label: "Depreciated to", value: r.lastDepreciatedPeriod },
    { label: "Disposed", value: r.disposal ? `${formatDate(r.disposal.date)} for ${money(r.disposal.proceeds)} (${r.disposal.gainOrLoss >= 0 ? "gain" : "loss"} ${money(Math.abs(r.disposal.gainOrLoss))})` : null },
  ],
  extra: (r) => <AssetDetail a={r} />,
};

const SCREENS: Record<string, MasterConfig<never>> = {
  categories: categories as unknown as MasterConfig<never>,
  register: register as unknown as MasterConfig<never>,
};

export function AssetsList({ entity }: { entity: string }) {
  const config = SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function AssetsRecord({ entity, id }: { entity: string; id: string }) {
  const config = SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}

export function DepreciationRunPage() {
  const can = useCan("assets.asset.edit");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const run = useMutation({
    mutationFn: () => post<{ total: number; categories: { categoryId: string; journalId: string | null; assets: number; amount: number }[] }>("/assets/depreciation-run", { period }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Depreciation run" subtitle="Depreciates every asset in service up to the end of the month, catching up any months missed. Running it twice does nothing the second time." />
      <section className="card p-5 flex gap-4 items-end">
        <Field label="Month"><input type="month" className="input-base" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
        {can && <button className="btn-primary" disabled={!period || run.isPending} onClick={() => run.mutate()}><CalendarClock size={15} /> Run</button>}
      </section>
      {run.data && (
        <section className="card p-5 text-sm space-y-2">
          <p className="font-semibold">Posted {money(run.data.total)}</p>
          {run.data.categories.map((c) => (
            <p key={c.categoryId}>{c.assets} asset{c.assets === 1 ? "" : "s"} · {money(c.amount)}{c.journalId ? <> · <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/finance/journals/${c.journalId}`}>journal</Link></> : null}</p>
          ))}
        </section>
      )}
    </div>
  );
}
