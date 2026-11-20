"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ReportRunResult, reportsApi } from "./config";

export const KPI_DIRECTIONS = ["higher_is_better", "lower_is_better"] as const;
export const DASHBOARD_WIDGET_TYPES = ["kpi", "report_table", "report_chart", "report_pivot", "alerts"] as const;
export const DASHBOARD_CHART_TYPES = ["bar", "line", "pie"] as const;
const CHART_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899"];

export interface KpiDefinition extends BaseRecord {
  name: string; description: string | null; reportId: string; metric: string;
  target: number | null; warningThreshold: number | null; criticalThreshold: number | null;
  direction: (typeof KPI_DIRECTIONS)[number]; ownerUserId: string | null; frequency: string | null;
}

export interface DashboardWidget {
  id: string; type: (typeof DASHBOARD_WIDGET_TYPES)[number]; title: string;
  kpiId: string | null; reportId: string | null; chartType: (typeof DASHBOARD_CHART_TYPES)[number] | null;
  alertCategory: string | null; x: number; y: number; w: number; h: number;
}

export interface Dashboard extends BaseRecord {
  name: string; description: string | null; widgets: DashboardWidget[]; shared: boolean; ownerUserId: string;
}

export interface KpiResult {
  name: string; value: number | null; status: "ok" | "warning" | "critical" | "unknown";
  target: number | null; warningThreshold: number | null; criticalThreshold: number | null; direction: string;
}
interface AlertNotification { id: string; title: string; body: string | null; priority: string }
type WidgetResult =
  | { id: string; type: "kpi"; data: KpiResult | null; error?: string }
  | { id: string; type: "alerts"; data: AlertNotification[] | null; error?: string }
  | { id: string; type: "report_table" | "report_chart" | "report_pivot"; data: ReportRunResult | null; error?: string };

export const kpisApi = {
  definitions: crud<KpiDefinition>("/reports/kpis"),
  run: (id: string) => api.get<KpiResult>(`/reports/kpis/${id}/run`).then((r) => r.data),
};
export const dashboardsApi = {
  definitions: crud<Dashboard>("/reports/dashboards"),
  run: (id: string) => api.get<{ dashboard: Dashboard; widgets: WidgetResult[] }>(`/reports/dashboards/${id}/run`).then((r) => r.data),
};

const reportOptions = { queryKey: ["report-options"], load: () => reportsApi.definitions.list({ limit: 200 }).then((p) => p.items.map((r) => ({ value: r.id, label: r.name }))) };
const kpiOptions = { queryKey: ["kpi-options"], load: () => kpisApi.definitions.list({ limit: 200 }).then((p) => p.items.map((k) => ({ value: k.id, label: k.name }))) };

const STATUS_COLOR: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400", warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400", unknown: "text-slate-500 dark:text-slate-400",
};

function KpiCard({ data }: { data: KpiResult | null }) {
  if (!data) return <p className="text-sm text-slate-500 dark:text-slate-400">No data.</p>;
  return (
    <div>
      <div className={`text-3xl font-semibold ${STATUS_COLOR[data.status]}`}>{data.value ?? "—"}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        {data.target != null && <>Target: {data.target} · </>}
        Status: {humanize(data.status)}
      </div>
    </div>
  );
}

function chartRows(result: ReportRunResult): { name: string; value: number }[] {
  const nameField = result.columns[0]?.field;
  const valueField = result.columns.find((c) => c.field !== nameField)?.field ?? nameField;
  if (!nameField) return [];
  return result.rows.map((r) => ({ name: String(r[nameField] ?? ""), value: Number(r[valueField ?? nameField] ?? 0) }));
}

function WidgetChart({ result, chartType }: { result: ReportRunResult; chartType: (typeof DASHBOARD_CHART_TYPES)[number] | null }) {
  const rows = chartRows(result);
  if (rows.length === 0) return <p className="text-sm text-slate-500 dark:text-slate-400">No data.</p>;
  if (chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" outerRadius={80}>
            {rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" /><YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" /><YAxis />
        <Tooltip />
        <Bar dataKey="value" fill={CHART_COLORS[0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function WidgetTable({ result }: { result: ReportRunResult }) {
  return (
    <table className="table-base">
      <thead><tr>{result.columns.map((c) => <th key={c.field}>{c.label}</th>)}</tr></thead>
      <tbody>{result.rows.slice(0, 20).map((row, i) => <tr key={i}>{result.columns.map((c) => <td key={c.field}>{String(row[c.field] ?? "")}</td>)}</tr>)}</tbody>
    </table>
  );
}

function WidgetPivot({ result }: { result: ReportRunResult }) {
  return <WidgetTable result={result} />; // same grouped rows; a true 2-axis matrix lives in the report's own record page
}

function WidgetBody({ widget, result }: { widget: DashboardWidget; result: WidgetResult }) {
  if (result.error) return <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>;
  if (result.type === "kpi") return <KpiCard data={result.data} />;
  if (result.type === "alerts") {
    const items = result.data ?? [];
    if (items.length === 0) return <p className="text-sm text-slate-500 dark:text-slate-400">No unread alerts.</p>;
    return <ul className="text-sm space-y-1">{items.map((n) => <li key={n.id} className="truncate">{n.title}</li>)}</ul>;
  }
  if (!result.data) return <p className="text-sm text-slate-500 dark:text-slate-400">No data.</p>;
  if (result.type === "report_chart") return <WidgetChart result={result.data} chartType={widget.chartType} />;
  if (result.type === "report_pivot") return <WidgetPivot result={result.data} />;
  return <WidgetTable result={result.data} />;
}

export function DashboardViewer({ id }: { id: string }) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["dashboard-run", id], queryFn: () => dashboardsApi.run(id) });
  if (isLoading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;
  if (!data) return null;
  const byId = new Map(data.widgets.map((w) => [w.id, w]));
  return (
    <div>
      <div className="flex justify-end mb-2"><button className="btn-ghost" onClick={() => refetch()}>Refresh</button></div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
        {data.dashboard.widgets.map((w) => (
          <div key={w.id} className="card p-3 overflow-x-auto" style={{ gridColumn: `span ${Math.min(w.w, 6)}`, gridRow: `span ${w.h}` }}>
            <div className="font-medium text-sm mb-2">{w.title}</div>
            {byId.has(w.id) ? <WidgetBody widget={w} result={byId.get(w.id)!} /> : <p className="text-sm text-slate-500 dark:text-slate-400">No data.</p>}
          </div>
        ))}
        {data.dashboard.widgets.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No widgets yet — add some below.</p>}
      </div>
    </div>
  );
}

const blankWidget = (): DashboardWidget => ({ id: `w${Date.now()}`, type: "kpi", title: "", kpiId: null, reportId: null, chartType: "bar", alertCategory: null, x: 0, y: 0, w: 2, h: 2 });

function WidgetEditor({ d }: { d: Dashboard }) {
  const canEdit = useCan("analytics.dashboard.edit");
  const [widgets, setWidgets] = useState<DashboardWidget[]>(d.widgets.length ? d.widgets : []);
  const { data: reportOpts = [] } = useQuery({ queryKey: reportOptions.queryKey, queryFn: reportOptions.load });
  const { data: kpiOpts = [] } = useQuery({ queryKey: kpiOptions.queryKey, queryFn: kpiOptions.load });
  const save = useMutation({
    mutationFn: () => dashboardsApi.definitions.update(d.id, { widgets: widgets.filter((w) => w.title) }, d.version),
    onSuccess: () => toast.success("Dashboard saved"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setWidget = (i: number, patch: Partial<DashboardWidget>) => setWidgets((prev) => prev.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));

  return (
    <section className="card p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Widgets</h2>
        {canEdit && <button className="btn-ghost" onClick={() => setWidgets((prev) => [...prev, blankWidget()])}><Plus size={14} /> Add widget</button>}
      </div>
      <table className="table-base">
        <thead><tr><th>Title</th><th>Type</th><th>Source</th><th>Chart</th><th>X</th><th>Y</th><th>W</th><th>H</th><th /></tr></thead>
        <tbody>
          {widgets.map((w, i) => (
            <tr key={w.id}>
              <td><input className="input-base" disabled={!canEdit} value={w.title} onChange={(e) => setWidget(i, { title: e.target.value })} /></td>
              <td>
                <select className="input-base" disabled={!canEdit} value={w.type} onChange={(e) => setWidget(i, { type: e.target.value as DashboardWidget["type"] })}>
                  {DASHBOARD_WIDGET_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
                </select>
              </td>
              <td>
                {w.type === "kpi" ? (
                  <select className="input-base" disabled={!canEdit} value={w.kpiId ?? ""} onChange={(e) => setWidget(i, { kpiId: e.target.value || null })}>
                    <option value="">Select a KPI</option>
                    {kpiOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : w.type === "alerts" ? (
                  <input className="input-base" disabled={!canEdit} placeholder="category (optional)" value={w.alertCategory ?? ""} onChange={(e) => setWidget(i, { alertCategory: e.target.value || null })} />
                ) : (
                  <select className="input-base" disabled={!canEdit} value={w.reportId ?? ""} onChange={(e) => setWidget(i, { reportId: e.target.value || null })}>
                    <option value="">Select a report</option>
                    {reportOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </td>
              <td>
                {w.type === "report_chart" && (
                  <select className="input-base" disabled={!canEdit} value={w.chartType ?? "bar"} onChange={(e) => setWidget(i, { chartType: e.target.value as DashboardWidget["chartType"] })}>
                    {DASHBOARD_CHART_TYPES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
                  </select>
                )}
              </td>
              <td><input className="input-base w-14" type="number" disabled={!canEdit} value={w.x} onChange={(e) => setWidget(i, { x: Number(e.target.value) || 0 })} /></td>
              <td><input className="input-base w-14" type="number" disabled={!canEdit} value={w.y} onChange={(e) => setWidget(i, { y: Number(e.target.value) || 0 })} /></td>
              <td><input className="input-base w-14" type="number" disabled={!canEdit} value={w.w} onChange={(e) => setWidget(i, { w: Number(e.target.value) || 1 })} /></td>
              <td><input className="input-base w-14" type="number" disabled={!canEdit} value={w.h} onChange={(e) => setWidget(i, { h: Number(e.target.value) || 1 })} /></td>
              <td>{canEdit && <button className="btn-ghost" aria-label="Remove widget" onClick={() => setWidgets((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">X/Y/W/H lay widgets out on a 6-column grid (column position, row position, width, height in columns/rows).</p>
      {canEdit && <div className="mt-3"><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save widgets</button></div>}
    </section>
  );
}

export const dashboardDefinitions: MasterConfig<Dashboard> = {
  entityType: "analytics.dashboard",
  permission: "analytics.dashboard",
  plural: "Dashboards",
  singular: "Dashboard",
  description: "Arrange KPI cards, report tables, charts, pivots and alerts on a grid.",
  route: "/reports/dashboards",
  client: dashboardsApi.definitions,
  defaultSort: "-createdAt",
  columns: [{ key: "name", label: "Name" }, { key: "shared", label: "Visibility", render: (r) => (r.shared ? "Shared" : "Private") }],
  filters: [{ key: "shared", label: "Visibility", options: [{ value: "true", label: "Shared" }, { value: "false", label: "Private" }] }],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", wide: true },
    { key: "shared", label: "Shared with the company", type: "boolean" },
  ],
  title: (r) => r.name,
  subtitle: (r) => (r.shared ? "Shared" : "Private"),
  details: (r) => [{ label: "Widgets", value: String(r.widgets.length) }, { label: "Visibility", value: r.shared ? "Shared" : "Private" }],
  extra: (r) => (
    <div className="space-y-4">
      <section className="card p-4"><h2 className="font-semibold mb-3">Live view</h2><DashboardViewer id={r.id} /></section>
      <WidgetEditor d={r} />
    </div>
  ),
};

function KpiRunPanel({ k }: { k: KpiDefinition }) {
  const run = useMutation({ mutationFn: () => kpisApi.run(k.id), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Live value</h2>
        <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate()}>Run</button>
      </div>
      {run.data ? <KpiCard data={run.data} /> : <p className="text-sm text-slate-500 dark:text-slate-400">Run to see the current value.</p>}
    </section>
  );
}

export const kpiDefinitions: MasterConfig<KpiDefinition> = {
  entityType: "analytics.kpiDefinition",
  permission: "analytics.kpiDefinition",
  plural: "KPIs",
  singular: "KPI",
  description: "A tracked metric read from one report's summary, with a target and warning/critical thresholds.",
  route: "/reports/kpis",
  client: kpisApi.definitions,
  defaultSort: "-createdAt",
  columns: [{ key: "name", label: "Name" }, { key: "metric", label: "Metric" }],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", wide: true },
    { key: "reportId", label: "Report", type: "reference", reference: reportOptions, required: true },
    { key: "metric", label: "Metric key (from the report's summary)", type: "text", required: true },
    { key: "target", label: "Target", type: "number" },
    { key: "warningThreshold", label: "Warning threshold", type: "number" },
    { key: "criticalThreshold", label: "Critical threshold", type: "number" },
    { key: "direction", label: "Direction", type: "select", options: KPI_DIRECTIONS.map((d) => ({ value: d, label: humanize(d) })) },
    { key: "ownerUserId", label: "Owner", type: "user" },
    { key: "frequency", label: "Frequency (descriptive only)", type: "text" },
  ],
  title: (r) => r.name,
  subtitle: (r) => r.metric,
  details: (r) => [
    { label: "Report id", value: r.reportId }, { label: "Target", value: r.target != null ? String(r.target) : null },
    { label: "Warning below/above", value: r.warningThreshold != null ? String(r.warningThreshold) : null },
    { label: "Critical below/above", value: r.criticalThreshold != null ? String(r.criticalThreshold) : null },
  ],
  extra: (r) => <KpiRunPanel k={r} />,
};

export const DASHBOARD_SCREENS: Record<string, MasterConfig<never>> = {
  kpis: kpiDefinitions as unknown as MasterConfig<never>,
  dashboards: dashboardDefinitions as unknown as MasterConfig<never>,
};
