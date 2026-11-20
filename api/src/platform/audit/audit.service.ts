import { Injectable } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { COLLECTIONS } from "../../firestore/collections.js";
import { AuditLogDoc } from "../../firestore/models.js";
import { RequestContext } from "../context/request-context.js";

export interface AuditEntry {
  module: string;
  /** Verb in past tense: "created", "updated", "posted", "approved", "archived" … */
  action: string;
  entity: string;
  entityId: string | null;
  before?: object | null;
  after?: object | null;
  reason?: string | null;
}

const IGNORED = new Set(["updatedAt", "updatedBy", "version"]);

/**
 * Append-only audit trail. Pass the transaction that made the change so the
 * entry commits (or fails) with it. Updates store only the fields that changed.
 */
@Injectable()
export class AuditService {
  constructor(private readonly firestore: FirestoreService) {}

  record(ctx: RequestContext, entry: AuditEntry, tx?: Transaction): AuditLogDoc {
    const { before, after } = diff(entry.before ?? null, entry.after ?? null);
    const ref = this.firestore.collection<AuditLogDoc>(COLLECTIONS.auditLogs).doc();
    const doc: AuditLogDoc = {
      id: ref.id,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      userId: ctx.userId,
      module: entry.module,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before,
      after,
      reason: entry.reason ?? null,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      createdAt: new Date().toISOString(),
    };
    if (tx) tx.create(ref, doc);
    else void ref.create(doc).catch((error) => console.error("audit write failed", error));
    return doc;
  }

  /** History of one record, newest first. */
  async forEntity(ctx: RequestContext, entity: string, entityId: string, limit = 100): Promise<AuditLogDoc[]> {
    const snap = await this.firestore
      .collection<AuditLogDoc>(COLLECTIONS.auditLogs)
      .where("companyId", "==", ctx.companyId)
      .where("entity", "==", entity)
      .where("entityId", "==", entityId)
      .orderBy("createdAt", "desc")
      .limit(Math.min(limit, 500))
      .get();
    return snap.docs.map((d) => d.data());
  }
}

function diff(
  before: object | null,
  after: object | null,
): { before: Record<string, unknown> | null; after: Record<string, unknown> | null } {
  if (!before || !after) {
    return { before: before as Record<string, unknown> | null, after: after as Record<string, unknown> | null };
  }
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (IGNORED.has(key)) continue;
    const bv = (before as Record<string, unknown>)[key];
    const av = (after as Record<string, unknown>)[key];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[key] = bv ?? null;
      a[key] = av ?? null;
    }
  }
  return { before: b, after: a };
}
