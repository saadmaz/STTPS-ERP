import { Injectable } from "@nestjs/common";
import { RequestContext } from "../platform/context/request-context.js";
import { BigQueryExporter } from "./bigquery-exporter.js";
import { ReportingEngineService } from "./reports.services.js";

export interface AnalyticsExportResult {
  source: string;
  ok: boolean;
  configured: boolean;
  inserted: number;
  error?: string;
}

/**
 * Exports each report source's current rows into BigQuery, one table per
 * tenant+source — there is no cron scheduler in this codebase yet (CLAUDE.md
 * §4), so this is the explicit "run" endpoint every other scheduled-ish job
 * here already is (payroll runs, the leave rollover, the depreciation run).
 * One source's failure (missing permission, BigQuery down) never blocks the
 * rest, the same per-item try/catch shape Automation and Dashboards use.
 */
@Injectable()
export class AnalyticsExportService {
  constructor(
    private readonly reports: ReportingEngineService,
    private readonly exporter: BigQueryExporter,
  ) {}

  async run(ctx: RequestContext, sources?: string[]): Promise<AnalyticsExportResult[]> {
    const keys = sources?.length ? sources : this.reports.sourceKeys();
    return Promise.all(
      keys.map(async (source): Promise<AnalyticsExportResult> => {
        try {
          const rows = await this.reports.rowsFor(ctx, source);
          const table = `${ctx.companyId}_${source.replace(/\./g, "_")}`;
          const result = await this.exporter.insertRows(table, rows);
          return { source, ok: true, ...result };
        } catch (error) {
          return { source, ok: false, configured: this.exporter.isConfigured(), inserted: 0, error: (error as Error).message.slice(0, 300) };
        }
      }),
    );
  }
}
