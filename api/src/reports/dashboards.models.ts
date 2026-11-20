import type { BaseDoc } from "../platform/data/repository.js";

export const DASHBOARD_COLLECTIONS = {
  kpis: "kpiDefinitions",
  dashboards: "dashboards",
} as const;

export const KPI_DIRECTIONS = ["higher_is_better", "lower_is_better"] as const;
export type KpiStatus = "ok" | "warning" | "critical" | "unknown";

/** A KPI is a named, tracked read of one report's summary field, with a target and thresholds. */
export interface KpiDefinitionDoc extends BaseDoc {
  name: string;
  description: string | null;
  reportId: string;
  /** Key into the report run's `summary` (or `previousSummary`) map, e.g. "count" or "total_sum". */
  metric: string;
  target: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  direction: (typeof KPI_DIRECTIONS)[number];
  ownerUserId: string | null;
  /** Descriptive only ("daily", "weekly", "monthly", …) — there is no scheduler to act on this. */
  frequency: string | null;
}

export const DASHBOARD_WIDGET_TYPES = ["kpi", "report_table", "report_chart", "report_pivot", "alerts"] as const;
export const DASHBOARD_CHART_TYPES = ["bar", "line", "pie"] as const;

export interface DashboardWidget {
  id: string;
  type: (typeof DASHBOARD_WIDGET_TYPES)[number];
  title: string;
  kpiId: string | null;
  reportId: string | null;
  chartType: (typeof DASHBOARD_CHART_TYPES)[number] | null;
  /** "alerts" widgets only; blank shows every unread notification. */
  alertCategory: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardDoc extends BaseDoc {
  name: string;
  description: string | null;
  widgets: DashboardWidget[];
  /**
   * A hint for the web's "My dashboards"/"Shared" split, not a real access
   * boundary — this codebase has no record-level scope yet (CLAUDE.md §10),
   * so anyone holding `analytics.dashboard.view` can already see every
   * dashboard in the company regardless of this flag.
   */
  shared: boolean;
  ownerUserId: string;
}
