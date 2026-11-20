import { ConflictException, Injectable } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { Scope } from "../context/request-context.js";

export const UNIQUES_COLLECTION = "uniques";

interface UniqueDoc {
  companyId: string;
  entity: string;
  field: string;
  value: string;
  ownerId: string;
  createdAt: string;
}

/**
 * Per-company uniqueness (customer codes, SKUs, account numbers) without
 * baking the value into document ids, so values stay editable. Each claimed
 * value is a small document; claims happen inside the caller's transaction.
 *
 * Usage inside a transaction: `const claim = await unique.check(...)` during
 * the read phase, then `unique.apply(tx, claim)` during the write phase.
 */
@Injectable()
export class UniqueService {
  constructor(private readonly firestore: FirestoreService) {}

  static normalize(value: string): string {
    return value.trim().toLowerCase();
  }

  private key(scope: Scope, entity: string, field: string, value: string): string {
    // Document ids may not contain "/", and are limited to 1500 bytes.
    const safe = encodeURIComponent(UniqueService.normalize(value)).slice(0, 900);
    return `${scope.companyId}__${entity}__${field}__${safe}`;
  }

  /**
   * Read phase: verifies `value` is free (or already owned by `ownerId`).
   * Throws 409 when another record holds it. Returns what to write.
   */
  async check(
    tx: Transaction,
    scope: Scope,
    params: { entity: string; field: string; value: string; ownerId: string; previousValue?: string | null; label?: string },
  ): Promise<UniqueClaim> {
    const { entity, field, value, ownerId, previousValue } = params;
    const ref = this.firestore.collection<UniqueDoc>(UNIQUES_COLLECTION).doc(this.key(scope, entity, field, value));
    const existing = (await tx.get(ref)).data();
    if (existing && existing.ownerId !== ownerId) {
      throw new ConflictException(`${params.label ?? field} "${value}" is already in use`);
    }
    const changed = previousValue != null && UniqueService.normalize(previousValue) !== UniqueService.normalize(value);
    return {
      claim: existing ? null : { ref, doc: { companyId: scope.companyId, entity, field, value, ownerId, createdAt: new Date().toISOString() } },
      release: changed
        ? this.firestore.collection<UniqueDoc>(UNIQUES_COLLECTION).doc(this.key(scope, entity, field, previousValue!))
        : null,
    };
  }

  /** Write phase. */
  apply(tx: Transaction, claim: UniqueClaim): void {
    if (claim.claim) tx.set(claim.claim.ref, claim.claim.doc);
    if (claim.release) tx.delete(claim.release);
  }

  /** Releases a value, e.g. when a record is deleted. */
  release(tx: Transaction, scope: Scope, entity: string, field: string, value: string): void {
    tx.delete(this.firestore.collection<UniqueDoc>(UNIQUES_COLLECTION).doc(this.key(scope, entity, field, value)));
  }
}

export interface UniqueClaim {
  claim: { ref: FirebaseFirestore.DocumentReference<UniqueDoc>; doc: UniqueDoc } | null;
  release: FirebaseFirestore.DocumentReference<UniqueDoc> | null;
}
