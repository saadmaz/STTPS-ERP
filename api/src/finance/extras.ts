import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { BadRequestException, Body, Controller, Get, Header, HttpCode, Injectable, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, ArrayMaxSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, Length, MaxLength, ValidateNested } from "class-validator";
import { FirestoreService } from "../firestore/firestore.service.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { validated } from "../platform/crud/master-data.controller.js";
import { toMinor } from "../platform/data/money.js";
import { BaseDoc, NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { ExchangeRateService } from "../org/org.services.js";
import { AccountDoc, EntryDoc, FINANCE_COLLECTIONS, JournalDoc, JournalLine } from "./finance.models.js";
import { JournalLineDto } from "./finance.dto.js";
import { AR_COLLECTIONS, InvoiceDoc } from "./ar.models.js";
import { AP_COLLECTIONS, BillDoc } from "./ap.models.js";
import { toBase } from "./ar.services.js";
import { FinanceReportsService } from "./finance.services.js";
import { GeneralLedger, LineInput } from "./ledger.service.js";

const today = () => new Date().toISOString().slice(0, 10);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v?: string) => {
  if (v === undefined || v === "") return undefined;
  if (!DAY.test(v)) throw new BadRequestException("Dates look like 2026-11-30");
  return v;
};

// ─── Recurring journals ───────────────────────────────────────────────────────

export interface RecurringJournalDoc extends BaseDoc {
  code: string;
  name: string;
  frequency: "monthly" | "quarterly" | "yearly";
  nextRunDate: string;
  endDate: string | null;
  memo: string | null;
  lines: JournalLine[];
  status: "active" | "paused" | "ended";
  lastJournalId: string | null;
  runs: number;
}

export class CreateRecurringJournalDto {
  @ApiProperty() @IsString() @Length(1, 30) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty({ enum: ["monthly", "quarterly", "yearly"] }) @IsIn(["monthly", "quarterly", "yearly"]) frequency!: "monthly" | "quarterly" | "yearly";
  @ApiProperty({ description: "Date of the first journal" }) @IsISO8601({ strict: true }) startDate!: string;
  @IsOptional() @IsISO8601({ strict: true }) endDate?: string;
  @IsOptional() @IsString() @MaxLength(500) memo?: string;
  @ApiProperty({ type: [JournalLineDto] }) @IsArray() @ArrayMinSize(2) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines!: JournalLineDto[];
}
export class UpdateRecurringJournalDto extends PartialType(CreateRecurringJournalDto) {
  @IsOptional() @IsIn(["active", "paused"]) status?: "active" | "paused";
}

export function advance(date: string, frequency: RecurringJournalDoc["frequency"]): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

type RecurringInput = CreateRecurringJournalDto & { built?: JournalLine[] };

@Injectable()
export class RecurringJournalService extends MasterDataService<RecurringJournalDoc, RecurringInput, UpdateRecurringJournalDto & { built?: JournalLine[] }> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly ledger: GeneralLedger) {
    super(fs, audit, unique, {
      module: "finance", entity: "recurringJournal", label: "Recurring journal", collection: "glRecurringJournals", permission: "finance.journal",
      route: "/finance/recurring", uniqueFields: ["code"], filterFields: ["status", "frequency"], customFields: false,
    });
  }

  private async build(ctx: RequestContext, lines: JournalLineDto[]): Promise<JournalLine[]> {
    const currency = (await this.ledger.settings(ctx))?.baseCurrency ?? "LKR";
    const built = this.ledger.normalise(lines.map((l) => ({ ...l, debit: l.debit ? toMinor(l.debit, currency) : 0, credit: l.credit ? toMinor(l.credit, currency) : 0 })));
    await this.ledger.checkAccounts(ctx, built, true);
    return built;
  }

  async create(ctx: RequestContext, dto: RecurringInput): Promise<RecurringJournalDoc> {
    return super.create(ctx, { ...dto, built: await this.build(ctx, dto.lines) });
  }

  async update(ctx: RequestContext, id: string, dto: UpdateRecurringJournalDto & { built?: JournalLine[] }, expectedVersion?: number): Promise<RecurringJournalDoc> {
    return super.update(ctx, id, { ...dto, built: dto.lines ? await this.build(ctx, dto.lines) : undefined }, expectedVersion);
  }

  protected toNew(dto: RecurringInput): NewDoc<RecurringJournalDoc> {
    return {
      code: dto.code, name: dto.name, frequency: dto.frequency, nextRunDate: dto.startDate.slice(0, 10), endDate: dto.endDate?.slice(0, 10) ?? null, memo: dto.memo ?? null,
      lines: dto.built!, status: "active", lastJournalId: null, runs: 0,
    };
  }

  protected toPatch(dto: UpdateRecurringJournalDto & { built?: JournalLine[] }, before: RecurringJournalDoc): Patch<RecurringJournalDoc> {
    if (before.status === "ended") throw new BadRequestException("This schedule has ended");
    const { lines: _l, built, startDate, endDate, ...rest } = dto;
    return { ...rest, ...(built ? { lines: built } : {}), ...(startDate ? { nextRunDate: startDate.slice(0, 10) } : {}), ...(endDate !== undefined ? { endDate: endDate?.slice(0, 10) ?? null } : {}) } as Patch<RecurringJournalDoc>;
  }

  /** Posts every journal due on or before `asOf` (catching up), advancing each schedule. */
  async runDue(ctx: RequestContext, asOf = today()) {
    const due = (await this.repo.collection.where("companyId", "==", ctx.companyId).where("status", "==", "active").get()).docs.map((d) => d.data())
      .filter((r) => !r.archivedAt && r.nextRunDate <= asOf);
    const posted: { scheduleId: string; journalId: string; date: string }[] = [];
    const failed: { scheduleId: string; error: string }[] = [];
    for (const r of due) {
      for (let guard = 0; guard < 120; guard++) {
        try {
          const result = await this.firestore.runTransaction(async (tx) => {
            const cur = await this.repo.get(ctx, r.id, tx);
            if (cur.status !== "active" || cur.nextRunDate > asOf) return null;
            const plan = await this.ledger.prepare(tx, ctx, {
              date: cur.nextRunDate, lines: cur.lines, source: "system", memo: cur.memo ?? cur.name, reference: { entityType: this.entityType, entityId: cur.id, label: cur.code },
            }, { withNumber: true });
            const journal = plan.commitNew();
            const next = advance(cur.nextRunDate, cur.frequency);
            const ended = cur.endDate !== null && next > cur.endDate;
            this.repo.applyUpdate(ctx, tx, cur, { nextRunDate: next, lastJournalId: journal.id, runs: cur.runs + 1, status: ended ? "ended" : "active" });
            return { journalId: journal.id, date: cur.nextRunDate, more: !ended && next <= asOf };
          });
          if (!result) break;
          posted.push({ scheduleId: r.id, journalId: result.journalId, date: result.date });
          if (!result.more) break;
        } catch (error) {
          failed.push({ scheduleId: r.id, error: error instanceof Error ? error.message : String(error) });
          break;
        }
      }
    }
    return { asOf, posted, failed };
  }
}

// ─── Tax return ───────────────────────────────────────────────────────────────

@Injectable()
export class TaxReportService {
  constructor(private readonly firestore: FirestoreService, private readonly ledger: GeneralLedger) {}

  /** Output tax on sales and input tax on purchases and expenses by tax code, from posted documents (base currency). */
  async summary(ctx: RequestContext, from: string, to: string) {
    const base = (await this.ledger.settings(ctx))?.baseCurrency ?? "LKR";
    const rows = new Map<string, { taxCode: string; rate: number; outputNet: number; outputTax: number; inputNet: number; inputTax: number; documents: number }>();
    const row = (code: string, rate: number) => rows.get(`${code}|${rate}`) ?? rows.set(`${code}|${rate}`, { taxCode: code, rate, outputNet: 0, outputTax: 0, inputNet: 0, inputTax: 0, documents: 0 }).get(`${code}|${rate}`)!;
    const inRange = (d: { date: string; status: string }) => d.date >= from && d.date <= to && !["draft", "cancelled"].includes(d.status);
    const invoices = (await this.firestore.collection<InvoiceDoc>(AR_COLLECTIONS.invoices).where("companyId", "==", ctx.companyId).where("date", ">=", from).where("date", "<=", to).get()).docs.map((d) => d.data()).filter(inRange);
    for (const inv of invoices) {
      const sign = inv.kind === "invoice" ? 1 : -1;
      for (const l of inv.lines) {
        const r = row(l.taxCode ?? "NONE", l.taxRate);
        r.outputNet += sign * toBase(l.net, inv.rate, inv.currency, base);
        r.outputTax += sign * toBase(l.tax, inv.rate, inv.currency, base);
        r.documents++;
      }
    }
    const bills = (await this.firestore.collection<BillDoc>(AP_COLLECTIONS.bills).where("companyId", "==", ctx.companyId).where("date", ">=", from).where("date", "<=", to).get()).docs.map((d) => d.data()).filter(inRange);
    for (const b of bills) {
      const sign = b.kind === "bill" ? 1 : -1;
      for (const l of b.lines) {
        const r = row(l.taxCode ?? "NONE", l.taxRate);
        r.inputNet += sign * toBase(l.net, b.rate, b.currency, base);
        r.inputTax += sign * toBase(l.tax, b.rate, b.currency, base);
        r.documents++;
      }
    }
    const claims = (await this.firestore.collection<{ status: string; approvedAt: string | null; lines: { taxCode: string | null; taxRate: number; net: number; tax: number }[]; companyId: string }>("expenseClaims")
      .where("companyId", "==", ctx.companyId).get()).docs.map((d) => d.data())
      .filter((c) => ["approved", "paid"].includes(c.status) && c.approvedAt && c.approvedAt.slice(0, 10) >= from && c.approvedAt.slice(0, 10) <= to);
    for (const c of claims) for (const l of c.lines) if (l.tax) {
      const r = row(l.taxCode ?? "NONE", l.taxRate);
      r.inputNet += l.net;
      r.inputTax += l.tax;
      r.documents++;
    }
    const lines = [...rows.values()].sort((a, b) => a.taxCode.localeCompare(b.taxCode) || a.rate - b.rate);
    const outputTax = lines.reduce((a, l) => a + l.outputTax, 0);
    const inputTax = lines.reduce((a, l) => a + l.inputTax, 0);
    return { from, to, currency: base, lines, outputTax, inputTax, netPayable: outputTax - inputTax };
  }

  csv(report: Awaited<ReturnType<TaxReportService["summary"]>>): string {
    const m = (n: number) => (n / 100).toFixed(2);
    const head = "tax_code,rate_percent,sales_net,output_tax,purchases_net,input_tax";
    const body = report.lines.map((l) => [l.taxCode, (l.rate / 100).toFixed(2), m(l.outputNet), m(l.outputTax), m(l.inputNet), m(l.inputTax)].join(","));
    return [head, ...body, `TOTAL,,,${m(report.outputTax)},,${m(report.inputTax)}`, `NET_PAYABLE,,,,,${m(report.netPayable)}`].join("\n");
  }
}

// ─── Cash flow, ratios and revaluation ────────────────────────────────────────

@Injectable()
export class FinanceAnalysisService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly ledger: GeneralLedger,
    private readonly reports: FinanceReportsService,
    private readonly rates: ExchangeRateService,
  ) {}

  /**
   * Direct-method cash flow: every movement on bank and cash accounts, classed
   * by the other side of its journal (fixed assets → investing, equity and
   * long-term liabilities → financing, everything else → operating).
   */
  async cashFlow(ctx: RequestContext, from: string, to: string) {
    const accounts = new Map((await this.firestore.collection<AccountDoc>(FINANCE_COLLECTIONS.accounts).where("companyId", "==", ctx.companyId).get()).docs.map((d) => [d.id, d.data()]));
    const cashIds = [...accounts.values()].filter((a) => a.subtype === "bank" || a.subtype === "cash").map((a) => a.id);
    const sections: Record<"operating" | "investing" | "financing", Record<string, number>> = { operating: {}, investing: {}, financing: {} };
    let opening = 0;
    const journalIds = new Set<string>();
    const cashByJournal = new Map<string, number>();
    for (const id of cashIds) {
      const all = (await this.firestore.collection<EntryDoc>(FINANCE_COLLECTIONS.entries).where("companyId", "==", ctx.companyId).where("accountId", "==", id).where("date", "<=", to).get()).docs.map((d) => d.data());
      for (const e of all) {
        if (e.date < from) {
          opening += e.debit - e.credit;
          continue;
        }
        journalIds.add(e.journalId);
        cashByJournal.set(e.journalId, (cashByJournal.get(e.journalId) ?? 0) + e.debit - e.credit);
      }
    }
    const ids = [...journalIds];
    for (let i = 0; i < ids.length; i += 300) {
      const snaps = await this.firestore.db.getAll(...ids.slice(i, i + 300).map((id) => this.firestore.collection<JournalDoc>(FINANCE_COLLECTIONS.journals).doc(id)));
      for (const s of snaps) {
        const j = s.data() as JournalDoc | undefined;
        if (!j) continue;
        const cash = cashByJournal.get(s.id) ?? 0;
        if (!cash) continue; // transfers between cash accounts
        const others = j.lines.filter((l) => !cashIds.includes(l.accountId));
        const main = others.sort((a, b) => b.debit + b.credit - (a.debit + a.credit))[0];
        const acc = main ? accounts.get(main.accountId) : undefined;
        const section = !acc ? "operating" : acc.subtype === "fixed_asset" || acc.subtype === "accumulated_depreciation" ? "investing" : acc.type === "equity" || acc.subtype === "loan" ? "financing" : "operating";
        const label = acc ? (acc.subtype === "receivable" ? "Receipts from customers" : acc.subtype === "payable" ? "Payments to suppliers and staff" : acc.name) : "Other";
        sections[section][label] = (sections[section][label] ?? 0) + cash;
      }
    }
    const total = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + b, 0);
    const net = total(sections.operating) + total(sections.investing) + total(sections.financing);
    return {
      from, to, opening,
      operating: { lines: sections.operating, total: total(sections.operating) },
      investing: { lines: sections.investing, total: total(sections.investing) },
      financing: { lines: sections.financing, total: total(sections.financing) },
      netChange: net, closing: opening + net,
    };
  }

  /** Common ratios from the balance sheet (at `to`) and profit and loss (from..to months). */
  async ratios(ctx: RequestContext, from?: string, to?: string) {
    const [bs, pl] = await Promise.all([this.reports.balanceSheet(ctx, to), this.reports.profitAndLoss(ctx, from, to)]);
    const accounts = new Map((await this.firestore.collection<AccountDoc>(FINANCE_COLLECTIONS.accounts).where("companyId", "==", ctx.companyId).get()).docs.map((d) => [d.id, d.data()]));
    const sub = (id: string) => accounts.get(id)?.subtype ?? null;
    const currentAssets = bs.assets.filter((r) => !["fixed_asset", "accumulated_depreciation"].includes(sub(r.accountId) ?? "")).reduce((a, r) => a + r.balance, 0);
    const inventory = bs.assets.filter((r) => ["inventory", "wip"].includes(sub(r.accountId) ?? "")).reduce((a, r) => a + r.balance, 0);
    const currentLiabilities = bs.liabilities.filter((r) => sub(r.accountId) !== "loan").reduce((a, r) => a + r.balance, 0);
    const revenue = pl.income.filter((r) => ["revenue", "sales_returns"].includes(sub(r.accountId) ?? "")).reduce((a, r) => a + r.balance, 0);
    const cogs = pl.expenses.filter((r) => sub(r.accountId) === "cogs").reduce((a, r) => a + r.balance, 0);
    const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 100) / 100 : null);
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
    return {
      currentRatio: ratio(currentAssets, currentLiabilities),
      quickRatio: ratio(currentAssets - inventory, currentLiabilities),
      grossMarginPct: pct(revenue - cogs, revenue),
      netMarginPct: pct(pl.netProfit, revenue),
      debtToEquity: ratio(bs.totalLiabilities, bs.totalEquity),
      figures: { currentAssets, inventory, currentLiabilities, revenue, cogs, netProfit: pl.netProfit, totalLiabilities: bs.totalLiabilities, totalEquity: bs.totalEquity },
    };
  }

  /**
   * Revalues open foreign-currency invoices and bills at the rate on `date`,
   * posting the unrealised difference to exchange gains and losses, and the
   * reversal on the first day of the next month.
   */
  async revalue(ctx: RequestContext, date: string) {
    const settings = await this.ledger.settings(ctx);
    const base = settings?.baseCurrency ?? "LKR";
    const open = <T extends { status: string; currency: string }>(docs: T[]) => docs.filter((d) => ["posted", "partially_paid"].includes(d.status) && d.currency !== base);
    const invoices = open((await this.firestore.collection<InvoiceDoc>(AR_COLLECTIONS.invoices).where("companyId", "==", ctx.companyId).where("status", "in", ["posted", "partially_paid"]).get()).docs.map((d) => d.data()));
    const bills = open((await this.firestore.collection<BillDoc>(AP_COLLECTIONS.bills).where("companyId", "==", ctx.companyId).where("status", "in", ["posted", "partially_paid"]).get()).docs.map((d) => d.data()));
    const rateCache = new Map<string, string>();
    const rateOf = async (cur: string) => {
      if (!rateCache.has(cur)) {
        const r = await this.rates.rateOn(ctx, cur, base, date);
        if (!r) throw new BadRequestException(`Add an exchange rate from ${cur} to ${base} for ${date}`);
        rateCache.set(cur, r);
      }
      return rateCache.get(cur)!;
    };
    let receivable = 0;
    let payable = 0;
    const details: { documentId: string; number: string; currency: string; open: number; carried: number; revalued: number; difference: number }[] = [];
    for (const d of [...invoices, ...bills]) {
      const sign = "customerId" in d ? (d.kind === "invoice" ? 1 : -1) : (d.kind === "bill" ? 1 : -1);
      const carried = sign * toBase(d.balanceDue, d.rate, d.currency, base);
      const revalued = sign * toBase(d.balanceDue, await rateOf(d.currency), d.currency, base);
      const diff = revalued - carried;
      if (!diff) continue;
      if ("customerId" in d) receivable += diff;
      else payable += diff;
      details.push({ documentId: d.id, number: d.number, currency: d.currency, open: d.balanceDue, carried, revalued, difference: diff });
    }
    if (!receivable && !payable) return { date, receivable, payable, journal: null, reversal: null, details };
    // Receivables worth more is a gain (credit fx); payables worth more is a loss (debit fx).
    const lines: LineInput[] = [];
    if (receivable) lines.push({ accountId: this.ledger.account(settings, "receivable"), debit: receivable, description: "Unrealised exchange difference" });
    if (payable) lines.push({ accountId: this.ledger.account(settings, "payable"), credit: payable, description: "Unrealised exchange difference" });
    lines.push({ accountId: this.ledger.account(settings, "fx"), credit: receivable - payable, description: "Unrealised exchange difference" });
    const reference = { entityType: "finance.revaluation", entityId: date, label: `Revaluation ${date}` };
    const journal = await this.ledger.post(ctx, { date, lines, source: "system", memo: `Unrealised FX revaluation at ${date}`, reference });
    const [y, m] = date.split("-").map(Number) as [number, number];
    const firstNext = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const reversal = await this.ledger.post(ctx, {
      date: firstNext, source: "reversal", reversalOfId: journal.id, memo: `Reversal of revaluation at ${date}`, reference,
      lines: journal.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
    });
    return { date, receivable, payable, journal: { id: journal.id, number: journal.number }, reversal: { id: reversal.id, number: reversal.number }, details };
  }
}

export class RevalueDto {
  @ApiProperty({ example: "2026-11-30" }) @IsISO8601({ strict: true }) date!: string;
}
export class RunDueDto {
  @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true }) asOf?: string;
}

@ApiTags("Finance")
@ApiBearerAuth()
@RequireModule("finance")
@Controller("finance")
export class FinanceExtrasController {
  constructor(
    private readonly recurring: RecurringJournalService,
    private readonly tax: TaxReportService,
    private readonly analysis: FinanceAnalysisService,
  ) {}

  @Post("recurring/run-due")
  @HttpCode(200)
  @RequirePermission("finance.journal.edit")
  @ApiOperation({ summary: "Post recurring journals that are due (catching up missed runs)" })
  runDue(@Ctx() ctx: RequestContext, @Body(validated(RunDueDto)) dto: RunDueDto) {
    return this.recurring.runDue(ctx, dto.asOf?.slice(0, 10));
  }

  @Get("reports/tax")
  @RequirePermission("finance.reports.view")
  @ApiOperation({ summary: "Output and input tax by code for a period (VAT, SSCL …)" })
  taxSummary(@Ctx() ctx: RequestContext, @Query("from") from?: string, @Query("to") to?: string) {
    return this.tax.summary(ctx, day(from) ?? `${today().slice(0, 7)}-01`, day(to) ?? today());
  }

  @Get("reports/tax.csv")
  @RequirePermission("finance.reports.view")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="tax-return.csv"')
  async taxCsv(@Ctx() ctx: RequestContext, @Query("from") from?: string, @Query("to") to?: string) {
    return this.tax.csv(await this.tax.summary(ctx, day(from) ?? `${today().slice(0, 7)}-01`, day(to) ?? today()));
  }

  @Get("reports/cash-flow")
  @RequirePermission("finance.reports.view")
  cashFlow(@Ctx() ctx: RequestContext, @Query("from") from?: string, @Query("to") to?: string) {
    return this.analysis.cashFlow(ctx, day(from) ?? `${today().slice(0, 7)}-01`, day(to) ?? today());
  }

  @Get("reports/ratios")
  @RequirePermission("finance.reports.view")
  ratios(@Ctx() ctx: RequestContext, @Query("from") from?: string, @Query("to") to?: string) {
    const month = (v?: string) => (v && /^\d{4}-\d{2}$/.test(v) ? v : undefined);
    return this.analysis.ratios(ctx, month(from), month(to));
  }

  @Post("fx-revaluation")
  @HttpCode(200)
  @RequirePermission("finance.journal.edit")
  @ApiOperation({ summary: "Revalue open foreign-currency invoices and bills; reversed on the first day of the next month" })
  revalue(@Ctx() ctx: RequestContext, @Body(validated(RevalueDto)) dto: RevalueDto) {
    return this.analysis.revalue(ctx, dto.date.slice(0, 10));
  }
}
