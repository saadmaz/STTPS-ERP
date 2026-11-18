import { ConflictException, NotFoundException } from "@nestjs/common";
import type {
  CollectionReference,
  DocumentReference,
  Query,
  Transaction,
  WhereFilterOp,
} from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { Scope } from "../context/request-context.js";

/** Fields every company-scoped document carries. */
export interface BaseDoc {
  id: string;
  tenantId: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  /** Incremented on every write; used for optimistic concurrency. */
  version: number;
  /** Set when archived (soft-deleted). Archived records are hidden from lists by default. */
  archivedAt: string | null;
}

export const BASE_FIELDS = [
  "id", "tenantId", "companyId", "createdAt", "updatedAt", "createdBy", "updatedBy", "version", "archivedAt",
] as const;

/** What a caller supplies to create a document: everything except the base fields (an id may be chosen). */
export type NewDoc<T extends BaseDoc> = Omit<T, keyof BaseDoc> & { id?: string };
/** What a caller may change: never the base fields. */
export type Patch<T extends BaseDoc> = Partial<Omit<T, keyof BaseDoc>>;

export type Filter = [field: string, op: WhereFilterOp, value: unknown];

export interface ListOptions {
  where?: Filter[];
  orderBy?: { field: string; direction?: "asc" | "desc" }[];
  /** Page size; defaults to 50, capped at 200. */
  limit?: number;
  /** The id of the last item of the previous page. */
  cursor?: string | null;
  includeArchived?: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface WriteResult<T> {
  before: T;
  after: T;
}

const MAX_PAGE = 200;

/**
 * Company-scoped data access. Every read checks the document's tenant and
 * company against the caller's scope, and every query is filtered by company,
 * so no module can read across tenants by mistake. Pass `tx` to take part in
 * a caller's transaction; remember Firestore requires all transaction reads
 * to happen before any writes.
 */
export class TenantRepository<T extends BaseDoc> {
  constructor(
    protected readonly firestore: FirestoreService,
    readonly collectionName: string,
    /** Human name used in error messages, e.g. "Lead". */
    readonly entityName: string,
  ) {}

  get collection(): CollectionReference<T> {
    return this.firestore.collection<T>(this.collectionName);
  }

  ref(id: string): DocumentReference<T> {
    return this.collection.doc(id);
  }

  newId(): string {
    return this.collection.doc().id;
  }

  /** The document, or null when it is missing or belongs to another company. */
  async find(scope: Scope, id: string, tx?: Transaction): Promise<T | null> {
    if (!id) return null;
    const snap = tx ? await tx.get(this.ref(id)) : await this.ref(id).get();
    const data = snap.data();
    if (!data || data.tenantId !== scope.tenantId || data.companyId !== scope.companyId) return null;
    return data;
  }

  async get(scope: Scope, id: string, tx?: Transaction): Promise<T> {
    const doc = await this.find(scope, id, tx);
    if (!doc) throw new NotFoundException(`${this.entityName} not found`);
    return doc;
  }

  /** Several documents by id, in the order given; missing or foreign ids are skipped. */
  async getMany(scope: Scope, ids: string[], tx?: Transaction): Promise<T[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    const refs = unique.map((id) => this.ref(id));
    const snaps = tx ? await tx.getAll(...refs) : await this.firestore.db.getAll(...refs);
    return snaps
      .map((s) => s.data() as T | undefined)
      .filter((d): d is T => !!d && d.tenantId === scope.tenantId && d.companyId === scope.companyId);
  }

  query(scope: Scope, options: Omit<ListOptions, "limit" | "cursor"> = {}): Query<T> {
    let q: Query<T> = this.collection.where("companyId", "==", scope.companyId);
    if (!options.includeArchived) q = q.where("archivedAt", "==", null);
    for (const [field, op, value] of options.where ?? []) q = q.where(field, op, value);
    const order = options.orderBy?.length ? options.orderBy : [{ field: "createdAt", direction: "desc" as const }];
    for (const { field, direction } of order) q = q.orderBy(field, direction ?? "asc");
    return q;
  }

  async list(scope: Scope, options: ListOptions = {}): Promise<Page<T>> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), MAX_PAGE);
    let q = this.query(scope, options);
    if (options.cursor) {
      const cursorSnap = await this.ref(options.cursor).get();
      const cursorDoc = cursorSnap.data();
      if (cursorDoc && cursorDoc.companyId === scope.companyId) q = q.startAfter(cursorSnap);
    }
    const snap = await q.limit(limit + 1).get();
    const docs = snap.docs.map((d) => d.data());
    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  /** Every matching document. Only for bounded sets (lines of one order, open periods); use `list` for user-facing lists. */
  async all(scope: Scope, options: Omit<ListOptions, "limit" | "cursor"> = {}, tx?: Transaction): Promise<T[]> {
    const q = this.query(scope, options);
    const snap = tx ? await tx.get(q) : await q.get();
    return snap.docs.map((d) => d.data());
  }

  /** Builds the full document without writing it. */
  build(scope: Scope, data: NewDoc<T>): T {
    const now = new Date().toISOString();
    const { id, ...rest } = data as NewDoc<T> & { id?: string };
    return {
      ...(rest as object),
      id: id ?? this.newId(),
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      createdAt: now,
      updatedAt: now,
      createdBy: scope.userId ?? null,
      updatedBy: scope.userId ?? null,
      version: 1,
      archivedAt: null,
    } as T;
  }

  /** Creates the document; fails with 409 if the id is already taken. */
  async create(scope: Scope, data: NewDoc<T>, tx?: Transaction): Promise<T> {
    const doc = this.build(scope, data);
    if (tx) {
      tx.create(this.ref(doc.id), doc);
    } else {
      try {
        await this.ref(doc.id).create(doc);
      } catch (error) {
        if (isAlreadyExists(error)) throw new ConflictException(`${this.entityName} already exists`);
        throw error;
      }
    }
    return doc;
  }

  /**
   * Applies a patch with optimistic concurrency: when `expectedVersion` is
   * given and the stored version differs, fails with 409 so the user can
   * reload instead of silently overwriting someone else's change.
   */
  async update(
    scope: Scope,
    id: string,
    patch: Patch<T>,
    options: { expectedVersion?: number; tx?: Transaction } = {},
  ): Promise<WriteResult<T>> {
    const run = async (tx: Transaction) => {
      const before = await this.get(scope, id, tx);
      return this.applyUpdate(scope, tx, before, patch, options.expectedVersion);
    };
    return options.tx ? run(options.tx) : this.firestore.runTransaction(run);
  }

  /** The write half of `update`, for callers that already read the document inside their transaction. */
  applyUpdate(scope: Scope, tx: Transaction, before: T, patch: Patch<T>, expectedVersion?: number): WriteResult<T> {
    if (expectedVersion !== undefined && before.version !== expectedVersion) {
      throw new ConflictException(`${this.entityName} was changed by someone else; reload and try again`);
    }
    const clean = stripBaseFields(patch as Record<string, unknown>);
    const after = {
      ...before,
      ...clean,
      updatedAt: new Date().toISOString(),
      updatedBy: scope.userId ?? null,
      version: before.version + 1,
    } as T;
    tx.set(this.ref(before.id), after);
    return { before, after };
  }

  archive(scope: Scope, id: string, tx?: Transaction): Promise<WriteResult<T>> {
    return this.update(scope, id, { archivedAt: new Date().toISOString() } as unknown as Patch<T>, { tx });
  }

  restore(scope: Scope, id: string, tx?: Transaction): Promise<WriteResult<T>> {
    return this.update(scope, id, { archivedAt: null } as unknown as Patch<T>, { tx });
  }
}

function stripBaseFields(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "archivedAt" || !(BASE_FIELDS as readonly string[]).includes(key)) out[key] = value;
  }
  return out;
}

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}
