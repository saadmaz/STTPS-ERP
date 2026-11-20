import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from "class-validator";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, Scope, systemContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { fromMinor, toMinor } from "../platform/data/money.js";
import { BaseDoc, NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { ApprovalsService } from "../platform/approvals/approvals.service.js";
import { APPROVAL_COMPLETED, ApprovalCompletedPayload } from "../platform/approvals/approvals.models.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { FiscalYearDoc, ORG_COLLECTIONS } from "../org/org.models.js";
import { PROCUREMENT_COLLECTIONS, PurchaseOrderDoc, RequisitionDoc } from "../procurement/procurement.models.js";
import { AccountDoc, DEBIT_NORMAL, EntryDoc, FINANCE_COLLECTIONS } from "./finance.models.js";
import { GeneralLedger } from "./ledger.service.js";

// ─── Model ────────────────────────────────────────────────────────────────────

export const BUDGET_COLLECTION = "budgets";
export const DIMENSIONS = ["company", "department", "branch", "costCentre", "project"] as const;
export type Dimension = (typeof DIMENSIONS)[number];
const DIM_FIELD: Record<Exclude<Dimension, "company">, "departmentId" | "branchId" | "costCentreId" | "projectId"> = {
  department: "departmentId",
  branch: "branchId",
  costCentre: "costCentreId",
  project: "projectId",
};

export interface BudgetLine {
  accountId: string;
  /** Minor units per period of the fiscal year, in order. */
  amounts: number[];
}

export interface BudgetDoc extends BaseDoc {
  code: string;
  name: string;
  fiscalYearId: string;
  dimension: Dimension;
  /** The department, branch, cost centre or project; null for the whole company. */
  dimensionId: string | null;
  /** Revision number; each revision is approved separately and replaces the previous one. */
  revision: number;
  previousId: string | null;
  /** none: report only; warn: requisitions over budget are flagged to approvers; block: they are refused. */
  control: "none" | "warn" | "block";
  lines: BudgetLine[];
  total: number;
  status: "draft" | "pending_approval" | "approved" | "superseded" | "rejected";
  approvedAt: string | null;
  notes: string | null;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;

export class BudgetLineDto {
  @ApiProperty() @IsString() accountId!: string;
  @ApiPropertyOptional({ description: "One amount per period; or give `annual` to spread evenly" })
  @IsOptional() @IsArray() @ArrayMaxSize(24) @Matches(MONEY, { each: true }) amounts?: string[];
  @IsOptional() @Matches(MONEY) annual?: string;
}

export class CreateBudgetDto {
  @ApiProperty() @IsString() @Length(1, 30) @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty() @IsString() fiscalYearId!: string;
  @ApiPropertyOptional({ enum: DIMENSIONS }) @IsOptional() @IsIn(DIMENSIONS) dimension?: Dimension;
  @IsOptional() @IsString() dimensionId?: string;
  @IsOptional() @IsIn(["none", "warn", "block"]) control?: "none" | "warn" | "block";
  @ApiProperty({ type: [BudgetLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => BudgetLineDto) lines!: BudgetLineDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateBudgetDto {
  @IsOptional() @IsString() @Length(1, 150) name?: string;
  @IsOptional() @IsIn(["none", "warn", "block"]) control?: "none" | "warn" | "block";
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => BudgetLineDto) lines?: BudgetLineDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/** Splits an annual amount over n periods, putting the remainder in the last ones. */
export function spread(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i >= n - extra ? 1 : 0));
}

type BudgetInput = CreateBudgetDto & { built?: { year: FiscalYearDoc; lines: BudgetLine[]; revisionOf?: BudgetDoc } };

@Injectable()
export class BudgetService extends MasterDataService<BudgetDoc, BudgetInput, UpdateBudgetDto & { built?: { lines: BudgetLine[] } }> implements OnModuleInit {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly ledger: GeneralLedger,
    private readonly approvals: ApprovalsService,
    private readonly events: EventBusService,
  ) {
    super(fs, audit, unique, {
      module: "finance",
      entity: "budget",
      label: "Budget",
      collection: BUDGET_COLLECTION,
      route: "/finance/budgets",
      uniqueFields: ["code"],
      filterFields: ["status", "fiscalYearId", "dimension", "dimensionId"],
      customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "finance.budgetApproval", async (event) => {
      if (event.payload.entityType !== this.entityType) return;
      const ctx = systemContext(event, event.payload.decidedBy);
      await this.firestore.runTransaction(async (tx) => {
        const before = await this.repo.find(ctx, event.payload.entityId, tx);
        if (before?.status !== "pending_approval") return;
        if (event.payload.outcome === "approved") (await this.prepareApprove(tx, ctx, before)).apply();
        else this.repo.applyUpdate(ctx, tx, before, { status: event.payload.outcome === "rejected" ? "rejected" : "draft" });
      });
    });
  }

  private async year(scope: Scope, id: string): Promise<FiscalYearDoc> {
    const y = (await this.firestore.collection<FiscalYearDoc>(ORG_COLLECTIONS.fiscalYears).doc(id).get()).data();
    if (!y || y.companyId !== scope.companyId) throw new BadRequestException("Fiscal year not found");
    return y;
  }

  private async buildLines(ctx: RequestContext, input: BudgetLineDto[], periods: number): Promise<BudgetLine[]> {
    const currency = (await this.ledger.settings(ctx))?.baseCurrency ?? "LKR";
    const ids = [...new Set(input.map((l) => l.accountId))];
    if (ids.length !== input.length) throw new BadRequestException("Each account may appear once");
    const snaps = await this.firestore.db.getAll(...ids.map((id) => this.firestore.collection<AccountDoc>(FINANCE_COLLECTIONS.accounts).doc(id)));
    for (const s of snaps) {
      const a = s.data() as AccountDoc | undefined;
      if (!a || a.companyId !== ctx.companyId || a.isGroup) throw new BadRequestException("Budget postable accounts only");
    }
    return input.map((l) => {
      let amounts: number[];
      if (l.amounts) {
        if (l.amounts.length !== periods) throw new BadRequestException(`Give ${periods} amounts, one per period`);
        amounts = l.amounts.map((a) => toMinor(a, currency));
      } else if (l.annual) amounts = spread(toMinor(l.annual, currency), periods);
      else throw new BadRequestException("Give amounts or an annual figure");
      return { accountId: l.accountId, amounts };
    });
  }

  async create(ctx: RequestContext, dto: BudgetInput): Promise<BudgetDoc> {
    if (dto.built) return super.create(ctx, dto);
    const year = await this.year(ctx, dto.fiscalYearId);
    const dimension = dto.dimension ?? "company";
    if ((dimension === "company") !== !dto.dimensionId) throw new BadRequestException(dimension === "company" ? "A company budget has no dimension id" : `Choose the ${dimension}`);
    return super.create(ctx, { ...dto, built: { year, lines: await this.buildLines(ctx, dto.lines, year.periods.length) } });
  }

  async update(ctx: RequestContext, id: string, dto: UpdateBudgetDto & { built?: { lines: BudgetLine[] } }, expectedVersion?: number): Promise<BudgetDoc> {
    if (!dto.lines) return super.update(ctx, id, dto, expectedVersion);
    const before = await this.repo.get(ctx, id);
    const year = await this.year(ctx, before.fiscalYearId);
    return super.update(ctx, id, { ...dto, built: { lines: await this.buildLines(ctx, dto.lines, year.periods.length) } }, expectedVersion);
  }

  protected toNew(dto: BudgetInput): NewDoc<BudgetDoc> {
    const { lines, revisionOf } = dto.built!;
    return {
      code: dto.code, name: dto.name, fiscalYearId: dto.fiscalYearId, dimension: dto.dimension ?? "company", dimensionId: dto.dimensionId ?? null,
      revision: revisionOf ? revisionOf.revision + 1 : 1, previousId: revisionOf?.id ?? null, control: dto.control ?? "none", lines,
      total: lines.reduce((a, l) => a + l.amounts.reduce((x, y) => x + y, 0), 0), status: "draft", approvedAt: null, notes: dto.notes ?? null,
    };
  }

  protected toPatch(dto: UpdateBudgetDto & { built?: { lines: BudgetLine[] } }, before: BudgetDoc): Patch<BudgetDoc> {
    if (!["draft", "rejected"].includes(before.status)) throw new BadRequestException("Approved budgets are changed by revising them");
    const { lines: _l, built, ...rest } = dto;
    return { ...rest, ...(built ? { lines: built.lines, total: built.lines.reduce((a, l) => a + l.amounts.reduce((x, y) => x + y, 0), 0) } : {}), status: "draft" } as Patch<BudgetDoc>;
  }

  /** Read phase of approval; approving a revision supersedes the budget it revises. */
  private async prepareApprove(tx: Transaction, ctx: RequestContext, before: BudgetDoc): Promise<{ apply: () => BudgetDoc }> {
    const previous = before.previousId ? await this.repo.find(ctx, before.previousId, tx) : null;
    const clash = (await tx.get(this.repo.collection.where("companyId", "==", ctx.companyId).where("fiscalYearId", "==", before.fiscalYearId).where("status", "==", "approved"))).docs
      .map((d) => d.data())
      .find((b) => b.id !== before.previousId && b.dimension === before.dimension && b.dimensionId === before.dimensionId);
    if (clash) throw new BadRequestException(`${clash.code} is already the approved budget for this year and ${before.dimension}; revise it instead`);
    return {
      apply: () => {
        if (previous && previous.status === "approved") this.repo.applyUpdate(ctx, tx, previous, { status: "superseded" });
        return this.repo.applyUpdate(ctx, tx, before, { status: "approved", approvedAt: new Date().toISOString() }).after;
      },
    };
  }

  async submit(ctx: RequestContext, id: string): Promise<BudgetDoc> {
    const doc = await this.repo.get(ctx, id);
    if (!["draft", "rejected"].includes(doc.status)) throw new BadRequestException("Only draft budgets can be submitted");
    const prepared = await this.approvals.prepare(ctx, {
      entityType: this.entityType, entityId: id, entityLabel: `${doc.code} rev ${doc.revision} · ${fromMinor(doc.total, "LKR")}`, link: `/finance/budgets/${id}`,
      facts: { amount: doc.total, dimension: doc.dimension, dimensionId: doc.dimensionId, revision: doc.revision },
    });
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const approval = await this.prepareApprove(tx, ctx, before);
      const request = await this.approvals.open(tx, ctx, prepared);
      if (request.status === "approved") return approval.apply();
      return this.repo.applyUpdate(ctx, tx, before, { status: "pending_approval" }).after;
    });
  }

  /** Starts a new draft revision of an approved budget. */
  async revise(ctx: RequestContext, id: string): Promise<BudgetDoc> {
    const b = await this.repo.get(ctx, id);
    if (b.status !== "approved") throw new BadRequestException("Only the approved budget can be revised");
    const year = await this.year(ctx, b.fiscalYearId);
    const code = `${b.code.replace(/-R\d+$/, "")}-R${b.revision + 1}`;
    return this.create(ctx, {
      code, name: b.name, fiscalYearId: b.fiscalYearId, dimension: b.dimension, dimensionId: b.dimensionId ?? undefined, control: b.control, lines: [], notes: b.notes ?? undefined,
      built: { year, lines: b.lines, revisionOf: b },
    });
  }

  /** Budget, actual (posted ledger) and variance per account and period. */
  async vsActual(ctx: RequestContext, id: string) {
    const b = await this.repo.get(ctx, id);
    const year = await this.year(ctx, b.fiscalYearId);
    const accounts = new Map((await this.firestore.db.getAll(...b.lines.map((l) => this.firestore.collection<AccountDoc>(FINANCE_COLLECTIONS.accounts).doc(l.accountId))))
      .map((s) => [s.id, s.data() as AccountDoc]));
    const field = b.dimension === "company" ? null : DIM_FIELD[b.dimension];
    const lines = await Promise.all(b.lines.map(async (l) => {
      const a = accounts.get(l.accountId)!;
      const entries = (await this.firestore.collection<EntryDoc>(FINANCE_COLLECTIONS.entries).where("companyId", "==", ctx.companyId).where("accountId", "==", l.accountId)
        .where("date", ">=", year.startDate).where("date", "<=", year.endDate).get()).docs.map((d) => d.data())
        .filter((e) => !field || e[field] === b.dimensionId);
      const actual = year.periods.map((p) => entries.filter((e) => e.date >= p.startDate && e.date <= p.endDate)
        .reduce((s, e) => s + (DEBIT_NORMAL.has(a.type) ? e.debit - e.credit : e.credit - e.debit), 0));
      const budget = l.amounts.reduce((x, y) => x + y, 0);
      const spent = actual.reduce((x, y) => x + y, 0);
      return { accountId: l.accountId, code: a.code, name: a.name, type: a.type, budget: l.amounts, actual, totalBudget: budget, totalActual: spent, variance: budget - spent, usedPct: budget ? Math.round((spent / budget) * 1000) / 10 : null };
    }));
    return {
      budget: { id: b.id, code: b.code, name: b.name, revision: b.revision, dimension: b.dimension, dimensionId: b.dimensionId, control: b.control },
      periods: year.periods.map((p) => p.name), lines,
      totalBudget: lines.reduce((a, l) => a + l.totalBudget, 0), totalActual: lines.reduce((a, l) => a + l.totalActual, 0),
    };
  }

  /**
   * Budget check for a spending request in a department, cost centre, branch
   * or project: the approved budget (expense accounts) less posted actuals and
   * open commitments (approved requisitions not yet ordered, and orders not yet
   * fully received). Returns null when no controlled budget applies.
   */
  async check(ctx: RequestContext, request: { date: string; amount: number; departmentId?: string | null; costCentreId?: string | null; branchId?: string | null; projectId?: string | null; excludeRequisitionId?: string }) {
    const date = request.date.slice(0, 10);
    const years = (await this.firestore.collection<FiscalYearDoc>(ORG_COLLECTIONS.fiscalYears).where("companyId", "==", ctx.companyId).get()).docs.map((d) => d.data());
    const year = years.find((y) => y.startDate <= date && date <= y.endDate);
    if (!year) return null;
    const approved = (await this.repo.collection.where("companyId", "==", ctx.companyId).where("fiscalYearId", "==", year.id).where("status", "==", "approved").get()).docs.map((d) => d.data());
    const ids: Partial<Record<Dimension, string | null | undefined>> = { department: request.departmentId, costCentre: request.costCentreId, branch: request.branchId, project: request.projectId };
    const budget = approved.find((b) => b.control !== "none" && b.dimension !== "company" && b.dimensionId && ids[b.dimension] === b.dimensionId)
      ?? approved.find((b) => b.control !== "none" && b.dimension === "company");
    if (!budget) return null;
    const report = await this.vsActual(ctx, budget.id);
    const expense = report.lines.filter((l) => l.type === "expense" || l.type === "asset");
    const totalBudget = expense.reduce((a, l) => a + l.totalBudget, 0);
    const actual = expense.reduce((a, l) => a + l.totalActual, 0);
    const commitments = await this.commitments(ctx, budget, year, request.excludeRequisitionId);
    const available = totalBudget - actual - commitments;
    return { budgetId: budget.id, code: budget.code, control: budget.control, totalBudget, actual, commitments, available, requested: request.amount, overBudget: request.amount > available };
  }

  private async commitments(ctx: RequestContext, budget: BudgetDoc, year: FiscalYearDoc, exclude?: string): Promise<number> {
    let q = this.firestore.collection<RequisitionDoc>(PROCUREMENT_COLLECTIONS.requisitions).where("companyId", "==", ctx.companyId);
    if (budget.dimension === "department") q = q.where("departmentId", "==", budget.dimensionId);
    else if (budget.dimension === "costCentre") q = q.where("costCentreId", "==", budget.dimensionId);
    else if (budget.dimension === "project") q = q.where("projectId", "==", budget.dimensionId);
    const reqs = (await q.get()).docs.map((d) => d.data()).filter((r) => r.id !== exclude && r.createdAt.slice(0, 10) >= year.startDate && r.createdAt.slice(0, 10) <= year.endDate);
    let total = reqs.filter((r) => r.status === "approved").reduce((a, r) => a + r.estimatedTotal, 0);
    const orderIds = reqs.filter((r) => r.status === "ordered").flatMap((r) => r.orderIds);
    if (orderIds.length) {
      for (const s of await this.firestore.db.getAll(...orderIds.map((id) => this.firestore.collection<PurchaseOrderDoc>(PROCUREMENT_COLLECTIONS.orders).doc(id)))) {
        const o = s.data() as PurchaseOrderDoc | undefined;
        if (!o || !["approved", "sent", "confirmed", "partially_received"].includes(o.status)) continue;
        total += o.lines.reduce((a, l) => a + Math.round((Math.max(0, l.qty - (l.received - l.rejected)) * l.unitPrice) / 1000), 0);
      }
    }
    return total;
  }

  protected searchEntry(doc: BudgetDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.code} ${doc.name}`, subtitle: `Revision ${doc.revision}`, keywords: [] };
  }
}
