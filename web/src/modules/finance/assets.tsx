"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { ArrowRightLeft, CalendarClock, LogIn, LogOut, PackageCheck, QrCode, SearchX, TrendingDown, Trash2, Undo2 } from "lucide-react";
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
  warrantyExpiryDate: string | null;
  condition: "excellent" | "good" | "fair" | "poor";
  checkedOutTo: string | null;
  checkedOutAt: string | null;
  dueBackDate: string | null;
  isMissing: boolean;
  missingSince: string | null;
}
interface AssetAudit extends BaseRecord {
  name: string;
  scheduledDate: string;
  status: "planning" | "in_progress" | "completed";
  findings: { assetId: string; result: "found" | "missing" | "damaged"; notes: string | null; recordedAt: string }[];
  completedAt: string | null;
  notes: string | null;
}
interface Repair extends BaseRecord {
  assetId: string;
  reportedDate: string;
  description: string;
  cost: number | null;
  status: "reported" | "in_progress" | "completed";
  completedDate: string | null;
  notes: string | null;
}

const assetsApi = {
  categories: crud<Category>("/assets/categories"),
  register: crud<Asset>("/assets/register"),
  audits: crud<AssetAudit>("/assets/audits"),
  repairs: crud<Repair>("/assets/repairs"),
};
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

function QrLabel({ asset }: { asset: Asset }) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (open && canvasRef.current) QRCode.toCanvas(canvasRef.current, asset.code, { width: 180, margin: 1 }).catch(() => undefined);
  }, [open, asset.code]);
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><QrCode size={15} /> QR label</button>
      <ConfirmDialog open={open} title="QR label" confirmLabel="Done" onConfirm={() => setOpen(false)} onClose={() => setOpen(false)}>
        <div className="flex flex-col items-center gap-2 print:gap-1">
          <canvas ref={canvasRef} />
          <p className="font-mono text-sm">{asset.code}</p>
          <p className="text-sm">{asset.name}</p>
          <button className="btn-secondary mt-2 print:hidden" onClick={() => window.print()}>Print</button>
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
    { key: "warrantyExpiryDate", label: "Warranty expires", type: "date" },
    { key: "condition", label: "Condition", type: "select", options: opts(["excellent", "good", "fair", "poor"]) },
  ],
  title: (r) => `${r.code} ${r.name}`,
  subtitle: (r) => `${money(r.bookValue)} book value · ${humanize(r.method)}`,
  status: (r) => (r.isMissing ? "missing" : r.status),
  editable: (r) => r.status !== "disposed",
  actions: (r, refresh) => (
    <>
      <QrLabel asset={r} />
      {r.status !== "disposed" && !r.isMissing && (r.checkedOutTo ? (
        <DialogAction label="Check in" icon={LogIn} permission="assets.asset.edit" path={`/assets/register/${r.id}/check-in`} onDone={refresh}
          fields={[{ key: "condition", label: "Condition now (optional)", kind: "text" }, { key: "notes", label: "Notes", kind: "text" }]}
          toBody={(v) => ({ condition: v.condition || undefined, notes: v.notes || undefined })} />
      ) : (
        <DialogAction label="Check out" icon={LogOut} permission="assets.asset.edit" path={`/assets/register/${r.id}/check-out`} onDone={refresh}
          fields={[{ key: "to", label: "Lent to (user or employee id)", kind: "text" }, { key: "dueBackDate", label: "Due back", kind: "date" }]}
          toBody={(v) => ({ to: v.to, dueBackDate: v.dueBackDate || undefined })} />
      ))}
      {r.status !== "disposed" && (r.isMissing ? (
        <DialogAction label="Recover" icon={Undo2} permission="assets.asset.edit" path={`/assets/register/${r.id}/recover`} onDone={refresh} fields={[]} toBody={() => ({})} />
      ) : (
        <DialogAction label="Report missing" icon={SearchX} permission="assets.asset.edit" path={`/assets/register/${r.id}/report-missing`} onDone={refresh} danger
          fields={[{ key: "notes", label: "Notes", kind: "text" }]} toBody={(v) => ({ notes: v.notes || undefined })} />
      ))}
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
    { label: "Condition", value: humanize(r.condition) },
    { label: "Warranty expires", value: r.warrantyExpiryDate ? formatDate(r.warrantyExpiryDate) : null },
    { label: "Checked out to", value: r.checkedOutTo ? `${r.checkedOutTo}${r.dueBackDate ? ` · due back ${formatDate(r.dueBackDate)}` : ""}` : null },
    { label: "Missing since", value: r.missingSince ? formatDate(r.missingSince) : null },
    { label: "Acquired", value: formatDate(r.acquisitionDate) },
    { label: "Depreciated to", value: r.lastDepreciatedPeriod },
    { label: "Disposed", value: r.disposal ? `${formatDate(r.disposal.date)} for ${money(r.disposal.proceeds)} (${r.disposal.gainOrLoss >= 0 ? "gain" : "loss"} ${money(Math.abs(r.disposal.gainOrLoss))})` : null },
  ],
  extra: (r) => <AssetDetail a={r} />,
};

const assetRef = {
  queryKey: ["options", "assets.register"],
  load: async () => (await assetsApi.register.list({ limit: 500 })).items.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
};

function AddFinding({ audit, refresh }: { audit: AssetAudit; refresh: (a: AssetAudit) => void }) {
  const can = useCan("assets.audit.edit");
  const assets = useQuery({ queryKey: assetRef.queryKey, queryFn: assetRef.load });
  const [open, setOpen] = useState(false);
  const [assetId, setAssetId] = useState("");
  const [result, setResult] = useState<"found" | "missing" | "damaged">("found");
  const [notes, setNotes] = useState("");
  const run = useMutation({
    mutationFn: () => post<AssetAudit>(`/assets/audits/${audit.id}/findings`, { assetId, result, notes: notes || undefined }),
    onSuccess: (a) => { setOpen(false); setAssetId(""); setNotes(""); toast.success("Recorded"); refresh(a); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || audit.status === "completed") return null;
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Record a finding</button>
      <ConfirmDialog open={open} title="Record a count result" confirmLabel="Save" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Asset" required>
            <select className="input-base" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">Choose…</option>
              {assets.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Result">
            <select className="input-base" value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
              {["found", "missing", "damaged"].map((v) => <option key={v} value={v}>{humanize(v)}</option>)}
            </select>
          </Field>
          <Field label="Notes"><input className="input-base" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function CompleteAudit({ audit, refresh }: { audit: AssetAudit; refresh: (a: AssetAudit) => void }) {
  const can = useCan("assets.audit.edit");
  const run = useMutation({
    mutationFn: () => post<AssetAudit>(`/assets/audits/${audit.id}/complete`),
    onSuccess: (a) => { toast.success("Audit completed"); refresh(a); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || audit.status === "completed") return null;
  return <button className="btn-ghost" disabled={run.isPending} onClick={() => run.mutate()}>Complete audit</button>;
}

function AuditFindings({ audit }: { audit: AssetAudit }) {
  const [current, setCurrent] = useState(audit);
  return (
    <section className="card overflow-x-auto">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="font-semibold">Findings</h2>
        <div className="flex gap-2"><AddFinding audit={current} refresh={setCurrent} /><CompleteAudit audit={current} refresh={setCurrent} /></div>
      </div>
      <table className="table-base">
        <thead><tr><th>Asset</th><th>Result</th><th>Notes</th><th>When</th></tr></thead>
        <tbody>
          {current.findings.map((f, i) => <tr key={i}><td>{f.assetId}</td><td><StatusBadge status={f.result} /></td><td>{f.notes}</td><td>{formatDate(f.recordedAt)}</td></tr>)}
          {current.findings.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-6">No findings recorded yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

const audits: MasterConfig<AssetAudit> = {
  entityType: "assets.audit",
  permission: "assets.audit",
  plural: "Asset audits",
  singular: "Audit",
  description: "A physical count of assets. Record a finding for each asset checked; a missing or recovered result updates the asset itself.",
  route: "/assets/audits",
  client: assetsApi.audits,
  defaultSort: "-scheduledDate",
  columns: [
    { key: "name", label: "Name" },
    { key: "scheduledDate", label: "Scheduled", render: (r) => formatDate(r.scheduledDate) },
    { key: "findings", label: "Findings", render: (r) => r.findings.length },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["planning", "in_progress", "completed"]) }],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "scheduledDate", label: "Scheduled date", type: "date", required: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => r.name,
  subtitle: (r) => formatDate(r.scheduledDate),
  status: (r) => r.status,
  editable: (r) => r.status !== "completed",
  extra: (r) => <AuditFindings audit={r} />,
};

function CompleteRepair({ repair, refresh }: { repair: Repair; refresh: (r: Repair) => void }) {
  const can = useCan("assets.repair.edit");
  const [open, setOpen] = useState(false);
  const [completedDate, setCompletedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState("");
  const run = useMutation({
    mutationFn: () => post<Repair>(`/assets/repairs/${repair.id}/complete`, { completedDate, cost: cost || undefined }),
    onSuccess: (r) => { setOpen(false); toast.success("Repair completed"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || repair.status === "completed") return null;
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Complete</button>
      <ConfirmDialog open={open} title="Complete this repair" confirmLabel="Save" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Completed on"><input type="date" className="input-base" value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} /></Field>
          <Field label="Final cost (optional)"><input className="input-base" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="8500.00" /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

const repairs: MasterConfig<Repair> = {
  entityType: "assets.repair",
  permission: "assets.repair",
  plural: "Repairs",
  singular: "Repair",
  description: "A lightweight repair log against an asset.",
  route: "/assets/repairs",
  client: assetsApi.repairs,
  defaultSort: "-reportedDate",
  columns: [
    { key: "assetId", label: "Asset" },
    { key: "description", label: "Description" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["reported", "in_progress", "completed"]) }],
  fields: [
    { key: "assetId", label: "Asset", type: "reference", reference: assetRef, required: true, createOnly: true },
    { key: "reportedDate", label: "Reported date", type: "date", required: true, createOnly: true },
    { key: "description", label: "Description", type: "text", required: true },
    { key: "cost", label: "Estimated cost", type: "text" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => r.description,
  subtitle: (r) => formatDate(r.reportedDate),
  status: (r) => r.status,
  editable: (r) => r.status !== "completed",
  actions: (r, refresh) => <CompleteRepair repair={r} refresh={refresh} />,
  details: (r) => [{ label: "Cost", value: r.cost !== null ? money(r.cost) : null }, { label: "Completed", value: r.completedDate ? formatDate(r.completedDate) : null }],
};

const SCREENS: Record<string, MasterConfig<never>> = {
  categories: categories as unknown as MasterConfig<never>,
  register: register as unknown as MasterConfig<never>,
  audits: audits as unknown as MasterConfig<never>,
  repairs: repairs as unknown as MasterConfig<never>,
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
