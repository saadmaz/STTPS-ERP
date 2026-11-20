"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";

export const REPORT_SOURCES = ["sales.order", "finance.invoice", "finance.expenseClaim", "procurement.order", "crm.lead", "tasks.task"] as const;
export const REPORT_SOURCE_LABELS: Record<string, string> = {
  "sales.order": "Sales orders", "finance.invoice": "Invoices", "finance.expenseClaim": "Expense claims",
  "procurement.order": "Purchase orders", "crm.lead": "Leads", "tasks.task": "Tasks",
};
export const REPORT_FILTER_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains"] as const;
export const REPORT_CALC_OPERATORS = ["+", "-", "*", "/"] as const;
export const REPORT_AGGREGATION_FUNCTIONS = ["sum", "avg", "count", "min", "max"] as const;

export interface ReportFilter { field: string; operator: (typeof REPORT_FILTER_OPERATORS)[number]; value: string }
export interface ReportColumn { field: string; label: string }
export interface ReportCalculatedField { name: string; label: string; left: string; op: (typeof REPORT_CALC_OPERATORS)[number]; right: string }
export interface ReportAggregation { field: string; fn: (typeof REPORT_AGGREGATION_FUNCTIONS)[number]; label: string | null }

export interface ReportDefinition extends BaseRecord {
  name: string; description: string | null; source: (typeof REPORT_SOURCES)[number];
  columns: ReportColumn[]; calculatedFields: ReportCalculatedField[]; filters: ReportFilter[];
  groupBy: string[]; aggregations: ReportAggregation[]; sortBy: string | null; sortDesc: boolean; compareField: string | null;
}

export interface ReportRunResult {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: Record<string, number>;
  previousSummary: Record<string, number> | null;
}

const opts = (values: readonly string[], labels?: Record<string, string>) => values.map((v) => ({ value: v, label: labels?.[v] ?? humanize(v) }));

export const reportsApi = {
  definitions: crud<ReportDefinition>("/reports/definitions"),
  run: (id: string) => api.get<ReportRunResult>(`/reports/definitions/${id}/run`).then((r) => r.data),
};

async function downloadExport(id: string, format: "csv" | "xlsx") {
  const res = await api.get(`/reports/definitions/${id}/export.${format}`, { responseType: "blob" });
  const url = URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = `report.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

type FilterRow = ReportFilter;
type ColumnRow = ReportColumn;
type CalcRow = ReportCalculatedField;
interface AggRow { field: string; fn: (typeof REPORT_AGGREGATION_FUNCTIONS)[number]; label: string }

function RowTable<Row>({
  rows, setRows, blank, canEdit, headers, render,
}: {
  rows: Row[];
  setRows: (rows: Row[]) => void;
  blank: () => Row;
  canEdit: boolean;
  headers: string[];
  render: (row: Row, set: (patch: Partial<Row>) => void) => React.ReactNode;
}) {
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <table className="table-base">
      <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}<th /></tr></thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {render(row, (patch) => setRow(i, patch))}
            <td>{canEdit && <button className="btn-ghost" aria-label="Remove row" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>}</td>
          </tr>
        ))}
      </tbody>
      {canEdit && (
        <tfoot><tr><td colSpan={headers.length + 1}><button className="btn-ghost" onClick={() => setRows([...rows, blank()])}><Plus size={14} /> Add row</button></td></tr></tfoot>
      )}
    </table>
  );
}

function PivotTable({ result, groupBy }: { result: ReportRunResult; groupBy: string[] }) {
  const [rowField, colField] = groupBy;
  const rowKeys = Array.from(new Set(result.rows.map((r) => String(r[rowField] ?? "")))).sort();
  const colKeys = Array.from(new Set(result.rows.map((r) => String(r[colField] ?? "")))).sort();
  const valueField = result.columns.find((c) => c.field !== rowField && c.field !== colField)?.field;
  const cell = (rk: string, ck: string) => result.rows.find((r) => String(r[rowField] ?? "") === rk && String(r[colField] ?? "") === ck)?.[valueField ?? ""];
  return (
    <table className="table-base">
      <thead><tr><th>{rowField}</th>{colKeys.map((ck) => <th key={ck}>{ck}</th>)}</tr></thead>
      <tbody>
        {rowKeys.map((rk) => (
          <tr key={rk}>
            <td className="font-medium">{rk}</td>
            {colKeys.map((ck) => <td key={ck}>{String(cell(rk, ck) ?? "—")}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RunPanel({ r }: { r: ReportDefinition }) {
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [view, setView] = useState<"table" | "pivot">("table");
  const run = useMutation({
    mutationFn: () => reportsApi.run(r.id),
    onSuccess: (res) => setResult(res),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="card p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold">Run</h2>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate()}>Run report</button>
          {result && (
            <>
              {r.groupBy.length === 2 && (
                <button className="btn-ghost" onClick={() => setView(view === "table" ? "pivot" : "table")}>{view === "table" ? "Pivot view" : "Table view"}</button>
              )}
              <button className="btn-ghost" onClick={() => downloadExport(r.id, "csv")}>Download CSV</button>
              <button className="btn-ghost" onClick={() => downloadExport(r.id, "xlsx")}>Download Excel</button>
            </>
          )}
        </div>
      </div>
      {!result && <p className="text-sm text-slate-500 dark:text-slate-400">Run the report to see results.</p>}
      {result && (
        <>
          <div className="flex gap-4 mb-3 text-sm">
            {Object.entries(result.summary).map(([k, v]) => (
              <div key={k} className="card px-3 py-2">
                <div className="text-slate-500 dark:text-slate-400">{humanize(k)}</div>
                <div className="font-semibold">{v}</div>
                {result.previousSummary && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">vs. prior period: {result.previousSummary[k] ?? 0}</div>
                )}
              </div>
            ))}
          </div>
          {view === "pivot" && r.groupBy.length === 2 ? (
            <PivotTable result={result} groupBy={r.groupBy} />
          ) : (
            <table className="table-base">
              <thead><tr>{result.columns.map((c) => <th key={c.field}>{c.label}</th>)}</tr></thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i}>{result.columns.map((c) => <td key={c.field}>{String(row[c.field] ?? "")}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

function DefinitionEditor({ r }: { r: ReportDefinition }) {
  const canEdit = useCan("analytics.reportDefinition.edit");
  const [columns, setColumns] = useState<ColumnRow[]>(r.columns);
  const [filters, setFilters] = useState<FilterRow[]>(r.filters);
  const [groupBy, setGroupBy] = useState<string>(r.groupBy.join(","));
  const [aggregations, setAggregations] = useState<AggRow[]>(r.aggregations.map((a) => ({ field: a.field, fn: a.fn, label: a.label ?? "" })));
  const [calculatedFields, setCalculatedFields] = useState<CalcRow[]>(r.calculatedFields);
  const save = useMutation({
    mutationFn: () =>
      reportsApi.definitions.update(
        r.id,
        {
          columns: columns.filter((c) => c.field), filters: filters.filter((f) => f.field),
          groupBy: groupBy.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2),
          aggregations: aggregations.filter((a) => a.field).map((a) => ({ field: a.field, fn: a.fn, label: a.label || undefined })),
          calculatedFields: calculatedFields.filter((c) => c.name),
        },
        r.version,
      ),
    onSuccess: () => toast.success("Report saved"),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <section className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Filters</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">All filters must match. Fields are paths into the source record, e.g. <code>status</code>, <code>createdAt</code>, <code>totals.total</code>.</p>
        <RowTable rows={filters} setRows={setFilters} blank={() => ({ field: "", operator: "eq", value: "" } as FilterRow)} canEdit={canEdit} headers={["Field", "Operator", "Value"]}
          render={(row, set) => (
            <>
              <td><input className="input-base" disabled={!canEdit} value={row.field} onChange={(e) => set({ field: e.target.value })} /></td>
              <td><select className="input-base" disabled={!canEdit} value={row.operator} onChange={(e) => set({ operator: e.target.value as FilterRow["operator"] })}>{REPORT_FILTER_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
              <td><input className="input-base" disabled={!canEdit} value={row.value} onChange={(e) => set({ value: e.target.value })} /></td>
            </>
          )}
        />
      </section>

      <section className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Columns</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Leave empty to show every field of the first result row.</p>
        <RowTable rows={columns} setRows={setColumns} blank={() => ({ field: "", label: "" })} canEdit={canEdit} headers={["Field", "Label"]}
          render={(row, set) => (
            <>
              <td><input className="input-base" disabled={!canEdit} value={row.field} onChange={(e) => set({ field: e.target.value })} /></td>
              <td><input className="input-base" disabled={!canEdit} value={row.label} onChange={(e) => set({ label: e.target.value })} /></td>
            </>
          )}
        />
      </section>

      <section className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Grouping and aggregation</h2>
        <div className="mb-3">
          <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Group by (up to 2 fields, comma-separated — 2 renders as a pivot)</label>
          <input className="input-base" disabled={!canEdit} value={groupBy} onChange={(e) => setGroupBy(e.target.value)} placeholder="status,ownerUserId" />
        </div>
        <RowTable rows={aggregations} setRows={setAggregations} blank={() => ({ field: "", fn: "sum", label: "" } as AggRow)} canEdit={canEdit} headers={["Field", "Function", "Label"]}
          render={(row, set) => (
            <>
              <td><input className="input-base" disabled={!canEdit} value={row.field} onChange={(e) => set({ field: e.target.value })} /></td>
              <td><select className="input-base" disabled={!canEdit} value={row.fn} onChange={(e) => set({ fn: e.target.value as AggRow["fn"] })}>{REPORT_AGGREGATION_FUNCTIONS.map((f) => <option key={f} value={f}>{f}</option>)}</select></td>
              <td><input className="input-base" disabled={!canEdit} value={row.label} onChange={(e) => set({ label: e.target.value })} /></td>
            </>
          )}
        />
      </section>

      <section className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Calculated fields</h2>
        <RowTable rows={calculatedFields} setRows={setCalculatedFields} blank={() => ({ name: "", label: "", left: "", op: "+", right: "" } as CalcRow)} canEdit={canEdit} headers={["Name", "Label", "Left", "Op", "Right"]}
          render={(row, set) => (
            <>
              <td><input className="input-base" disabled={!canEdit} value={row.name} onChange={(e) => set({ name: e.target.value })} /></td>
              <td><input className="input-base" disabled={!canEdit} value={row.label} onChange={(e) => set({ label: e.target.value })} /></td>
              <td><input className="input-base" disabled={!canEdit} value={row.left} onChange={(e) => set({ left: e.target.value })} /></td>
              <td><select className="input-base" disabled={!canEdit} value={row.op} onChange={(e) => set({ op: e.target.value as CalcRow["op"] })}>{REPORT_CALC_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
              <td><input className="input-base" disabled={!canEdit} value={row.right} onChange={(e) => set({ right: e.target.value })} /></td>
            </>
          )}
        />
        {canEdit && <div className="mt-3"><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save report definition</button></div>}
      </section>

      <RunPanel r={r} />
    </div>
  );
}

export const definitions: MasterConfig<ReportDefinition> = {
  entityType: "analytics.reportDefinition",
  permission: "analytics.reportDefinition",
  plural: "Reports",
  singular: "Report",
  description: "Pick a data source, filter, group and aggregate it, then run, export or compare to the prior period.",
  route: "/reports/definitions",
  client: reportsApi.definitions,
  defaultSort: "-createdAt",
  columns: [
    { key: "name", label: "Name" },
    { key: "source", label: "Source", render: (r) => REPORT_SOURCE_LABELS[r.source] ?? r.source },
  ],
  filters: [{ key: "source", label: "Source", options: opts(REPORT_SOURCES, REPORT_SOURCE_LABELS) }],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", wide: true },
    { key: "source", label: "Data source", type: "select", options: opts(REPORT_SOURCES, REPORT_SOURCE_LABELS), required: true },
    { key: "sortBy", label: "Sort by field", type: "text" },
    { key: "sortDesc", label: "Sort descending", type: "boolean" },
    { key: "compareField", label: "Compare field (needs a gte/lte filter on it)", type: "text" },
  ],
  title: (r) => r.name,
  subtitle: (r) => REPORT_SOURCE_LABELS[r.source] ?? r.source,
  status: (r) => (r.groupBy.length ? "grouped" : "flat"),
  details: (r) => [
    { label: "Source", value: REPORT_SOURCE_LABELS[r.source] ?? r.source },
    { label: "Filters", value: String(r.filters.length) },
    { label: "Group by", value: r.groupBy.join(", ") || "—" },
    { label: "Aggregations", value: String(r.aggregations.length) },
  ],
  extra: (r) => <DefinitionEditor r={r} />,
};

export const REPORTS_SCREENS: Record<string, MasterConfig<never>> = {
  definitions: definitions as unknown as MasterConfig<never>,
};
