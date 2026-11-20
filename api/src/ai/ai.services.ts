import { Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { ApprovalsService } from "../platform/approvals/approvals.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { NotificationsService } from "../platform/notifications/notifications.service.js";
import { REPORT_SOURCES } from "../reports/reports.models.js";
import { ReportingEngineService } from "../reports/reports.services.js";

const MODEL = "claude-sonnet-5-5";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "run_report",
    description:
      "Runs an ad-hoc report over one data source the caller can see (sales orders, invoices, expense claims, purchase orders, leads or tasks): filter, group, aggregate. Use this for any question about counts, sums, totals or lists of records — e.g. overdue invoices, this month's expense claims, open leads by status, overdue tasks.",
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string", enum: [...REPORT_SOURCES], description: "The data source to read" },
        filters: {
          type: "array",
          description: "All must match (AND only)",
          items: {
            type: "object",
            properties: {
              field: { type: "string", description: "Dot path on the record, e.g. status, dueDate, totals.total" },
              operator: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "contains"] },
              value: { type: "string" },
            },
            required: ["field", "operator", "value"],
          },
        },
        groupBy: { type: "array", items: { type: "string" }, description: "Up to 2 fields to group by" },
        aggregations: {
          type: "array",
          items: {
            type: "object",
            properties: { field: { type: "string" }, fn: { type: "string", enum: ["sum", "avg", "count", "min", "max"] }, label: { type: "string" } },
            required: ["field", "fn"],
          },
        },
        sortBy: { type: "string" },
        sortDesc: { type: "boolean" },
      },
      required: ["source"],
    },
  },
  {
    name: "my_work_summary",
    description: "The caller's own approvals waiting for them, approvals they submitted, and their unread notification count. Use this for questions about 'my approvals', 'my requests' or 'what's waiting for me'.",
    input_schema: { type: "object", properties: {} },
  },
];

const SYSTEM_PROMPT =
  "You are the STTPS ERP assistant. Answer the user's question using the tools available; they already run with the asking user's own permissions, so you will only ever see data they're allowed to see — never claim to have checked something you didn't call a tool for. Keep answers short and concrete: a number, a short list, or a brief explanation. If a tool call fails (for example, a permission error), say so plainly rather than guessing.";

/**
 * Natural-language questions answered through tools that call the existing
 * permission-checked services (blueprint §28) — `run_report` reuses the
 * Report builder's engine directly, so this assistant can only ever see
 * what the asking user could already see by running a report themselves.
 */
@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger("AI");

  constructor(
    private readonly reports: ReportingEngineService,
    private readonly approvals: ApprovalsService,
    private readonly notifications: NotificationsService,
  ) {}

  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async ask(ctx: RequestContext, question: string): Promise<{ answer: string; configured: boolean }> {
    if (!this.isConfigured()) {
      return { answer: "The AI assistant isn't configured yet — ask an administrator to set ANTHROPIC_API_KEY.", configured: false };
    }
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

    for (let round = 0; round < 4; round++) {
      const response = await client.messages.create({ model: MODEL, max_tokens: 1024, system: SYSTEM_PROMPT, tools: TOOLS, messages });
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) {
        const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
        return { answer: text || "I don't have an answer for that.", configured: true };
      }
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (tu): Promise<Anthropic.ToolResultBlockParam> => ({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(await this.runTool(ctx, tu.name, tu.input as Record<string, unknown>)).slice(0, 8000),
        })),
      );
      messages.push({ role: "user", content: results });
    }
    return { answer: "I couldn't find an answer in time — try a more specific question.", configured: true };
  }

  private async runTool(ctx: RequestContext, name: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      if (name === "run_report") return await this.reports.runAdHoc(ctx, input as Parameters<ReportingEngineService["runAdHoc"]>[1]);
      if (name === "my_work_summary") {
        const [waiting, submitted, unread] = await Promise.all([
          this.approvals.waitingFor(ctx),
          this.approvals.submittedBy(ctx),
          this.notifications.unreadCount(ctx.userId),
        ]);
        return { approvalsWaiting: waiting.length, approvalsSubmitted: submitted.length, unreadNotifications: unread };
      }
      return { error: `Unknown tool "${name}"` };
    } catch (error) {
      this.logger.warn(`Tool ${name} failed: ${(error as Error).message}`);
      return { error: (error as Error).message.slice(0, 300) };
    }
  }
}
