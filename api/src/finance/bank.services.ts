import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { toMinor } from "../platform/data/money.js";
import { AccountDoc, EntryDoc, FINANCE_COLLECTIONS } from "./finance.models.js";
import { BANK_COLLECTIONS, ReconciliationDoc, StatementLineDoc } from "./bank.models.js";
import { ImportStatementDto, ReconcileDto, TransferDto } from "./bank.dto.js";
import { GeneralLedger } from "./ledger.service.js";

const today = () => new Date().toISOString().slice(0, 10);

export interface ParsedLine {
  date: string;
  description: string;
  reference: string | null;
  /** Signed minor units (money in positive). */
  amount: number;
}

/** "1,234.50", "(12.00)", "-12", "12.00 CR" → signed minor units. */
export function parseAmount(raw: string, currency = "LKR"): number {
  let s = raw.trim().replace(/[\s,]/g, "");
  if (!s) return 0;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/DR$/i.test(s)) {
    sign = -1;
    s = s.slice(0, -2);
  } else if (/CR$/i.test(s)) s = s.slice(0, -2);
  if (s.startsWith("-")) {
    sign = -sign;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/[^\d.]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new BadRequestException(`Cannot read the amount "${raw}"`);
  const [whole, frac = ""] = s.split(".");
  return sign * toMinor(`${whole}${frac ? `.${frac.slice(0, 4)}` : ""}`, currency);
}

export function parseDate(raw: string, order: "YMD" | "DMY" | "MDY" = "YMD"): string {
  const s = raw.trim();
  if (/^\d{8}/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const parts = s.split(/[-/.\s]/).filter(Boolean);
  if (parts.length < 3) throw new BadRequestException(`Cannot read the date "${raw}"`);
  let [y, m, d] = order === "YMD" || parts[0]!.length === 4 ? parts : order === "DMY" ? [parts[2], parts[1], parts[0]] : [parts[2], parts[0], parts[1]];
  if (y!.length === 2) y = `20${y}`;
  const iso = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso))) throw new BadRequestException(`Cannot read the date "${raw}"`);
  return iso;
}

/** Splits one CSV row, honouring quotes. */
function cells(row: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (quoted) {
      if (ch === '"' && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** CSV with a header row: date, description/narration/details, amount or debit+credit (withdrawal/deposit), optional reference. */
export function parseCsv(content: string, order: "YMD" | "DMY" | "MDY" = "YMD", currency = "LKR"): ParsedLine[] {
  const rows = content.replace(/^﻿/, "").split(/\r?\n/).filter((r) => r.trim());
  if (rows.length < 2) throw new BadRequestException("The file has no transactions");
  const sep = [",", ";", "\t"].sort((a, b) => rows[0]!.split(b).length - rows[0]!.split(a).length)[0]!;
  const header = cells(rows[0]!, sep).map((h) => h.toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const iDate = find("date", "posted", "value date");
  const iDesc = find("description", "narration", "details", "particulars", "memo", "payee");
  const iAmount = header.findIndex((h) => h === "amount" || h === "amt");
  const iDebit = find("debit", "withdrawal", "money out", "paid out");
  const iCredit = find("credit", "deposit", "money in", "paid in");
  const iRef = find("reference", "ref", "cheque", "check");
  if (iDate < 0 || (iAmount < 0 && (iDebit < 0 || iCredit < 0))) throw new BadRequestException("The header needs a date column and an amount (or debit and credit) column");
  return rows.slice(1).map((row, n) => {
    const c = cells(row, sep);
    try {
      const amount = iAmount >= 0 ? parseAmount(c[iAmount] ?? "", currency) : parseAmount(c[iCredit] ?? "", currency) - parseAmount(c[iDebit] ?? "", currency);
      return { date: parseDate(c[iDate] ?? "", order), description: (iDesc >= 0 ? c[iDesc] : "") || "—", reference: iRef >= 0 ? c[iRef] || null : null, amount };
    } catch (error) {
      throw new BadRequestException(`Row ${n + 2}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/** OFX/QFX: each <STMTTRN> with DTPOSTED, TRNAMT, NAME/MEMO and FITID. Works for SGML and XML flavours. */
export function parseOfx(content: string, currency = "LKR"): ParsedLine[] {
  const blocks = content.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]!);
  if (!blocks.length) throw new BadRequestException("No transactions found in the OFX file");
  const tag = (b: string, name: string) => new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(b)?.[1]?.trim() ?? "";
  return blocks.map((b) => ({
    date: parseDate(tag(b, "DTPOSTED").slice(0, 8)),
    description: tag(b, "NAME") || tag(b, "MEMO") || "—",
    reference: tag(b, "FITID") || tag(b, "CHECKNUM") || null,
    amount: parseAmount(tag(b, "TRNAMT"), currency),
  }));
}

@Injectable()
export class BankService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly ledger: GeneralLedger,
    private readonly audit: AuditService,
  ) {}

  private lines() {
    return this.firestore.collection<StatementLineDoc>(BANK_COLLECTIONS.lines);
  }

  private entries() {
    return this.firestore.collection<EntryDoc>(FINANCE_COLLECTIONS.entries);
  }

  /** A postable bank or cash account of this company. */
  async bankAccount(ctx: RequestContext, id: string): Promise<AccountDoc> {
    const a = (await this.firestore.collection<AccountDoc>(FINANCE_COLLECTIONS.accounts).doc(id).get()).data();
    if (!a || a.companyId !== ctx.companyId || a.archivedAt || a.isGroup) throw new BadRequestException("Account not found");
    if (a.subtype !== "bank" && a.subtype !== "cash") throw new BadRequestException(`${a.code} ${a.name} is not a bank or cash account`);
    return a;
  }

  /** Bank and cash accounts with their ledger balance and what is still unmatched. */
  async accounts(ctx: RequestContext) {
    const all = (await this.firestore.collection<AccountDoc>(FINANCE_COLLECTIONS.accounts).where("companyId", "==", ctx.companyId).get()).docs.map((d) => d.data())
      .filter((a) => !a.isGroup && !a.archivedAt && (a.subtype === "bank" || a.subtype === "cash"));
    return Promise.all(all.map(async (a) => {
      const entries = (await this.entries().where("companyId", "==", ctx.companyId).where("accountId", "==", a.id).get()).docs.map((d) => d.data());
      const unmatched = (await this.lines().where("companyId", "==", ctx.companyId).where("accountId", "==", a.id).where("status", "==", "unmatched").get()).size;
      const last = (await this.reconciliations(ctx, a.id))[0] ?? null;
      return {
        id: a.id, code: a.code, name: a.name, subtype: a.subtype, currency: a.currency,
        balance: entries.reduce((s, e) => s + e.debit - e.credit, 0), unmatchedStatementLines: unmatched,
        lastReconciled: last ? { statementDate: last.statementDate, statementBalance: last.statementBalance } : null,
      };
    }));
  }

  /** Moves money between two bank or cash accounts. */
  async transfer(ctx: RequestContext, dto: TransferDto) {
    if (dto.fromAccountId === dto.toAccountId) throw new BadRequestException("Choose two different accounts");
    const [from, to] = await Promise.all([this.bankAccount(ctx, dto.fromAccountId), this.bankAccount(ctx, dto.toAccountId)]);
    const base = (await this.ledger.settings(ctx))?.baseCurrency ?? "LKR";
    if ((from.currency ?? base) !== (to.currency ?? base)) throw new BadRequestException("Transfers between currencies are not supported yet; post a journal");
    const amount = toMinor(dto.amount, base);
    if (amount <= 0) throw new BadRequestException("The amount must be positive");
    return this.ledger.post(ctx, {
      date: dto.date?.slice(0, 10) ?? today(), source: "system", memo: dto.memo ?? `Transfer ${from.code} → ${to.code}`,
      reference: { entityType: "finance.bankTransfer", entityId: randomUUID(), label: "Bank transfer" },
      lines: [{ accountId: to.id, debit: amount, description: `From ${from.name}` }, { accountId: from.id, credit: amount, description: `To ${to.name}` }],
    });
  }

  /** Stores statement lines, skipping ones already imported, then matches what it can. */
  async importStatement(ctx: RequestContext, dto: ImportStatementDto) {
    const account = await this.bankAccount(ctx, dto.accountId);
    const currency = account.currency ?? (await this.ledger.settings(ctx))?.baseCurrency ?? "LKR";
    const parsed = dto.format === "csv" ? parseCsv(dto.content, dto.dateOrder, currency) : parseOfx(dto.content, currency);
    const importId = randomUUID();
    const now = new Date().toISOString();
    const seen = new Map<string, number>();
    const docs: StatementLineDoc[] = parsed.map((p) => {
      const key = `${p.date}|${p.amount}|${p.description}|${p.reference ?? ""}`;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      const id = createHash("sha256").update(`${ctx.companyId}|${account.id}|${key}|${n}`).digest("hex").slice(0, 32);
      return { id, tenantId: ctx.tenantId, companyId: ctx.companyId, accountId: account.id, importId, date: p.date, description: p.description, reference: p.reference, amount: p.amount, status: "unmatched", entryIds: [], matchedBy: null, createdAt: now, updatedAt: now };
    });
    const existing = new Set<string>();
    for (let i = 0; i < docs.length; i += 300) {
      const chunk = docs.slice(i, i + 300);
      for (const s of await this.firestore.db.getAll(...chunk.map((d) => this.lines().doc(d.id)))) if (s.exists) existing.add(s.id);
    }
    const fresh = docs.filter((d) => !existing.has(d.id));
    for (let i = 0; i < fresh.length; i += 400) {
      const batch = this.firestore.db.batch();
      for (const d of fresh.slice(i, i + 400)) batch.create(this.lines().doc(d.id), d);
      await batch.commit();
    }
    this.audit.record(ctx, { module: "finance", action: "statement.imported", entity: "finance.account", entityId: account.id, after: { importId, lines: fresh.length, skipped: docs.length - fresh.length } });
    const matched = await this.autoMatch(ctx, account.id);
    return { importId, imported: fresh.length, duplicates: docs.length - fresh.length, matched };
  }

  async statementLines(ctx: RequestContext, accountId: string, status?: "unmatched" | "matched") {
    let q = this.lines().where("companyId", "==", ctx.companyId).where("accountId", "==", accountId);
    if (status) q = q.where("status", "==", status);
    return (await q.limit(5_000).get()).docs.map((d) => d.data()).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  }

  /** Ledger lines on the account that no statement line has claimed yet. */
  async unmatchedEntries(ctx: RequestContext, accountId: string) {
    const entries = (await this.entries().where("companyId", "==", ctx.companyId).where("accountId", "==", accountId).limit(10_000).get()).docs.map((d) => d.data());
    return entries.filter((e) => !(e as EntryDoc & { statementLineId?: string | null }).statementLineId)
      .map((e) => ({ id: e.id, journalId: e.journalId, journalNumber: e.journalNumber, date: e.date, description: e.description, reference: e.reference, amount: e.debit - e.credit }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** One-to-one matches on exact amount within a week, closest date first. */
  async autoMatch(ctx: RequestContext, accountId: string): Promise<number> {
    const lines = (await this.statementLines(ctx, accountId, "unmatched")).sort((a, b) => a.date.localeCompare(b.date));
    const pool = await this.unmatchedEntries(ctx, accountId);
    const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
    let matched = 0;
    for (const line of lines) {
      const candidates = pool.filter((e) => e.amount === line.amount && days(e.date, line.date) <= 7).sort((a, b) => days(a.date, line.date) - days(b.date, line.date));
      const pick = candidates[0];
      if (!pick) continue;
      pool.splice(pool.indexOf(pick), 1);
      await this.applyMatch(ctx, line.id, [pick.id], "auto");
      matched++;
    }
    return matched;
  }

  private async applyMatch(ctx: RequestContext, lineId: string, entryIds: string[], by: "auto" | "manual" | "created") {
    return this.firestore.runTransaction(async (tx) => {
      const line = (await tx.get(this.lines().doc(lineId))).data();
      if (!line || line.companyId !== ctx.companyId) throw new BadRequestException("Statement line not found");
      if (line.status === "matched") throw new BadRequestException("This line is already matched");
      const snaps = await tx.getAll(...entryIds.map((id) => this.entries().doc(id)));
      let sum = 0;
      for (const s of snaps) {
        const e = s.data() as (EntryDoc & { statementLineId?: string | null }) | undefined;
        if (!e || e.companyId !== ctx.companyId || e.accountId !== line.accountId) throw new BadRequestException("Choose ledger lines on the same account");
        if (e.statementLineId) throw new BadRequestException(`${e.journalNumber} is already matched`);
        sum += e.debit - e.credit;
      }
      if (sum !== line.amount) throw new BadRequestException("The ledger lines do not add up to the statement amount");
      for (const s of snaps) tx.update(s.ref, { statementLineId: lineId });
      const after: StatementLineDoc = { ...line, status: "matched", entryIds, matchedBy: by, updatedAt: new Date().toISOString() };
      tx.set(this.lines().doc(lineId), after);
      return after;
    });
  }

  match(ctx: RequestContext, lineId: string, entryIds: string[]) {
    return this.applyMatch(ctx, lineId, [...new Set(entryIds)], "manual");
  }

  async unmatch(ctx: RequestContext, lineId: string) {
    return this.firestore.runTransaction(async (tx) => {
      const line = (await tx.get(this.lines().doc(lineId))).data();
      if (!line || line.companyId !== ctx.companyId) throw new BadRequestException("Statement line not found");
      if (line.status !== "matched") throw new BadRequestException("This line is not matched");
      const last = (await this.reconciliations(ctx, line.accountId))[0];
      if (last && line.date <= last.statementDate) throw new BadRequestException(`Reconciled up to ${last.statementDate}; this line cannot change`);
      const snaps = await tx.getAll(...line.entryIds.map((id) => this.entries().doc(id)));
      for (const s of snaps) if (s.exists) tx.update(s.ref, { statementLineId: null });
      const after: StatementLineDoc = { ...line, status: "unmatched", entryIds: [], matchedBy: null, updatedAt: new Date().toISOString() };
      tx.set(this.lines().doc(lineId), after);
      return after;
    });
  }

  /** Posts a statement line that has no ledger entry yet (bank charges, interest) and matches it. */
  async createFromLine(ctx: RequestContext, lineId: string, accountId: string, description?: string) {
    const line = (await this.lines().doc(lineId).get()).data();
    if (!line || line.companyId !== ctx.companyId) throw new BadRequestException("Statement line not found");
    if (line.status === "matched") throw new BadRequestException("This line is already matched");
    const amount = Math.abs(line.amount);
    const into = line.amount > 0;
    const journal = await this.ledger.post(ctx, {
      date: line.date, source: "system", memo: description ?? line.description, reference: { entityType: "finance.statementLine", entityId: line.id, label: line.reference ?? line.description },
      lines: [
        { accountId: line.accountId, [into ? "debit" : "credit"]: amount, description: description ?? line.description },
        { accountId, [into ? "credit" : "debit"]: amount, description: description ?? line.description },
      ],
    });
    const entryId = `${journal.id}_0`;
    return { journal, line: await this.applyMatch(ctx, lineId, [entryId], "created") };
  }

  /** Records a reconciliation when the cleared ledger balance equals the statement balance. */
  async reconcile(ctx: RequestContext, dto: ReconcileDto): Promise<ReconciliationDoc> {
    const account = await this.bankAccount(ctx, dto.accountId);
    const currency = account.currency ?? (await this.ledger.settings(ctx))?.baseCurrency ?? "LKR";
    const date = dto.statementDate.slice(0, 10);
    const statementBalance = parseAmount(dto.statementBalance, currency);
    const entries = (await this.entries().where("companyId", "==", ctx.companyId).where("accountId", "==", account.id).where("date", "<=", date).get()).docs
      .map((d) => d.data() as EntryDoc & { statementLineId?: string | null });
    const cleared = entries.filter((e) => e.statementLineId).reduce((a, e) => a + e.debit - e.credit, 0);
    const book = entries.reduce((a, e) => a + e.debit - e.credit, 0);
    if (cleared !== statementBalance) {
      throw new BadRequestException(`Matched lines come to ${cleared / 100} but the statement shows ${statementBalance / 100}; match or post the difference first`);
    }
    const doc: ReconciliationDoc = {
      id: randomUUID(), tenantId: ctx.tenantId, companyId: ctx.companyId, accountId: account.id, statementDate: date, statementBalance, clearedBalance: cleared, bookBalance: book,
      outstanding: entries.filter((e) => !e.statementLineId).map((e) => ({ entryId: e.id, date: e.date, description: e.description, amount: e.debit - e.credit })),
      createdAt: new Date().toISOString(), createdBy: ctx.userId,
    };
    await this.firestore.collection<ReconciliationDoc>(BANK_COLLECTIONS.reconciliations).doc(doc.id).set(doc);
    this.audit.record(ctx, { module: "finance", action: "reconciled", entity: "finance.account", entityId: account.id, after: { statementDate: date, statementBalance } });
    return doc;
  }

  async reconciliations(ctx: RequestContext, accountId: string): Promise<ReconciliationDoc[]> {
    const snap = await this.firestore.collection<ReconciliationDoc>(BANK_COLLECTIONS.reconciliations).where("companyId", "==", ctx.companyId).where("accountId", "==", accountId).get();
    return snap.docs.map((d) => d.data()).sort((a, b) => b.statementDate.localeCompare(a.statementDate) || b.createdAt.localeCompare(a.createdAt));
  }
}
