import { Injectable } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { Scope } from "../context/request-context.js";

export const SEQUENCES_COLLECTION = "sequences";

export interface SequenceOptions {
  /** e.g. "INV" gives INV-2026-000123. */
  prefix: string;
  /** Digits in the running number; default 6. */
  padding?: number;
  /** Restart numbering every calendar year (default true). */
  yearly?: boolean;
  /** Date the number belongs to; defaults to now. */
  date?: Date;
}

interface SequenceDoc {
  companyId: string;
  key: string;
  year: number | null;
  value: number;
  updatedAt: string;
}

/**
 * Gap-free document numbers per company and document type. `next` must run
 * inside the transaction that creates the document, before that transaction
 * writes anything (a Firestore rule), so a failed save never burns a number.
 */
@Injectable()
export class SequenceService {
  constructor(private readonly firestore: FirestoreService) {}

  async next(tx: Transaction, scope: Scope, key: string, options: SequenceOptions): Promise<string> {
    const reserved = await this.reserve(tx, scope, key, options);
    reserved.commit();
    return reserved.number;
  }

  /** Reserves `count` consecutive numbers at once (read phase); `commit()` before writing. */
  async reserveRange(tx: Transaction, scope: Scope, key: string, count: number, options: SequenceOptions): Promise<{ numbers: string[]; commit: () => void }> {
    const yearly = options.yearly ?? true;
    const year = yearly ? (options.date ?? new Date()).getUTCFullYear() : null;
    const ref = this.firestore
      .collection<SequenceDoc>(SEQUENCES_COLLECTION)
      .doc(`${scope.companyId}__${key}${year ? `__${year}` : ""}`);
    const start = ((await tx.get(ref)).data()?.value ?? 0) + 1;
    const numbers = Array.from({ length: count }, (_, i) => {
      const n = String(start + i).padStart(options.padding ?? 6, "0");
      return year ? `${options.prefix}-${year}-${n}` : `${options.prefix}-${n}`;
    });
    return {
      numbers,
      commit: () => tx.set(ref, { companyId: scope.companyId, key, year, value: start + count - 1, updatedAt: new Date().toISOString() }),
    };
  }

  /**
   * Read half of `next`, for transactions that still have reads to do: call
   * `commit()` once every read is done, before or with the other writes.
   */
  async reserve(tx: Transaction, scope: Scope, key: string, options: SequenceOptions): Promise<{ number: string; commit: () => void }> {
    const yearly = options.yearly ?? true;
    const year = yearly ? (options.date ?? new Date()).getUTCFullYear() : null;
    const ref = this.firestore
      .collection<SequenceDoc>(SEQUENCES_COLLECTION)
      .doc(`${scope.companyId}__${key}${year ? `__${year}` : ""}`);
    const snap = await tx.get(ref);
    const value = (snap.data()?.value ?? 0) + 1;
    const number = String(value).padStart(options.padding ?? 6, "0");
    return {
      number: year ? `${options.prefix}-${year}-${number}` : `${options.prefix}-${number}`,
      commit: () => tx.set(ref, { companyId: scope.companyId, key, year, value, updatedAt: new Date().toISOString() }),
    };
  }
}
