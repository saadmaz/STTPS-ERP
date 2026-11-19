import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { COLLECTIONS } from "../firestore/collections.js";
import { CompanyDoc } from "../firestore/models.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, Scope, systemContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { fromMinor, toMinor } from "../platform/data/money.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { DomainEvent } from "../platform/events/event-bus.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { ApprovalsService } from "../platform/approvals/approvals.service.js";
import { APPROVAL_COMPLETED, ApprovalCompletedPayload } from "../platform/approvals/approvals.models.js";
import { ModulesService } from "../platform/modules/modules.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import {
  AccountDoc,
  AccountType,
  BalanceDoc,
  DEBIT_NORMAL,
  EntryDoc,
  FINANCE_COLLECTIONS,
  FINANCE_LISTS,
  FinanceSettingsDoc,
  JournalDoc,
  JournalLine,
  POSTING_ROLES,
  PostingIssueDoc,
  PostingRole,
  STANDARD_CHART,
} from "./finance.models.js";
import { CreateAccountDto, CreateJournalDto, FinanceSettingsDto, JournalLineDto, UpdateAccountDto, UpdateJournalDto } from "./finance.dto.js";
import { GeneralLedger, JOURNAL_NUMBERING, LineInput } from "./ledger.service.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

async function companyCurrency(fs: FirestoreService, scope: Scope): Promise<string> {
  return (await fs.collection<CompanyDoc>(COLLECTIONS.companies).doc(scope.companyId).get()).data()?.currency ?? "LKR";
}

// ─── Chart of accounts ────────────────────────────────────────────────────────

@Injectable()
export class AccountService extends MasterDataService<AccountDoc, CreateAccountDto, UpdateAccountDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "finance",
      entity: "account",
      label: "Account",
      collection: FINANCE_COLLECTIONS.accounts,
      route: "/finance/accounts",
      uniqueFields: ["code"],
      parentField: "parentId",
      filterFields: ["type", "subtype", "status", "isGroup", "parentId"],
      sortFields: ["code", "name"],
      customFields: false,
    });
  }

  protected toNew(dto: CreateAccountDto): NewDoc<AccountDoc> {
    return {
      code: dto.code, name: dto.name.trim(), type: dto.type, subtype: orNull(dto.subtype), parentId: orNull(dto.parentId), isGroup: dto.isGroup ?? false,
      isControl: dto.isControl ?? false, currency: orNull(dto.currency), status: dto.status ?? "active", description: orNull(dto.description),
    };
  }

  protected toPatch(dto: UpdateAccountDto): Patch<AccountDoc> {
    return { ...dto } as Patch<AccountDoc>;
  }

  private async hasPostings(tx: Transaction, ctx: RequestContext, accountId: string): Promise<boolean> {
    const q = this.firestore.collection(FINANCE_COLLECTIONS.balances).where("companyId", "==", ctx.companyId).where("accountId", "==", accountId).limit(1);
    return !(await tx.get(q)).empty;
  }

  protected async validate(tx: Transaction, ctx: RequestContext, next: AccountDoc, before: AccountDoc | null): Promise<void> {
    if (next.parentId) {
      const parent = await this.repo.find(ctx, next.parentId, tx);
      if (!parent?.isGroup) throw new BadRequestException("The parent must be a group account");
      if (parent.type !== next.type) throw new BadRequestException(`A ${next.type} account cannot sit under a ${parent.type} group`);
    }
    if (before && (before.type !== next.type || (!before.isGroup && next.isGroup)) && (await this.hasPostings(tx, ctx, before.id))) {
      throw new BadRequestException("This account has postings; its type cannot change and it cannot become a group");
    }
  }

  protected searchEntry(doc: AccountDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.code} ${doc.name}`, subtitle: doc.type, keywords: [doc.subtype] };
  }
}

// ─── Settings and setup ───────────────────────────────────────────────────────

@Injectable()
export class FinanceSettingsService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly audit: AuditService,
    private readonly accounts: AccountService,
    private readonly ledger: GeneralLedger,
  ) {}

  private ref(scope: Scope) {
    return this.firestore.collection<FinanceSettingsDoc>(FINANCE_COLLECTIONS.settings).doc(scope.companyId);
  }

  async get(ctx: RequestContext): Promise<FinanceSettingsDoc & { configured: boolean; missingRoles: PostingRole[] }> {
    const s = (await this.ledger.settings(ctx)) ?? { companyId: ctx.companyId, tenantId: ctx.tenantId, baseCurrency: await companyCurrency(this.firestore, ctx), accounts: {}, updatedAt: new Date(0).toISOString(), updatedBy: null };
    return { ...s, configured: Object.keys(s.accounts).length > 0, missingRoles: POSTING_ROLES.filter((r) => !s.accounts[r]) };
  }

  async update(ctx: RequestContext, dto: FinanceSettingsDto): Promise<FinanceSettingsDoc> {
    const current = await this.get(ctx);
    const accounts = { ...current.accounts };
    for (const [role, id] of Object.entries(dto.accounts ?? {})) {
      if (!(POSTING_ROLES as readonly string[]).includes(role)) throw new BadRequestException(`Unknown posting role ${role}`);
      if (!id) {
        delete accounts[role as PostingRole];
        continue;
      }
      const a = await this.accounts.repo.find(ctx, id);
      if (!a || a.isGroup) throw new BadRequestException(`Choose a postable account for ${role}`);
      accounts[role as PostingRole] = id;
    }
    const { configured: _c, missingRoles: _m, ...base } = current;
    const next: FinanceSettingsDoc = { ...base, baseCurrency: dto.baseCurrency ?? current.baseCurrency, accounts, updatedAt: new Date().toISOString(), updatedBy: ctx.userId };
    await this.ref(ctx).set(next);
    this.audit.record(ctx, { module: "finance", action: "settings.updated", entity: "finance.settings", entityId: ctx.companyId, before: current, after: next });
    return next;
  }

  /** Creates the standard chart of accounts and maps the posting roles. Only for a company with no accounts yet. */
  async setup(ctx: RequestContext, baseCurrency?: string): Promise<{ accounts: number; settings: FinanceSettingsDoc }> {
    const existing = await this.accounts.repo.collection.where("companyId", "==", ctx.companyId).limit(1).get();
    if (!existing.empty) throw new BadRequestException("This company already has a chart of accounts");
    const ids = new Map<string, string>();
    const roles: Partial<Record<PostingRole, string>> = {};
    for (const row of STANDARD_CHART) {
      const created = await this.accounts.create(ctx, {
        code: row.code, name: row.name, type: row.type, subtype: row.subtype, parentId: row.parent ? ids.get(row.parent) : undefined, isGroup: row.group ?? false, isControl: row.control ?? false,
      });
      ids.set(row.code, created.id);
      if (row.role) roles[row.role] = created.id;
    }
    const settings: FinanceSettingsDoc = {
      companyId: ctx.companyId, tenantId: ctx.tenantId, baseCurrency: baseCurrency ?? (await companyCurrency(this.firestore, ctx)), accounts: roles,
      updatedAt: new Date().toISOString(), updatedBy: ctx.userId,
    };
    await this.ref(ctx).set(settings);
    return { accounts: STANDARD_CHART.length, settings };
  }
}

// ─── Journals ─────────────────────────────────────────────────────────────────

type JournalInput = CreateJournalDto & { built?: JournalLine[] };

function linesFromDto(lines: JournalLineDto[], currency: string): LineInput[] {
  return lines.map((l) => ({
    accountId: l.accountId, debit: l.debit ? toMinor(l.debit, currency) : 0, credit: l.credit ? toMinor(l.credit, currency) : 0, description: l.description,
    partyType: l.partyType, partyId: l.partyId, branchId: l.branchId, departmentId: l.departmentId, costCentreId: l.costCentreId, projectId: l.projectId,
  }));
}

@Injectable()
export class JournalService extends MasterDataService<JournalDoc, JournalInput, UpdateJournalDto & { built?: JournalLine[] }> implements OnModuleInit {
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
      entity: "journal",
      label: "Journal",
      collection: FINANCE_COLLECTIONS.journals,
      route: "/finance/journals",
      filterFields: ["status", "source"],
      large: FINANCE_LISTS.journals,
      numbering: { field: "number", ...JOURNAL_NUMBERING },
      customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "finance.journalApproval", async (event) => {
      if (event.payload.entityType !== this.entityType) return;
      const ctx = systemContext(event, event.payload.decidedBy);
      await this.firestore.runTransaction(async (tx) => {
        const before = await this.repo.find(ctx, event.payload.entityId, tx);
        if (before?.status !== "pending_approval") return;
        if (event.payload.outcome === "approved") (await this.preparePost(tx, ctx, before)).apply();
        else this.repo.applyUpdate(ctx, tx, before, { status: "draft" });
      });
    });
  }

  private async build(ctx: RequestContext, lines: JournalLineDto[]): Promise<JournalLine[]> {
    const currency = (await this.ledger.settings(ctx))?.baseCurrency ?? (await companyCurrency(this.firestore, ctx));
    const built = this.ledger.normalise(linesFromDto(lines, currency));
    await this.ledger.checkAccounts(ctx, built, true);
    return built;
  }

  async create(ctx: RequestContext, dto: JournalInput): Promise<JournalDoc> {
    return super.create(ctx, { ...dto, built: await this.build(ctx, dto.lines) });
  }

  async update(ctx: RequestContext, id: string, dto: UpdateJournalDto & { built?: JournalLine[] }, expectedVersion?: number): Promise<JournalDoc> {
    return super.update(ctx, id, { ...dto, built: dto.lines ? await this.build(ctx, dto.lines) : undefined }, expectedVersion);
  }

  protected toNew(dto: JournalInput): NewDoc<JournalDoc> {
    const lines = dto.built!;
    const total = lines.reduce((a, l) => a + l.debit, 0);
    return {
      number: "", date: dto.date.slice(0, 10), period: dto.date.slice(0, 7), source: "manual", sourceEvent: null, reference: null, memo: orNull(dto.memo), currency: "",
      lines, totalDebit: total, totalCredit: total, status: "draft", postedAt: null, reversalOfId: null, reversedById: null,
    };
  }

  protected async derive(tx: Transaction, ctx: RequestContext): Promise<Partial<JournalDoc>> {
    return { currency: (await this.ledger.settings(ctx, tx))?.baseCurrency ?? "LKR" };
  }

  protected toPatch(dto: UpdateJournalDto & { built?: JournalLine[] }, before: JournalDoc): Patch<JournalDoc> {
    if (before.status !== "draft") throw new BadRequestException("Only draft journals can be changed");
    const { lines: _l, built, date, ...rest } = dto;
    const patch: Patch<JournalDoc> = { ...rest } as Patch<JournalDoc>;
    if (date) Object.assign(patch, { date: date.slice(0, 10), period: date.slice(0, 7) });
    if (built) {
      const total = built.reduce((a, l) => a + l.debit, 0);
      Object.assign(patch, { lines: built, totalDebit: total, totalCredit: total });
    }
    return patch;
  }

  private async preparePost(tx: Transaction, ctx: RequestContext, before: JournalDoc) {
    const plan = await this.ledger.prepare(tx, ctx, { date: before.date, lines: before.lines, source: before.source, reference: before.reference }, { manual: before.source === "manual" });
    return {
      apply: () => {
        const { after } = this.repo.applyUpdate(ctx, tx, before, { status: "posted", postedAt: new Date().toISOString() });
        plan.writeLedger(after);
        return after;
      },
    };
  }

  /** Posts the journal, or sends it for approval when a workflow applies to it. */
  async submit(ctx: RequestContext, id: string): Promise<JournalDoc> {
    const doc = await this.repo.get(ctx, id);
    if (doc.status !== "draft") throw new BadRequestException("Only draft journals can be posted");
    const prepared = await this.approvals.prepare(ctx, {
      entityType: this.entityType,
      entityId: id,
      entityLabel: `${doc.number} · ${fromMinor(doc.totalDebit, doc.currency || "LKR")} ${doc.currency}`,
      link: `/finance/journals/${id}`,
      facts: { amount: doc.totalDebit, accounts: [...new Set(doc.lines.map((l) => l.accountId))] },
    });
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "draft") throw new BadRequestException("Only draft journals can be posted");
      const posting = await this.preparePost(tx, ctx, before);
      const request = await this.approvals.open(tx, ctx, prepared);
      if (request.status === "approved") return posting.apply();
      return this.repo.applyUpdate(ctx, tx, before, { status: "pending_approval" }).after;
    });
  }

  async cancel(ctx: RequestContext, id: string): Promise<JournalDoc> {
    const doc = await this.repo.get(ctx, id);
    if (doc.status !== "draft") throw new BadRequestException("Only draft journals can be cancelled; reverse a posted one");
    return (await this.repo.update(ctx, id, { status: "cancelled" })).after;
  }

  /** Posts the mirror image of a posted journal (dated as given) and marks the original reversed. */
  async reverse(ctx: RequestContext, id: string, date?: string, memo?: string): Promise<JournalDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "posted") throw new BadRequestException("Only posted journals can be reversed");
      const plan = await this.ledger.prepare(tx, ctx, {
        date: date ?? before.date, source: "reversal", reversalOfId: before.id, reference: { entityType: this.entityType, entityId: before.id, label: before.number },
        memo: memo ?? `Reversal of ${before.number}`, lines: before.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
      }, { withNumber: true });
      const reversal = plan.commitNew();
      this.repo.applyUpdate(ctx, tx, before, { status: "reversed", reversedById: reversal.id });
      return reversal;
    });
  }

  protected searchEntry(doc: JournalDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: doc.memo, keywords: [doc.reference?.label] };
  }
}

// ─── Automatic postings ───────────────────────────────────────────────────────

interface StockMovedPayload {
  movements: { id: string; type: string; productId: string; warehouseId: string; qty: number; value: number }[];
  totalValue: number;
  currency: string;
  reference: { entityType: string; entityId: string; label?: string | null } | null;
}

/** Where the other side of a stock movement goes (stock in is debited to inventory). */
const STOCK_COUNTER: Record<string, PostingRole | null> = {
  purchase: "grni",
  supplier_return: "grni",
  sale: "cogs",
  customer_return: "cogs",
  receipt: "inventoryAdjustment",
  issue: "inventoryAdjustment",
  adjustment: "inventoryAdjustment",
  count: "inventoryAdjustment",
  production_in: "wip",
  production_out: "wip",
  transfer_out: null,
  transfer_in: null,
};

/** Turns domain events into journals; failures are kept as posting issues to fix and retry. */
@Injectable()
export class AutoPostingService implements OnModuleInit {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly ledger: GeneralLedger,
    private readonly events: EventBusService,
    private readonly modules: ModulesService,
  ) {}

  private handlers: Record<string, (ctx: RequestContext, event: DomainEvent) => Promise<{ date: string; lines: LineInput[]; memo: string } | null>> = {
    StockMoved: async (ctx, event) => {
      const p = event.payload as unknown as StockMovedPayload;
      const settings = await this.ledger.settings(ctx);
      const counters = new Map<PostingRole, number>();
      let inventory = 0;
      for (const m of p.movements) {
        const role = STOCK_COUNTER[m.type];
        if (!role || !m.value) continue;
        inventory += m.value;
        counters.set(role, (counters.get(role) ?? 0) - m.value);
      }
      if (!inventory && ![...counters.values()].some(Boolean)) return null;
      const ref = p.reference?.label ? ` · ${p.reference.label}` : "";
      const lines: LineInput[] = [{ accountId: this.ledger.account(settings, "inventory"), debit: inventory, description: "Stock value" }];
      for (const [role, amount] of counters) lines.push({ accountId: this.ledger.account(settings, role), debit: amount, description: role });
      return { date: event.occurredAt.slice(0, 10), lines, memo: `Stock movement${ref}` };
    },
  };

  onModuleInit(): void {
    for (const type of Object.keys(this.handlers)) {
      this.events.subscribe(type, `finance.post.${type}`, async (event) => void (await this.handle(event)));
    }
  }

  journalId(event: DomainEvent): string {
    return createHash("sha256").update(`${event.companyId}:${event.id}`).digest("hex").slice(0, 28);
  }

  /** Posts the event once; a failure is recorded as an issue rather than retried forever. */
  async handle(event: DomainEvent): Promise<JournalDoc | null> {
    if (!(await this.modules.isEnabled(event.tenantId, "finance"))) return null;
    const ctx = systemContext(event);
    const settings = await this.ledger.settings(ctx);
    if (!settings) return null;
    const id = this.journalId(event);
    if ((await this.ledger.journals.ref(id).get()).exists) return null;
    try {
      const built = await this.handlers[event.type]!(ctx, event);
      if (!built) return null;
      const journal = await this.firestore.runTransaction(async (tx) => {
        if ((await tx.get(this.ledger.journals.ref(id))).exists) return null;
        const plan = await this.ledger.prepare(tx, ctx, {
          id, date: built.date, lines: built.lines, source: "system", sourceEvent: { type: event.type, id: event.id }, memo: built.memo,
          reference: { entityType: event.entity, entityId: event.entityId, label: (event.payload as { reference?: { label?: string } }).reference?.label ?? null },
        }, { withNumber: true });
        return plan.commitNew();
      });
      const issue = this.issueRef(ctx, event.id);
      if ((await issue.get()).exists) await issue.update({ status: "resolved", resolvedAt: new Date().toISOString() });
      return journal;
    } catch (error) {
      const issue: PostingIssueDoc = {
        id: `${ctx.companyId}_${event.id}`, tenantId: ctx.tenantId, companyId: ctx.companyId, eventId: event.id, eventType: event.type, entity: event.entity,
        entityId: event.entityId, error: error instanceof Error ? error.message : String(error), status: "open", createdAt: new Date().toISOString(), resolvedAt: null,
      };
      await this.issueRef(ctx, event.id).set(issue);
      return null;
    }
  }

  private issueRef(scope: Scope, eventId: string) {
    return this.firestore.collection<PostingIssueDoc>(FINANCE_COLLECTIONS.issues).doc(`${scope.companyId}_${eventId}`);
  }

  async issues(ctx: RequestContext, status: "open" | "resolved" = "open"): Promise<PostingIssueDoc[]> {
    const snap = await this.firestore.collection<PostingIssueDoc>(FINANCE_COLLECTIONS.issues).where("companyId", "==", ctx.companyId).where("status", "==", status).limit(500).get();
    return snap.docs.map((d) => d.data()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Tries an issue's event again (after fixing the period or account mapping). */
  async retry(ctx: RequestContext, issueId: string): Promise<{ journal: JournalDoc | null; issue: PostingIssueDoc | null }> {
    const issue = (await this.firestore.collection<PostingIssueDoc>(FINANCE_COLLECTIONS.issues).doc(issueId).get()).data();
    if (!issue || issue.companyId !== ctx.companyId) throw new BadRequestException("Issue not found");
    const event = (await this.firestore.collection<DomainEvent>("domainEvents").doc(issue.eventId).get()).data();
    if (!event) throw new BadRequestException("The event is no longer available");
    const journal = await this.handle({ ...event, id: issue.eventId });
    const after = (await this.issueRef(ctx, issue.eventId).get()).data() ?? null;
    return { journal, issue: after };
  }
}

// ─── Reports ──────────────────────────────────────────────────────────────────

interface AccountRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  /** Signed in the account's normal direction (debit-normal for assets and expenses). */
  balance: number;
}

@Injectable()
export class FinanceReportsService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly accounts: AccountService,
  ) {}

  private async balances(ctx: RequestContext, range: { from?: string; to?: string }): Promise<Map<string, { debit: number; credit: number }>> {
    let q = this.firestore.collection<BalanceDoc>(FINANCE_COLLECTIONS.balances).where("companyId", "==", ctx.companyId);
    if (range.from) q = q.where("period", ">=", range.from);
    if (range.to) q = q.where("period", "<=", range.to);
    const out = new Map<string, { debit: number; credit: number }>();
    for (const d of (await q.get()).docs) {
      const b = d.data();
      const row = out.get(b.accountId) ?? { debit: 0, credit: 0 };
      row.debit += b.debit;
      row.credit += b.credit;
      out.set(b.accountId, row);
    }
    return out;
  }

  private async rows(ctx: RequestContext, range: { from?: string; to?: string }, types?: AccountType[]): Promise<AccountRow[]> {
    const [chart, sums] = await Promise.all([this.accounts.repo.all(ctx), this.balances(ctx, range)]);
    return chart
      .filter((a) => !a.isGroup && (!types || types.includes(a.type)))
      .map((a) => {
        const s = sums.get(a.id) ?? { debit: 0, credit: 0 };
        return { accountId: a.id, code: a.code, name: a.name, type: a.type, debit: s.debit, credit: s.credit, balance: DEBIT_NORMAL.has(a.type) ? s.debit - s.credit : s.credit - s.debit };
      })
      .filter((r) => r.debit || r.credit)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  /** Every account's debits and credits up to the end of `to` (YYYY-MM). */
  async trialBalance(ctx: RequestContext, to?: string) {
    const rows = await this.rows(ctx, { to });
    const lines = rows.map((r) => {
      const net = r.debit - r.credit;
      return { ...r, closingDebit: Math.max(0, net), closingCredit: Math.max(0, -net) };
    });
    return {
      to: to ?? null,
      lines,
      totalDebit: lines.reduce((a, l) => a + l.closingDebit, 0),
      totalCredit: lines.reduce((a, l) => a + l.closingCredit, 0),
    };
  }

  /** Income less expenses for the months from..to. */
  async profitAndLoss(ctx: RequestContext, from?: string, to?: string) {
    const rows = await this.rows(ctx, { from, to }, ["income", "expense"]);
    const income = rows.filter((r) => r.type === "income");
    const expenses = rows.filter((r) => r.type === "expense");
    const totalIncome = income.reduce((a, r) => a + r.balance, 0);
    const totalExpenses = expenses.reduce((a, r) => a + r.balance, 0);
    return { from: from ?? null, to: to ?? null, income, expenses, totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses };
  }

  /** Assets, liabilities and equity at the end of `to`; unclosed profit shows as current-year earnings. */
  async balanceSheet(ctx: RequestContext, to?: string) {
    const rows = await this.rows(ctx, { to });
    const pick = (t: AccountType) => rows.filter((r) => r.type === t);
    const sum = (rs: AccountRow[]) => rs.reduce((a, r) => a + r.balance, 0);
    const earnings = sum(pick("income")) - sum(pick("expense"));
    const assets = pick("asset");
    const liabilities = pick("liability");
    const equity = pick("equity");
    const totalEquity = sum(equity) + earnings;
    return {
      to: to ?? null, assets, liabilities, equity, currentEarnings: earnings,
      totalAssets: sum(assets), totalLiabilities: sum(liabilities), totalEquity,
      balanced: sum(assets) === sum(liabilities) + totalEquity,
    };
  }

  /** Posted lines on one account with a running balance. */
  async accountLedger(ctx: RequestContext, accountId: string, from?: string, to?: string) {
    const account = await this.accounts.repo.get(ctx, accountId);
    if (account.isGroup) throw new BadRequestException("Choose a postable account");
    let q = this.firestore.collection<EntryDoc>(FINANCE_COLLECTIONS.entries).where("companyId", "==", ctx.companyId).where("accountId", "==", accountId);
    if (from) q = q.where("date", ">=", from);
    if (to) q = q.where("date", "<=", to);
    const entries = (await q.orderBy("date").limit(5_000).get()).docs.map((d) => d.data())
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    let opening = 0;
    if (from) {
      const before = await this.balances(ctx, { to: prevMonth(from.slice(0, 7)) });
      const b = before.get(accountId) ?? { debit: 0, credit: 0 };
      opening = DEBIT_NORMAL.has(account.type) ? b.debit - b.credit : b.credit - b.debit;
      // Entries earlier in the first month count towards the opening balance.
      const early = (await this.firestore.collection<EntryDoc>(FINANCE_COLLECTIONS.entries).where("companyId", "==", ctx.companyId).where("accountId", "==", accountId)
        .where("date", ">=", `${from.slice(0, 7)}-01`).where("date", "<", from).get()).docs.map((d) => d.data());
      for (const e of early) opening += DEBIT_NORMAL.has(account.type) ? e.debit - e.credit : e.credit - e.debit;
    }
    let running = opening;
    const lines = entries.map((e) => {
      running += DEBIT_NORMAL.has(account.type) ? e.debit - e.credit : e.credit - e.debit;
      return { ...e, balance: running };
    });
    return { account: { id: account.id, code: account.code, name: account.name, type: account.type }, opening, lines, closing: running };
  }
}

function prevMonth(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

