import type { BaseDoc } from "../platform/data/repository.js";

export const REPORT_COLLECTIONS = {
  definitions: "reportDefinitions",
} as const;

/**
 * The entities a report can read from. Each key maps, in `reports.services.ts`,
 * to one already-injected MasterDataService's `reportRows()` — adding a
 * source is a two-line change there, not a new registry file.
 */
export const REPORT_SOURCES = [
  "sales.order",
  "finance.invoice",
  "finance.expenseClaim",
  "procurement.order",
  "crm.lead",
  "tasks.task",
] as const;

export const REPORT_FILTER_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains"] as const;
export const REPORT_CALC_OPERATORS = ["+", "-", "*", "/"] as const;
export const REPORT_AGGREGATION_FUNCTIONS = ["sum", "avg", "count", "min", "max"] as const;

export interface ReportFilter {
  /** Dot path into the source record, e.g. "totals.total" or "status". */
  field: string;
  operator: (typeof REPORT_FILTER_OPERATORS)[number];
  value: string;
}

export interface ReportColumn {
  field: string;
  label: string;
}

/** `left`/`right` are each a field path, or a literal number when they parse as one. */
export interface ReportCalculatedField {
  name: string;
  label: string;
  left: string;
  op: (typeof REPORT_CALC_OPERATORS)[number];
  right: string;
}

export interface ReportAggregation {
  field: string;
  fn: (typeof REPORT_AGGREGATION_FUNCTIONS)[number];
  label: string | null;
}

export interface ReportDefinitionDoc extends BaseDoc {
  name: string;
  description: string | null;
  source: (typeof REPORT_SOURCES)[number];
  columns: ReportColumn[];
  calculatedFields: ReportCalculatedField[];
  /** All filters must match (AND only). */
  filters: ReportFilter[];
  /** 0–2 fields; grouping by 2 is what the web renders as a pivot matrix. */
  groupBy: string[];
  aggregations: ReportAggregation[];
  sortBy: string | null;
  sortDesc: boolean;
  /**
   * When set, and `filters` has both a `gte` and a `lte` on this field, a run
   * also computes the same aggregation over the immediately preceding period
   * of equal length, returned as `previousSummary` (the blueprint's
   * "comparisons").
   */
  compareField: string | null;
}
