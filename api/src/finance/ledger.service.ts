import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { hasPermission, RequestContext, Scope } from "../platform/context/request-context.js";
import { SequenceService } from "../platform/data/sequence.service.js";
import { NewDoc, TenantRepository } from "../platform/data/repository.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { FiscalYearService } from "../org/org.services.js";
import {
  AccountDoc,
  BalanceDoc,
  EntryDoc,
  FINANCE_COLLECTIONS,
  FinanceSettingsDoc,
  JournalDoc,
  JournalLine,
  PostingRole,
  RecordRef,
} from "./finance.models.js";

export type LineInput = Partial<Omit<JournalLine, "lineId" | "accountId" | "debit" | "credit">> & { accountId: string; debit?: number; credit?: number };

export interface PostingInput {
  date: string;
  lines: LineInput[];
  source: JournalDoc["source"];
  sourceEvent?: JournalDoc["sourceEvent"];
  reference?: RecordRef | null;
  memo?: string | null;
  /** Fixed id (system postings use one derived from the event, for idempotency). */
  id?: string;
  reversalOfId?: string | null;
}

export const JOURNAL_NUMBERING = { key: "journal", prefix: "JE", yearly: true } as const;

const balanceId = (companyId: string, accountId: string, period: string) => `${companyId}_${accountId}_${period}`;

/**
 * The posting engine. Every journal, manual or automatic, goes through
 * `prepare` (all reads: accounts, fiscal period, balances, number) and then
 * `commit` (all writes: the journal, one entry per line, monthly balances),
 * so callers can post inside their own Firestore transaction.
 */
@Injectable()
export class GeneralLedger {
  readonly journals: TenantRepository<JournalDoc>;
  private readonly sequences: SequenceService;

  constructor(
    private readonly firestore: FirestoreService,
    private readonly fiscal: FiscalYearService,
    private readonly audit: AuditService,
  ) {
    this.journals = new TenantRepository(firestore, FINANCE_COLLECTIONS.journals, "Journal");
    this.sequences = new SequenceService(firestore);
  }

  async settings(scope: Scope, tx?: Transaction): Promise<FinanceSettingsDoc | null> {
    const ref = this.firestore.collection<FinanceSettingsDoc>(FINANCE_COLLECTIONS.settings).doc(scope.companyId);
    return ((tx ? await tx.get(ref) : await ref.get()).data() as FinanceSettingsDoc | undefined) ?? null;
  }

  /** The account mapped to a posting role; throws a clear message when it is not set up. */
  account(settings: FinanceSettingsDoc | null, role: PostingRole): string {
    const id = settings?.accounts[role];
    if (!id) throw new BadRequestException(`No account is mapped for ${role}; set it in finance settings`);
    return id;
  }

  /** Normalises and checks lines: whole minor units, one side each, balanced, nothing empty. */
  normalise(lines: LineInput[]): JournalLine[] {
    const out: JournalLine[] = [];
    for (const l of lines) {
      const debit = l.debit ?? 0;
      const credit = l.credit ?? 0;
      if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) throw new BadRequestException("Amounts must be whole minor units");
      if (debit < 0 || credit < 0) {
        // A negative amount is the other side.
        out.push(this.line(l, Math.max(0, debit) + Math.max(0, -credit), Math.max(0, credit) + Math.max(0, -debit)));
        continue;
      }
      if (debit && credit) {
        const net = debit - credit;
        out.push(this.line(l, Math.max(0, net), Math.max(0, -net)));
        continue;
      }
      out.push(this.line(l, debit, credit));
    }
    const lines2 = out.filter((l) => l.debit || l.credit);
    if (lines2.length < 2) throw new BadRequestException("A journal needs at least two non-zero lines");
    const dr = lines2.reduce((a, l) => a + l.debit, 0);
    const cr = lines2.reduce((a, l) => a + l.credit, 0);
    if (dr !== cr) throw new BadRequestException(`Debits (${dr}) and credits (${cr}) must be equal`);
    return lines2;
  }

  private line(l: LineInput, debit: number, credit: number): JournalLine {
    return {
      lineId: randomUUID().slice(0, 8), accountId: l.accountId, debit, credit, description: l.description ?? null,
      partyType: l.partyType ?? null, partyId: l.partyId ?? null, branchId: l.branchId ?? null, departmentId: l.departmentId ?? null,
      costCentreId: l.costCentreId ?? null, projectId: l.projectId ?? null, currency: l.currency ?? null, foreignAmount: l.foreignAmount ?? null,
    };
  }

  /** Read-only checks for draft journals (accounts exist, are postable and allowed). */
  async checkAccounts(ctx: RequestContext, lines: JournalLine[], manual: boolean, tx?: Transaction): Promise<Map<string, AccountDoc>> {
    const ids = [...new Set(lines.map((l) => l.accountId))];
    const refs = ids.map((id) => this.firestore.collection<AccountDoc>(FINANCE_COLLECTIONS.accounts).doc(id));
    const snaps = tx ? await tx.getAll(...refs) : await this.firestore.db.getAll(...refs);
    const map = new Map<string, AccountDoc>();
    for (const snap of snaps) {
      const a = snap.data() as AccountDoc | undefined;
      if (!a || a.companyId !== ctx.companyId || a.archivedAt) throw new BadRequestException("Account not found");
      if (a.isGroup) throw new BadRequestException(`${a.code} ${a.name} is a group account; post to one of its accounts`);
      if (a.status !== "active") throw new BadRequestException(`${a.code} ${a.name} is inactive`);
      if (manual && a.isControl && !hasPermission(ctx, "finance.journal.control")) {
        throw new ForbiddenException(`${a.code} ${a.name} is a control account; it is posted from its sub-ledger`);
      }
      map.set(snap.id, a);
    }
    return map;
  }

  /**
   * Read phase. Returns the normalised lines and `commit(journal)`, which
   * writes the entries and balances for the journal (whose doc the caller
   * writes, or `commitNew` writes a new posted journal).
   */
  async prepare(tx: Transaction, ctx: RequestContext, input: PostingInput, options: { manual?: boolean; withNumber?: boolean } = {}) {
    const lines = this.normalise(input.lines);
    const date = input.date.slice(0, 10);
    const period = date.slice(0, 7);
    await this.checkAccounts(ctx, lines, options.manual ?? false, tx);
    await this.fiscal.assertPostable(ctx, date, tx);
    const currency = (await this.settings(ctx, tx))?.baseCurrency ?? "LKR";
    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const balanceRefs = accountIds.map((a) => this.firestore.collection<BalanceDoc>(FINANCE_COLLECTIONS.balances).doc(balanceId(ctx.companyId, a, period)));
    const balanceSnaps = await tx.getAll(...balanceRefs);
    const balances = new Map(balanceSnaps.map((s, i) => [accountIds[i]!, (s.data() as BalanceDoc | undefined) ?? null]));
    const reserved = options.withNumber ? await this.sequences.reserve(tx, ctx, JOURNAL_NUMBERING.key, { prefix: JOURNAL_NUMBERING.prefix, yearly: true, date: new Date(`${date}T00:00:00Z`) }) : null;
    const totalDebit = lines.reduce((a, l) => a + l.debit, 0);

    const writeLedger = (journal: Pick<JournalDoc, "id" | "number" | "reference">) => {
      const now = new Date().toISOString();
      lines.forEach((l, i) => {
        const entry: EntryDoc = {
          id: `${journal.id}_${i}`, tenantId: ctx.tenantId, companyId: ctx.companyId, journalId: journal.id, journalNumber: journal.number, date, period,
          accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description, partyType: l.partyType, partyId: l.partyId,
          branchId: l.branchId, departmentId: l.departmentId, costCentreId: l.costCentreId, projectId: l.projectId, reference: journal.reference ?? null, createdAt: now,
        };
        tx.set(this.firestore.collection(FINANCE_COLLECTIONS.entries).doc(entry.id), entry);
      });
      for (const accountId of accountIds) {
        const b = balances.get(accountId) ?? { id: balanceId(ctx.companyId, accountId, period), companyId: ctx.companyId, accountId, period, debit: 0, credit: 0, updatedAt: now };
        for (const l of lines) {
          if (l.accountId !== accountId) continue;
          b.debit += l.debit;
          b.credit += l.credit;
        }
        b.updatedAt = now;
        tx.set(this.firestore.collection(FINANCE_COLLECTIONS.balances).doc(b.id), b);
      }
    };

    return {
      lines,
      period,
      currency,
      totalDebit,
      number: reserved?.number ?? null,
      /** Writes entries and balances for an existing journal document. */
      writeLedger,
      /** Writes a new posted journal with its entries and balances. */
      commitNew: (): JournalDoc => {
        if (!reserved) throw new Error("prepare with withNumber to create a journal");
        reserved.commit();
        const data: NewDoc<JournalDoc> & { id?: string } = {
          ...(input.id ? { id: input.id } : {}),
          number: reserved.number, date, period, source: input.source, sourceEvent: input.sourceEvent ?? null, reference: input.reference ?? null,
          memo: input.memo ?? null, currency, lines, totalDebit, totalCredit: totalDebit, status: "posted", postedAt: new Date().toISOString(),
          reversalOfId: input.reversalOfId ?? null, reversedById: null,
        };
        const doc = this.journals.build(ctx, data);
        tx.create(this.journals.ref(doc.id), doc);
        writeLedger(doc);
        this.audit.record(ctx, { module: "finance", action: "posted", entity: "finance.journal", entityId: doc.id, after: { number: doc.number, totalDebit } }, tx);
        return doc;
      },
    };
  }

  /** Posts a new journal in its own transaction. */
  post(ctx: RequestContext, input: PostingInput): Promise<JournalDoc> {
    return this.firestore.runTransaction(async (tx) => (await this.prepare(tx, ctx, input, { withNumber: true })).commitNew());
  }
}
