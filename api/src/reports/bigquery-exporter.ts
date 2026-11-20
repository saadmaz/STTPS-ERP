import { Injectable, Logger } from "@nestjs/common";
import { BigQuery } from "@google-cloud/bigquery";

/**
 * Streams rows into a BigQuery table when `BIGQUERY_DATASET` is set
 * (`GOOGLE_CLOUD_PROJECT`/application-default credentials provide the
 * project and auth, the same way every other `@google-cloud/*` client in
 * this codebase would); otherwise logs and no-ops, which is what
 * development and tests want — exactly `EmailSender`'s pattern for an
 * external, optionally-configured integration.
 */
@Injectable()
export class BigQueryExporter {
  private readonly logger = new Logger("Analytics");
  private client: BigQuery | null = null;

  private bigquery(): BigQuery | null {
    if (!process.env.BIGQUERY_DATASET) return null;
    if (!this.client) this.client = new BigQuery();
    return this.client;
  }

  isConfigured(): boolean {
    return !!process.env.BIGQUERY_DATASET;
  }

  /** `table` is namespaced by tenant and source so one dataset can hold every company's export. */
  async insertRows(table: string, rows: Record<string, unknown>[]): Promise<{ configured: boolean; inserted: number }> {
    const bigquery = this.bigquery();
    if (!bigquery) {
      this.logger.debug(`(BigQuery export not configured) table=${table} rows=${rows.length}`);
      return { configured: false, inserted: 0 };
    }
    if (rows.length === 0) return { configured: true, inserted: 0 };
    const dataset = bigquery.dataset(process.env.BIGQUERY_DATASET!);
    const [exists] = await dataset.table(table).exists();
    if (!exists) await dataset.createTable(table, { schema: { fields: [{ name: "data", type: "JSON" }, { name: "exportedAt", type: "TIMESTAMP" }] } });
    const now = new Date().toISOString();
    await dataset.table(table).insert(rows.map((r) => ({ data: JSON.stringify(r), exportedAt: now })));
    return { configured: true, inserted: rows.length };
  }
}
