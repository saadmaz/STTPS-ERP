import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { BadRequestException, Body, Controller, HttpCode, Injectable, OnModuleInit, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from "class-validator";
import { FirestoreService } from "../firestore/firestore.service.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { validated } from "../platform/crud/master-data.controller.js";
import { fromMinor } from "../platform/data/money.js";
import { BaseDoc, NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { JobDoc, JobQueueService } from "../platform/jobs/job-queue.service.js";
import { NotificationsService } from "../platform/notifications/notifications.service.js";
import { EmailSender } from "../platform/notifications/email.sender.js";
import { CRM_COLLECTIONS } from "../crm/crm.models.js";
import { AR_COLLECTIONS, InvoiceDoc } from "./ar.models.js";
import { InvoiceLineDto } from "./ar.dto.js";
import { customer, InvoiceService, OPEN } from "./ar.services.js";
import { RunDueDto } from "./extras.js";

const today = () => new Date().toISOString().slice(0, 10);
const CURRENCY = /^[A-Z]{3}$/;

// ─── Recurring invoices ───────────────────────────────────────────────────────

export const AR_EXTRAS_COLLECTIONS = { recurringInvoices: "arRecurringInvoices" } as const;

export interface RecurringInvoiceDoc extends BaseDoc {
  code: string;
  customerId: string;
  currency: string;
  frequency: "monthly" | "quarterly" | "yearly";
  nextRunDate: string;
  endDate: string | null;
  customerReference: string | null;
  notes: string | null;
  /** Re-priced at each run, so current tax rates and product prices apply. */
  lineTemplates: InvoiceLineDto[];
  /** Post each generated invoice immediately; otherwise it is left as a draft. */
  autoPost: boolean;
  status: "active" | "paused" | "ended";
  lastInvoiceId: string | null;
  runs: number;
}

export class CreateRecurringInvoiceDto {
  @ApiProperty() @IsString() @Length(1, 30) code!: string;
  @ApiProperty() @IsString() customerId!: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @ApiProperty({ enum: ["monthly", "quarterly", "yearly"] }) @IsIn(["monthly", "quarterly", "yearly"]) frequency!: "monthly" | "quarterly" | "yearly";
  @ApiProperty({ description: "Date of the first invoice" }) @IsISO8601({ strict: true }) startDate!: string;
  @IsOptional() @IsISO8601({ strict: true }) endDate?: string;
  @IsOptional() @IsString() @MaxLength(80) customerReference?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional({ description: "Post each invoice as it is generated; defaults to true" }) @IsOptional() @IsBoolean() autoPost?: boolean;
  @ApiProperty({ type: [InvoiceLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto) lines!: InvoiceLineDto[];
}
export class UpdateRecurringInvoiceDto extends PartialType(CreateRecurringInvoiceDto) {
  @IsOptional() @IsIn(["active", "paused"]) status?: "active" | "paused";
}

/** Advances a date by one period, keeping the day of month (clamped to the shorter month). */
export function advanceInvoiceSchedule(date: string, frequency: RecurringInvoiceDoc["frequency"]): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

@Injectable()
export class RecurringInvoiceService extends MasterDataService<RecurringInvoiceDoc, CreateRecurringInvoiceDto, UpdateRecurringInvoiceDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly invoices: InvoiceService) {
    super(fs, audit, unique, {
      module: "finance", entity: "recurringInvoice", label: "Recurring invoice", collection: AR_EXTRAS_COLLECTIONS.recurringInvoices, permission: "finance.invoice",
      route: "/finance/recurring-invoices", uniqueFields: ["code"], filterFields: ["status", "customerId", "frequency"], customFields: false,
    });
  }

  protected toNew(dto: CreateRecurringInvoiceDto): NewDoc<RecurringInvoiceDoc> {
    return {
      code: dto.code, customerId: dto.customerId, currency: dto.currency ?? "LKR", frequency: dto.frequency, nextRunDate: dto.startDate.slice(0, 10),
      endDate: dto.endDate?.slice(0, 10) ?? null, customerReference: dto.customerReference ?? null, notes: dto.notes ?? null, lineTemplates: dto.lines,
      autoPost: dto.autoPost ?? true, status: "active", lastInvoiceId: null, runs: 0,
    };
  }

  protected toPatch(dto: UpdateRecurringInvoiceDto, before: RecurringInvoiceDoc): Patch<RecurringInvoiceDoc> {
    if (before.status === "ended") throw new BadRequestException("This schedule has ended");
    const { lines, startDate, endDate, ...rest } = dto;
    return {
      ...rest,
      ...(lines ? { lineTemplates: lines } : {}),
      ...(startDate ? { nextRunDate: startDate.slice(0, 10) } : {}),
      ...(endDate !== undefined ? { endDate: endDate?.slice(0, 10) ?? null } : {}),
    } as Patch<RecurringInvoiceDoc>;
  }

  /**
   * Generates every invoice due on or before `asOf` (catching up missed
   * runs). Each schedule is advanced before the invoice is drafted, so a
   * failure skips that period rather than risking a duplicate invoice on
   * retry.
   */
  async runDue(ctx: RequestContext, asOf = today()) {
    const due = (await this.repo.collection.where("companyId", "==", ctx.companyId).where("status", "==", "active").get()).docs.map((d) => d.data())
      .filter((r) => !r.archivedAt && r.nextRunDate <= asOf);
    const created: { scheduleId: string; invoiceId: string; date: string }[] = [];
    const failed: { scheduleId: string; date: string; error: string }[] = [];
    for (const r of due) {
      for (let guard = 0; guard < 60; guard++) {
        const claim = await this.firestore.runTransaction(async (tx) => {
          const cur = await this.repo.get(ctx, r.id, tx);
          if (cur.status !== "active" || cur.nextRunDate > asOf) return null;
          const next = advanceInvoiceSchedule(cur.nextRunDate, cur.frequency);
          const ended = cur.endDate !== null && next > cur.endDate;
          this.repo.applyUpdate(ctx, tx, cur, { nextRunDate: next, runs: cur.runs + 1, status: ended ? "ended" : "active" });
          return { date: cur.nextRunDate, more: !ended && next <= asOf };
        });
        if (!claim) break;
        try {
          const inv = await this.invoices.create(ctx, {
            customerId: r.customerId, date: claim.date, currency: r.currency, invoiceType: "recurring", recurringScheduleId: r.id,
            customerReference: r.customerReference ?? undefined, notes: r.notes ?? undefined, lines: r.lineTemplates,
          });
          const posted = r.autoPost ? await this.invoices.post(ctx, inv.id) : inv;
          await this.repo.update(ctx, r.id, { lastInvoiceId: posted.id });
          created.push({ scheduleId: r.id, invoiceId: posted.id, date: claim.date });
        } catch (error) {
          failed.push({ scheduleId: r.id, date: claim.date, error: error instanceof Error ? error.message : String(error) });
        }
        if (!claim.more) break;
      }
    }
    return { asOf, created, failed };
  }
}

// ─── Dunning and overdue alerts ────────────────────────────────────────────────

interface DunningLevelDef {
  level: number;
  afterDays: number;
  label: string;
}

/** Days overdue at which each reminder goes out; the highest threshold crossed wins. */
export const DUNNING_LEVELS: DunningLevelDef[] = [
  { level: 1, afterDays: 7, label: "First reminder" },
  { level: 2, afterDays: 30, label: "Second reminder" },
  { level: 3, afterDays: 60, label: "Final notice" },
];

@Injectable()
export class DunningService implements OnModuleInit {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly invoices: InvoiceService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailSender,
    private readonly jobs: JobQueueService,
  ) {}

  onModuleInit(): void {
    this.jobs.register<{ invoiceId: string; level: number }>("finance.dunningEmail", (job: JobDoc<{ invoiceId: string; level: number }>) =>
      this.sendDunningEmail(job.payload.invoiceId, job.payload.level),
    );
  }

  /**
   * Raises the dunning level on every overdue invoice that has crossed a new
   * threshold since the last check: an in-app alert to the customer's owner,
   * and a reminder email to the customer, queued as a background job.
   */
  async sendReminders(ctx: RequestContext, asOf = today()) {
    const open = (await this.invoices.repo.collection.where("companyId", "==", ctx.companyId).where("status", "in", [...OPEN]).where("kind", "==", "invoice").get())
      .docs.map((d) => d.data()).filter((d) => !d.archivedAt);
    const notified: { invoiceId: string; number: string; level: number; daysLate: number }[] = [];
    for (const inv of open) {
      const daysLate = Math.floor((Date.parse(asOf) - Date.parse(inv.dueDate)) / 86_400_000);
      if (daysLate <= 0) continue;
      const due = [...DUNNING_LEVELS].reverse().find((l) => daysLate >= l.afterDays);
      if (!due || due.level <= inv.dunningLevel) continue;
      const c = await customer(this.firestore, ctx, inv.customerId).catch(() => null);
      const raised = await this.firestore.runTransaction(async (tx) => {
        const before = await this.invoices.repo.get(ctx, inv.id, tx);
        if (before.dunningLevel >= due.level) return false;
        this.invoices.repo.applyUpdate(ctx, tx, before, { dunningLevel: due.level, lastReminderAt: new Date().toISOString() });
        if (c?.ownerUserId) {
          this.notifications.notify({
            tenantId: ctx.tenantId, companyId: ctx.companyId, userIds: [c.ownerUserId], category: "finance.invoice.overdue",
            title: `${inv.number} is ${daysLate} days overdue (${due.label})`,
            body: `${fromMinor(inv.balanceDue, inv.currency)} ${inv.currency} outstanding`,
            link: `/finance/invoices/${inv.id}`, priority: due.level >= 2 ? "high" : "normal",
            textChannel: due.level >= 2 ? "sms" : undefined,
          }, tx);
        }
        if (c?.email) this.jobs.enqueueInTx(tx, "finance.dunningEmail", { invoiceId: inv.id, level: due.level }, { id: `dunning_${inv.id}_${due.level}` });
        return true;
      });
      if (raised) notified.push({ invoiceId: inv.id, number: inv.number, level: due.level, daysLate });
    }
    return { asOf, notified };
  }

  private async sendDunningEmail(invoiceId: string, level: number): Promise<{ sent: boolean; reason?: string }> {
    const inv = (await this.firestore.collection<InvoiceDoc>(AR_COLLECTIONS.invoices).doc(invoiceId).get()).data();
    if (!inv || !OPEN.includes(inv.status as never)) return { sent: false, reason: "invoice no longer open" };
    const account = (await this.firestore.collection<{ email: string | null; name: string }>(CRM_COLLECTIONS.accounts).doc(inv.customerId).get()).data();
    if (!account?.email) return { sent: false, reason: "no customer email" };
    const due = DUNNING_LEVELS.find((l) => l.level === level);
    await this.email.send({
      to: account.email,
      subject: `${due?.label ?? "Reminder"}: ${inv.number} is overdue`,
      text: `Dear ${account.name},\n\nOur records show ${fromMinor(inv.balanceDue, inv.currency)} ${inv.currency} is still outstanding on invoice ${inv.number}, due ${inv.dueDate}. Please arrange payment at your earliest convenience.\n\nThank you.`,
    });
    return { sent: true };
  }
}

@ApiTags("Finance")
@ApiBearerAuth()
@RequireModule("finance")
@Controller("finance")
export class ArExtrasController {
  constructor(
    private readonly recurring: RecurringInvoiceService,
    private readonly dunning: DunningService,
  ) {}

  @Post("recurring-invoices/run-due")
  @HttpCode(200)
  @RequirePermission("finance.invoice.edit")
  @ApiOperation({ summary: "Generate recurring invoices that are due (catching up missed runs)" })
  runDue(@Ctx() ctx: RequestContext, @Body(validated(RunDueDto)) dto: RunDueDto) {
    return this.recurring.runDue(ctx, dto.asOf?.slice(0, 10));
  }

  @Post("receivables/send-reminders")
  @HttpCode(200)
  @RequirePermission("finance.invoice.edit")
  @ApiOperation({ summary: "Alert owners and email customers for invoices newly crossing a dunning threshold" })
  sendReminders(@Ctx() ctx: RequestContext, @Body(validated(RunDueDto)) dto: RunDueDto) {
    return this.dunning.sendReminders(ctx, dto.asOf?.slice(0, 10));
  }
}
