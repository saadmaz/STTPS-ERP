import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { hasPermission, RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { LeadService } from "../crm/crm.services.js";
import { ExpenseClaimService } from "../finance/expenses.js";
import { InvoiceService } from "../finance/ar.services.js";
import { PurchaseOrderService } from "../procurement/procurement.services.js";
import { OrderService } from "../sales/sales.services.js";
import { TaskService } from "../tasks/tasks.services.js";
import { CreateReportDefinitionDto, UpdateReportDefinitionDto } from "./reports.dto.js";
import {
  REPORT_COLLECTIONS, ReportAggregation, ReportCalculatedField, ReportColumn, ReportDefinitionDoc, ReportFilter,
} from "./reports.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

@Injectable()
export class ReportDefinitionService extends MasterDataService<ReportDefinitionDoc, CreateReportDefinitionDto, UpdateReportDefinitionDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "analytics", entity: "reportDefinition", label: "Report", collection: REPORT_COLLECTIONS.definitions, route: "/reports/definitions",
      filterFields: ["source"], customFields: false,
    });
  }

  protected toNew(dto: CreateReportDefinitionDto): NewDoc<ReportDefinitionDoc> {
    return {
      name: dto.name, description: orNull(dto.description), source: dto.source,
      columns: (dto.columns ?? []).map((c) => ({ field: c.field, label: c.label })),
      calculatedFields: (dto.calculatedFields ?? []).map((c) => ({ name: c.name, label: c.label, left: c.left, op: c.op, right: c.right })),
      filters: (dto.filters ?? []).map((f) => ({ field: f.field, operator: f.operator, value: f.value })),
      groupBy: dto.groupBy ?? [], aggregations: (dto.aggregations ?? []).map((a) => ({ field: a.field, fn: a.fn, label: orNull(a.label) })),
      sortBy: orNull(dto.sortBy), sortDesc: dto.sortDesc ?? false, compareField: orNull(dto.compareField),
    };
  }

  protected toPatch(dto: UpdateReportDefinitionDto): Patch<ReportDefinitionDoc> {
    const { columns, calculatedFields, filters, aggregations, ...rest } = dto;
    return {
      ...rest,
      ...(columns ? { columns: columns.map((c) => ({ field: c.field, label: c.label })) } : {}),
      ...(calculatedFields ? { calculatedFields: calculatedFields.map((c) => ({ name: c.name, label: c.label, left: c.left, op: c.op, right: c.right })) } : {}),
      ...(filters ? { filters: filters.map((f) => ({ field: f.field, operator: f.operator, value: f.value })) } : {}),
      ...(aggregations ? { aggregations: aggregations.map((a) => ({ field: a.field, fn: a.fn, label: orNull(a.label) })) } : {}),
    } as Patch<ReportDefinitionDoc>;
  }

  protected searchEntry(doc: ReportDefinitionDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.source };
  }
}

export interface ReportRunResult {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: Record<string, number>;
  previousSummary: Record<string, number> | null;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Numeric when both sides parse as numbers, else lexical — so an ISO date string still orders correctly. */
function compareValues(actual: unknown, value: string): number {
  const actualNum = Number(actual);
  const valueNum = Number(value);
  if (actual !== undefined && actual !== null && value !== "" && Number.isFinite(actualNum) && Number.isFinite(valueNum)) return actualNum - valueNum;
  const actualStr = actual === undefined || actual === null ? "" : String(actual);
  return actualStr < value ? -1 : actualStr > value ? 1 : 0;
}

function evaluateFilter(f: ReportFilter, row: unknown): boolean {
  const actual = getPath(row, f.field);
  const actualStr = actual === undefined || actual === null ? "" : String(actual);
  switch (f.operator) {
    case "eq":
      return compareValues(actual, f.value) === 0;
    case "neq":
      return compareValues(actual, f.value) !== 0;
    case "gt":
      return compareValues(actual, f.value) > 0;
    case "gte":
      return compareValues(actual, f.value) >= 0;
    case "lt":
      return compareValues(actual, f.value) < 0;
    case "lte":
      return compareValues(actual, f.value) <= 0;
    case "contains":
      return actualStr.includes(f.value);
  }
}

function resolveOperand(token: string, row: unknown): number {
  const literal = Number(token);
  if (token.trim() !== "" && Number.isFinite(literal)) return literal;
  return toNumber(getPath(row, token));
}

function applyCalculated(row: Record<string, unknown>, calc: ReportCalculatedField): number {
  const left = resolveOperand(calc.left, row);
  const right = resolveOperand(calc.right, row);
  switch (calc.op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? 0 : left / right;
  }
}

function aggregateRows(rows: Record<string, unknown>[], aggregations: ReportAggregation[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const agg of aggregations) {
    const key = agg.label || `${agg.field}_${agg.fn}`;
    if (agg.fn === "count") {
      out[key] = rows.length;
      continue;
    }
    const values = rows.map((r) => toNumber(getPath(r, agg.field)));
    switch (agg.fn) {
      case "sum":
        out[key] = values.reduce((a, b) => a + b, 0);
        break;
      case "avg":
        out[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        break;
      case "min":
        out[key] = values.length ? Math.min(...values) : 0;
        break;
      case "max":
        out[key] = values.length ? Math.max(...values) : 0;
        break;
    }
  }
  return out;
}

function groupRows(rows: Record<string, unknown>[], groupBy: string[], aggregations: ReportAggregation[]): Record<string, unknown>[] {
  if (groupBy.length === 0) return rows;
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = groupBy.map((f) => String(getPath(row, f) ?? "")).join("␟");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const out: Record<string, unknown>[] = [];
  for (const groupedRows of groups.values()) {
    const base: Record<string, unknown> = {};
    for (const f of groupBy) base[f] = getPath(groupedRows[0], f) ?? null;
    out.push({ ...base, ...aggregateRows(groupedRows, aggregations), _count: groupedRows.length });
  }
  return out;
}

function sortRows(rows: Record<string, unknown>[], sortBy: string | null, desc: boolean): Record<string, unknown>[] {
  if (!sortBy) return rows;
  return [...rows].sort((a, b) => {
    const av = getPath(a, sortBy);
    const bv = getPath(b, sortBy);
    const an = Number(av);
    const bn = Number(bv);
    const cmp = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(av ?? "").localeCompare(String(bv ?? ""));
    return desc ? -cmp : cmp;
  });
}

function inferColumns(rows: Record<string, unknown>[]): ReportColumn[] {
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first).filter((k) => !k.startsWith("_")).map((k) => ({ field: k, label: k }));
}

function dateRangeOf(filters: ReportFilter[], field: string): { from: Date; to: Date } | null {
  const gte = filters.find((f) => f.field === field && f.operator === "gte");
  const lte = filters.find((f) => f.field === field && f.operator === "lte");
  if (!gte || !lte) return null;
  const from = new Date(gte.value);
  const to = new Date(lte.value);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}

interface ReportSource {
  permission: string;
  rows: (ctx: RequestContext) => Promise<Record<string, unknown>[]>;
}

/**
 * Runs a saved report definition over the source's existing data, in
 * memory: filter, calculated fields, group + aggregate, sort. Reads go
 * through `MasterDataService.reportRows()` (the same `loadAll` every small
 * list's `.list()` already uses, capped at 5,000 rows per company), so a
 * run respects nothing beyond that cap and the source's own permission —
 * never a live join to another entity, which is why `compareField` only
 * ever shifts a date range already present as filters, not a new query.
 */
@Injectable()
export class ReportingEngineService {
  private readonly sources: Record<string, ReportSource>;

  constructor(
    private readonly definitions: ReportDefinitionService,
    orders: OrderService,
    invoices: InvoiceService,
    expenseClaims: ExpenseClaimService,
    purchaseOrders: PurchaseOrderService,
    leads: LeadService,
    tasks: TaskService,
  ) {
    const asRows = <T>(service: { reportRows: (ctx: RequestContext) => Promise<T[]> }) => (ctx: RequestContext) => service.reportRows(ctx) as unknown as Promise<Record<string, unknown>[]>;
    this.sources = {
      "sales.order": { permission: "sales.order.view", rows: asRows(orders) },
      "finance.invoice": { permission: "finance.invoice.view", rows: asRows(invoices) },
      "finance.expenseClaim": { permission: "expenses.claim.view", rows: asRows(expenseClaims) },
      "procurement.order": { permission: "procurement.order.view", rows: asRows(purchaseOrders) },
      "crm.lead": { permission: "crm.lead.view", rows: asRows(leads) },
      "tasks.task": { permission: "tasks.allTasks.view", rows: asRows(tasks) },
    };
  }

  private source(key: string): ReportSource {
    const source = this.sources[key];
    if (!source) throw new NotFoundException(`Unknown report source "${key}"`);
    return source;
  }

  /** Every registered source key, for the analytics export to iterate without its own copy of this registry. */
  sourceKeys(): string[] {
    return Object.keys(this.sources);
  }

  /** The source's raw rows, permission-checked exactly like `run()`. */
  async rowsFor(ctx: RequestContext, key: string): Promise<Record<string, unknown>[]> {
    const source = this.source(key);
    if (!hasPermission(ctx, source.permission)) throw new ForbiddenException(`Permission required: ${source.permission}`);
    return source.rows(ctx);
  }

  async run(ctx: RequestContext, id: string): Promise<ReportRunResult> {
    const def = await this.definitions.repo.get(ctx, id);
    const source = this.source(def.source);
    if (!hasPermission(ctx, source.permission)) throw new ForbiddenException(`Permission required: ${source.permission}`);
    const raw = await source.rows(ctx);
    return this.execute(raw, def);
  }

  private execute(raw: Record<string, unknown>[], def: ReportDefinitionDoc): ReportRunResult {
    const filtered = raw.filter((r) => def.filters.every((f) => evaluateFilter(f, r)));
    const withCalculated = filtered.map((r) => {
      const calc: Record<string, number> = {};
      for (const c of def.calculatedFields) calc[c.name] = applyCalculated(r, c);
      return { ...r, ...calc };
    });
    const summary = aggregateRows(withCalculated, def.aggregations);
    let outRows = def.groupBy.length ? groupRows(withCalculated, def.groupBy, def.aggregations) : withCalculated;
    outRows = sortRows(outRows, def.sortBy, def.sortDesc);
    const columns = def.columns.length ? def.columns : inferColumns(outRows);

    let previousSummary: Record<string, number> | null = null;
    if (def.compareField) {
      const range = dateRangeOf(def.filters, def.compareField);
      if (range) {
        const spanMs = range.to.getTime() - range.from.getTime();
        const prevTo = new Date(range.from.getTime() - 86_400_000);
        const prevFrom = new Date(prevTo.getTime() - spanMs);
        const shifted = def.filters.map((f) => {
          if (f.field !== def.compareField) return f;
          if (f.operator === "gte") return { ...f, value: prevFrom.toISOString().slice(0, 10) };
          if (f.operator === "lte") return { ...f, value: prevTo.toISOString().slice(0, 10) };
          return f;
        });
        const prevRows = raw.filter((r) => shifted.every((f) => evaluateFilter(f, r)));
        previousSummary = aggregateRows(prevRows, def.aggregations);
      }
    }
    return { columns, rows: outRows, summary, previousSummary };
  }

  toCsv(result: ReportRunResult): string {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = result.columns.map((c) => esc(c.label)).join(",");
    const body = result.rows.map((r) => result.columns.map((c) => esc(r[c.field])).join(","));
    return [head, ...body].join("\n");
  }

  async toXlsx(result: ReportRunResult): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Report");
    sheet.addRow(result.columns.map((c) => c.label));
    for (const row of result.rows) sheet.addRow(result.columns.map((c) => row[c.field] ?? null));
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
