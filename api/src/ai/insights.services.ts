import { Injectable } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { RequestContext } from "../platform/context/request-context.js";
import { ReportingEngineService } from "../reports/reports.services.js";

const MODEL = "claude-sonnet-5-5";

export interface Insight {
  type: "sales_decline" | "expense_anomaly";
  severity: "info" | "warning";
  message: string;
  data: Record<string, unknown>;
}

function monthOf(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 7) : "";
}

/**
 * Deterministic insight detection over the same sources the Report builder
 * already reads (reused via `ReportingEngineService.rowsFor()`, so the same
 * permission check applies) — the arithmetic itself never calls Claude, only
 * the optional one-paragraph narration does, so insight detection stays
 * testable and cheap even when no API key is configured.
 */
@Injectable()
export class InsightsService {
  constructor(private readonly reports: ReportingEngineService) {}

  async run(ctx: RequestContext): Promise<{ insights: Insight[]; summary: string }> {
    const insights = [...(await this.salesDecline(ctx)), ...(await this.expenseAnomalies(ctx))];
    return { insights, summary: await this.narrate(insights) };
  }

  private async salesDecline(ctx: RequestContext): Promise<Insight[]> {
    const orders = await this.reports.rowsFor(ctx, "sales.order");
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
    const sumFor = (ym: string) =>
      orders
        .filter((o) => monthOf(o.createdAt) === ym)
        .reduce((a, o) => a + (((o.totals as Record<string, unknown> | undefined)?.total as number) ?? 0), 0);
    const current = sumFor(thisMonth);
    const previous = sumFor(lastMonth);
    if (previous > 0 && current < previous * 0.85) {
      const pct = Math.round((1 - current / previous) * 100);
      return [{ type: "sales_decline", severity: "warning", message: `Sales orders this month are down ${pct}% from last month.`, data: { current, previous } }];
    }
    return [];
  }

  private async expenseAnomalies(ctx: RequestContext): Promise<Insight[]> {
    const claims = await this.reports.rowsFor(ctx, "finance.expenseClaim");
    if (claims.length < 3) return [];
    const totals = claims.map((c) => (c.total as number) ?? 0);
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    if (avg <= 0) return [];
    return claims
      .filter((c) => ((c.total as number) ?? 0) > avg * 2.5)
      .map((c) => ({
        type: "expense_anomaly" as const,
        severity: "info" as const,
        message: `Expense claim "${c.title}" (${c.number}) is ${(((c.total as number) ?? 0) / avg).toFixed(1)}x the average claim amount.`,
        data: { claimId: c.id, total: c.total, average: avg },
      }));
  }

  private async narrate(insights: Insight[]): Promise<string> {
    if (insights.length === 0) return "No notable insights right now.";
    const fallback = insights.map((i) => i.message).join(" ");
    if (!process.env.ANTHROPIC_API_KEY) return fallback;
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: MODEL, max_tokens: 300,
        messages: [{ role: "user", content: `Summarize these business insights in 2-3 short sentences for a manager:\n${insights.map((i) => `- ${i.message}`).join("\n")}` }],
      });
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ");
      return text || fallback;
    } catch {
      return fallback;
    }
  }
}
