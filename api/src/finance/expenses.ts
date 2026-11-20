import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { BadRequestException, Body, Controller, HttpCode, Injectable, OnModuleInit, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from "class-validator";
import { randomUUID } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { Ctx, RequestContext, systemContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { validated } from "../platform/crud/master-data.controller.js";
import { fromMinor, netOfTax, toMinor } from "../platform/data/money.js";
import { BaseDoc, NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { ApprovalsService } from "../platform/approvals/approvals.service.js";
import { APPROVAL_COMPLETED, ApprovalCompletedPayload } from "../platform/approvals/approvals.models.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { SalesSettingsService, taxRateOn } from "../sales/sales.services.js";
import { AccountDoc, FINANCE_COLLECTIONS } from "./finance.models.js";
import { GeneralLedger, LineInput } from "./ledger.service.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);

// ─── Model ────────────────────────────────────────────────────────────────────

export const EXPENSE_COLLECTIONS = { categories: "expenseCategories", claims: "expenseClaims" } as const;

export interface ExpenseCategoryDoc extends BaseDoc {
  code: string;
  name: string;
  /** Expense account the claim lines post to. */
  accountId: string;
  /** Default tax code for receipts in this category (input tax reclaimable), or null. */
  taxCode: string | null;
  receiptRequired: boolean;
  /** Most one line may claim, in minor units; null for no limit. */
  limit: number | null;
  status: "active" | "inactive";
}

export interface ClaimLine {
  lineId: string;
  date: string;
  categoryId: string;
  accountId: string;
  description: string;
  /** What was paid, tax included (minor units). */
  amount: number;
  taxCode: string | null;
  taxRate: number;
  tax: number;
  net: number;
}

export interface ExpenseClaimDoc extends BaseDoc {
  number: string;
  /** The user claiming. */
  employeeId: string;
  title: string;
  currency: string;
  lines: ClaimLine[];
  total: number;
  tax: number;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "paid";
  journalId: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  paymentJournalId: string | null;
  rejectionReason: string | null;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class CreateExpenseCategoryDto {
  @ApiProperty() @IsString() @Length(1, 30) @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/) code!: string;
  @ApiProperty() @IsString() @Length(1, 120) name!: string;
  @ApiProperty() @IsString() accountId!: string;
  @IsOptional() @IsString() @MaxLength(20) taxCode?: string;
  @IsOptional() @IsBoolean() receiptRequired?: boolean;
  @IsOptional() @Matches(MONEY) limit?: string;
  @IsOptional() @IsIn(["active", "inactive"]) status?: "active" | "inactive";
}
export class UpdateExpenseCategoryDto extends PartialType(CreateExpenseCategoryDto) {}

export class ClaimLineDto {
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @ApiProperty() @IsString() categoryId!: string;
  @ApiProperty() @IsString() @Length(1, 300) description!: string;
  @ApiProperty({ description: "Amount paid, tax included", example: "2360.00" }) @Matches(MONEY) amount!: string;
  @ApiPropertyOptional({ description: "Overrides the category's tax code; NONE for no reclaimable tax" }) @IsOptional() @IsString() @MaxLength(20) taxCode?: string;
}

export class CreateExpenseClaimDto {
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiProperty({ type: [ClaimLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ClaimLineDto) lines!: ClaimLineDto[];
}
export class UpdateExpenseClaimDto extends PartialType(CreateExpenseClaimDto) {}

export class ReimburseDto {
  @ApiPropertyOptional({ description: "Bank or cash account; defaults to the bank posting rule" }) @IsOptional() @IsString() bankAccountId?: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
}

// ─── Services ─────────────────────────────────────────────────────────────────

@Injectable()
export class ExpenseCategoryService extends MasterDataService<ExpenseCategoryDoc, CreateExpenseCategoryDto, UpdateExpenseCategoryDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly ledger: GeneralLedger) {
    super(fs, audit, unique, {
      module: "expenses",
      entity: "category",
      label: "Expense category",
      collection: EXPENSE_COLLECTIONS.categories,
      route: "/expenses/categories",
      uniqueFields: ["code"],
      references: [{ field: "accountId", collection: FINANCE_COLLECTIONS.accounts, label: "Account" }],
      filterFields: ["status"],
      customFields: false,
    });
  }

  protected toNew(dto: CreateExpenseCategoryDto): NewDoc<ExpenseCategoryDoc> {
    return {
      code: dto.code, name: dto.name.trim(), accountId: dto.accountId, taxCode: orNull(dto.taxCode), receiptRequired: dto.receiptRequired ?? true,
      limit: dto.limit ? toMinor(dto.limit, "LKR") : null, status: dto.status ?? "active",
    };
  }

  protected toPatch(dto: UpdateExpenseCategoryDto): Patch<ExpenseCategoryDoc> {
    const { limit, ...rest } = dto;
    return { ...rest, ...(limit !== undefined ? { limit: limit ? toMinor(limit, "LKR") : null } : {}) } as Patch<ExpenseCategoryDoc>;
  }

  protected async validate(tx: Transaction, ctx: RequestContext, next: ExpenseCategoryDoc): Promise<void> {
    const a = (await tx.get(this.firestore.collection<AccountDoc>(FINANCE_COLLECTIONS.accounts).doc(next.accountId))).data();
    if (!a || a.isGroup || a.isControl || a.type !== "expense") throw new BadRequestException("Choose a postable expense account");
    void this.ledger;
  }
}

type ClaimInput = CreateExpenseClaimDto & { built?: { lines: ClaimLine[]; currency: string } };

@Injectable()
export class ExpenseClaimService extends MasterDataService<ExpenseClaimDoc, ClaimInput, UpdateExpenseClaimDto & { built?: { lines: ClaimLine[] } }> implements OnModuleInit {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly ledger: GeneralLedger,
    private readonly categories: ExpenseCategoryService,
    private readonly taxes: SalesSettingsService,
    private readonly approvals: ApprovalsService,
    private readonly events: EventBusService,
  ) {
    super(fs, audit, unique, {
      module: "expenses",
      entity: "claim",
      label: "Expense claim",
      collection: EXPENSE_COLLECTIONS.claims,
      route: "/expenses/claims",
      filterFields: ["status", "employeeId"],
      large: { filters: ["status", "employeeId"], sorts: [{ field: "createdAt", direction: "desc" }] },
      numbering: { field: "number", key: "expenseClaim", prefix: "EXP", yearly: true },
      customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "expenses.claimApproval", async (event) => {
      if (event.payload.entityType !== this.entityType) return;
      const ctx = systemContext(event, event.payload.decidedBy);
      await this.firestore.runTransaction(async (tx) => {
        const before = await this.repo.find(ctx, event.payload.entityId, tx);
        if (before?.status !== "pending_approval") return;
        if (event.payload.outcome === "approved") (await this.prepareApprove(tx, ctx, before)).apply();
        else this.repo.applyUpdate(ctx, tx, before, { status: event.payload.outcome === "rejected" ? "rejected" : "draft", rejectionReason: event.payload.comment ?? null });
      });
    });
  }

  private async buildLines(ctx: RequestContext, input: ClaimLineDto[]): Promise<{ lines: ClaimLine[]; currency: string }> {
    const currency = (await this.ledger.settings(ctx))?.baseCurrency ?? "LKR";
    const cats = new Map((await this.categories.repo.getMany(ctx, [...new Set(input.map((l) => l.categoryId))])).map((c) => [c.id, c]));
    const rates = (await this.taxes.get(ctx)).taxRates;
    const lines = input.map((l) => {
      const c = cats.get(l.categoryId);
      if (!c || c.status !== "active") throw new BadRequestException("Expense category not found");
      const amount = toMinor(l.amount, currency);
      if (amount <= 0) throw new BadRequestException("Amounts must be positive");
      if (c.limit !== null && amount > c.limit) throw new BadRequestException(`${c.name} is limited to ${fromMinor(c.limit, currency)} per line`);
      const code = l.taxCode === "NONE" ? null : (l.taxCode ?? c.taxCode);
      const rate = code ? rates.find((r) => r.code === code) : undefined;
      if (code && !rate) throw new BadRequestException(`Unknown tax code ${code}`);
      const date = l.date?.slice(0, 10) ?? today();
      const taxRate = rate ? taxRateOn(rate, date) : 0;
      // Receipts show tax-inclusive amounts: net is backed out of the amount.
      const net = rate ? netOfTax(amount, taxRate) : amount;
      return {
        lineId: randomUUID().slice(0, 8), date, categoryId: c.id, accountId: c.accountId, description: l.description.trim(), amount,
        taxCode: rate?.code ?? null, taxRate, tax: amount - net, net,
      };
    });
    return { lines, currency };
  }

  async create(ctx: RequestContext, dto: ClaimInput): Promise<ExpenseClaimDoc> {
    return super.create(ctx, { ...dto, built: await this.buildLines(ctx, dto.lines) });
  }

  async update(ctx: RequestContext, id: string, dto: UpdateExpenseClaimDto & { built?: { lines: ClaimLine[] } }, expectedVersion?: number): Promise<ExpenseClaimDoc> {
    return super.update(ctx, id, { ...dto, built: dto.lines ? (await this.buildLines(ctx, dto.lines)) : undefined }, expectedVersion);
  }

  protected toNew(dto: ClaimInput, ctx: RequestContext): NewDoc<ExpenseClaimDoc> {
    const { lines, currency } = dto.built!;
    return {
      number: "", employeeId: ctx.userId, title: dto.title.trim(), currency, lines, total: lines.reduce((a, l) => a + l.amount, 0), tax: lines.reduce((a, l) => a + l.tax, 0),
      status: "draft", journalId: null, approvedAt: null, paidAt: null, paymentJournalId: null, rejectionReason: null,
    };
  }

  protected toPatch(dto: UpdateExpenseClaimDto & { built?: { lines: ClaimLine[] } }, before: ExpenseClaimDoc, ctx: RequestContext): Patch<ExpenseClaimDoc> {
    if (!["draft", "rejected"].includes(before.status)) throw new BadRequestException("Only draft claims can be changed");
    if (before.employeeId !== ctx.userId) throw new BadRequestException("Only the claimant can change a claim");
    const { lines: _l, built, ...rest } = dto;
    return { ...rest, ...(built ? { lines: built.lines, total: built.lines.reduce((a, l) => a + l.amount, 0), tax: built.lines.reduce((a, l) => a + l.tax, 0) } : {}), status: "draft" } as Patch<ExpenseClaimDoc>;
  }

  /** Read phase of approval: the journal (expense and input tax against the employee's payable). */
  private async prepareApprove(tx: Transaction, ctx: RequestContext, before: ExpenseClaimDoc) {
    const settings = await this.ledger.settings(ctx, tx);
    const byAccount = new Map<string, number>();
    for (const l of before.lines) byAccount.set(l.accountId, (byAccount.get(l.accountId) ?? 0) + l.net);
    const lines: LineInput[] = [...byAccount].map(([accountId, amount]) => ({ accountId, debit: amount, description: before.title }));
    if (before.tax) lines.push({ accountId: this.ledger.account(settings, "taxInput"), debit: before.tax, description: `${before.number} tax` });
    lines.push({ accountId: this.ledger.account(settings, "payable"), credit: before.total, partyType: "employee", partyId: before.employeeId, description: `${before.number} ${before.title}` });
    const plan = await this.ledger.prepare(tx, ctx, {
      date: before.lines.reduce((max, l) => (l.date > max ? l.date : max), before.lines[0]!.date), lines, source: "system", memo: `Expense claim ${before.number}`,
      reference: { entityType: this.entityType, entityId: before.id, label: before.number },
    }, { withNumber: true });
    return {
      apply: () => {
        const journal = plan.commitNew();
        this.events.publish(tx, ctx, "ExpenseClaimApproved", { entity: this.entityType, entityId: before.id }, { claimId: before.id, employeeId: before.employeeId, total: before.total });
        return this.repo.applyUpdate(ctx, tx, before, { status: "approved", journalId: journal.id, approvedAt: new Date().toISOString() }).after;
      },
    };
  }

  /** Sends the claim for approval (receipts must be attached where the category needs them). */
  async submit(ctx: RequestContext, id: string): Promise<ExpenseClaimDoc> {
    const doc = await this.repo.get(ctx, id);
    if (!["draft", "rejected"].includes(doc.status)) throw new BadRequestException("Only draft claims can be submitted");
    if (doc.employeeId !== ctx.userId) throw new BadRequestException("Only the claimant can submit a claim");
    const cats = await this.categories.repo.getMany(ctx, [...new Set(doc.lines.map((l) => l.categoryId))]);
    if (cats.some((c) => c.receiptRequired)) {
      const files = await this.firestore.collection("files").where("companyId", "==", ctx.companyId).where("entityType", "==", this.entityType).where("entityId", "==", id).get();
      if (!files.docs.some((f) => f.data().status === "ready" && !f.data().archivedAt)) throw new BadRequestException("Attach the receipts before submitting");
    }
    const prepared = await this.approvals.prepare(ctx, {
      entityType: this.entityType, entityId: id, entityLabel: `${doc.number} · ${doc.title} · ${fromMinor(doc.total, doc.currency)} ${doc.currency}`, link: `/expenses/claims/${id}`,
      facts: { amount: doc.total, employeeId: doc.employeeId, categories: cats.map((c) => c.code) },
    });
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const approval = await this.prepareApprove(tx, ctx, before);
      const request = await this.approvals.open(tx, ctx, prepared);
      if (request.status === "approved") return approval.apply();
      return this.repo.applyUpdate(ctx, tx, before, { status: "pending_approval", rejectionReason: null }).after;
    });
  }

  /** Pays the employee back: Dr payable (employee), Cr bank. */
  async reimburse(ctx: RequestContext, id: string, bankAccountId?: string, date?: string): Promise<ExpenseClaimDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "approved") throw new BadRequestException("Only approved claims can be reimbursed");
      const settings = await this.ledger.settings(ctx, tx);
      const plan = await this.ledger.prepare(tx, ctx, {
        date: date?.slice(0, 10) ?? today(), source: "system", memo: `Reimbursement ${before.number}`, reference: { entityType: this.entityType, entityId: id, label: before.number },
        lines: [
          { accountId: this.ledger.account(settings, "payable"), debit: before.total, partyType: "employee", partyId: before.employeeId, description: `Reimburse ${before.number}` },
          { accountId: bankAccountId ?? this.ledger.account(settings, "bank"), credit: before.total, description: `Reimburse ${before.number}` },
        ],
      }, { withNumber: true });
      const journal = plan.commitNew();
      return this.repo.applyUpdate(ctx, tx, before, { status: "paid", paidAt: new Date().toISOString(), paymentJournalId: journal.id }).after;
    });
  }

  protected searchEntry(doc: ExpenseClaimDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.number} ${doc.title}`, subtitle: `${fromMinor(doc.total, doc.currency)} ${doc.currency}`, keywords: [] };
  }
}

@ApiTags("Expenses")
@ApiBearerAuth()
@RequireModule("expenses")
@Controller("expenses")
export class ExpensesController {
  constructor(private readonly claims: ExpenseClaimService) {}

  @Post("claims/:id/submit")
  @HttpCode(200)
  @RequirePermission("expenses.claim.create")
  @ApiOperation({ summary: "Send for approval; posted to the ledger once approved" })
  submit(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.claims.submit(ctx, id);
  }

  @Post("claims/:id/reimburse")
  @HttpCode(200)
  @RequirePermission("expenses.claim.edit")
  reimburse(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ReimburseDto)) dto: ReimburseDto) {
    return this.claims.reimburse(ctx, id, dto.bankAccountId, dto.date);
  }
}
