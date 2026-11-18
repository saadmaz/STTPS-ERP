import { BadRequestException } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { AuditService } from "../audit/audit.service.js";
import { RequestContext, Scope } from "../context/request-context.js";
import { BaseDoc, NewDoc, Page, Patch, TenantRepository, WriteResult } from "../data/repository.js";
import { UniqueClaim, UniqueService } from "../data/unique.service.js";
import { ListQueryDto, parseSort, parseWhere } from "./list-query.dto.js";

export interface ReferenceRule {
  field: string;
  collection: string;
  label: string;
}

export interface MasterDataConfig<T extends BaseDoc> {
  module: string;
  /** Singular machine name, e.g. "branch"; used in audit entries and unique keys. */
  entity: string;
  /** Singular human name, e.g. "Branch". */
  label: string;
  collection: string;
  /** Fields that must be unique within a company (case-insensitive). */
  uniqueFields?: (keyof T & string)[];
  /** Field pointing at a parent of the same type; cycles are rejected. */
  parentField?: keyof T & string;
  /** Fields pointing at records in other collections of the same company. */
  references?: ReferenceRule[];
  /** Fields a list may filter on with `where=field:value`. */
  filterFields?: string[];
  /** Fields a list may sort on. */
  sortFields?: string[];
  /** Fields matched by `q` (case-insensitive substring). Default: code and name. */
  searchFields?: string[];
}

/** Upper bound on records of one master-data type per company. */
const MAX_RECORDS = 5_000;

/**
 * CRUD for company-scoped master data (branches, cost centres, categories …)
 * with uniqueness, reference and hierarchy checks, audit entries in the same
 * transaction, archiving and optimistic concurrency. Domain modules extend it
 * and override the hooks for extra rules.
 */
export class MasterDataService<T extends BaseDoc, C extends object = object, U extends object = Partial<C>> {
  readonly repo: TenantRepository<T>;

  constructor(
    protected readonly firestore: FirestoreService,
    protected readonly audit: AuditService,
    protected readonly unique: UniqueService,
    readonly config: MasterDataConfig<T>,
  ) {
    this.repo = new TenantRepository<T>(firestore, config.collection, config.label);
  }

  /** Turns a create DTO into the document body. Override to set defaults or derived fields. */
  protected toNew(dto: C, _ctx: RequestContext): NewDoc<T> {
    return { ...dto } as unknown as NewDoc<T>;
  }

  /** Turns an update DTO into a patch. Override to block or derive fields. */
  protected toPatch(dto: U, _before: T, _ctx: RequestContext): Patch<T> {
    return { ...dto } as unknown as Patch<T>;
  }

  /** Extra checks during the transaction's read phase. Throw to reject. */
  protected async validate(_tx: Transaction, _ctx: RequestContext, _next: T, _before: T | null): Promise<void> {}

  /**
   * Master data is small, so lists load the company's records with a single
   * equality query (no composite index) and filter, search, sort and page in
   * memory. This keeps the Firestore composite-index budget for large
   * transactional collections.
   */
  async list(ctx: RequestContext, query: ListQueryDto): Promise<Page<T>> {
    const where = parseWhere(query.where, this.config.filterFields ?? []);
    const order = parseSort(query.sort, this.config.sortFields ?? ["code", "name", "createdAt", "updatedAt"]) ?? [
      { field: this.config.sortFields?.[0] ?? "code", direction: "asc" as const },
    ];
    const snap = await this.repo.collection.where("companyId", "==", ctx.companyId).limit(MAX_RECORDS).get();
    let items = snap.docs.map((d) => d.data()).filter((doc) => doc.tenantId === ctx.tenantId);
    if (!query.includeArchived) items = items.filter((doc) => doc.archivedAt == null);
    for (const [field, , value] of where) items = items.filter((doc) => ((doc as Record<string, unknown>)[field] ?? null) === value);
    if (query.q) {
      const needle = query.q.trim().toLowerCase();
      const fields = this.config.searchFields ?? ["code", "name"];
      items = items.filter((doc) => fields.some((f) => String((doc as Record<string, unknown>)[f] ?? "").toLowerCase().includes(needle)));
    }
    items.sort((a, b) => {
      for (const { field, direction } of order) {
        const c = compare((a as Record<string, unknown>)[field], (b as Record<string, unknown>)[field]);
        if (c !== 0) return direction === "desc" ? -c : c;
      }
      return a.id.localeCompare(b.id);
    });
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const start = query.cursor ? items.findIndex((doc) => doc.id === query.cursor) + 1 : 0;
    const page = items.slice(start, start + limit);
    const more = start + limit < items.length;
    return { items: page, nextCursor: more ? page[page.length - 1]!.id : null };
  }

  /** Every non-archived record of the company via a single equality query (no composite index); usable in a transaction. */
  protected async loadAll(scope: Scope, tx?: Transaction): Promise<T[]> {
    const q = this.repo.collection.where("companyId", "==", scope.companyId).limit(MAX_RECORDS);
    const snap = tx ? await tx.get(q) : await q.get();
    return snap.docs.map((d) => d.data()).filter((doc) => doc.tenantId === scope.tenantId && doc.archivedAt == null);
  }

  /** Every active record, for pickers and lookups. */
  async all(ctx: RequestContext): Promise<T[]> {
    return (await this.list(ctx, { limit: 200 })).items;
  }

  get(ctx: RequestContext, id: string): Promise<T> {
    return this.repo.get(ctx, id);
  }

  async create(ctx: RequestContext, dto: C): Promise<T> {
    return this.firestore.runTransaction(async (tx) => {
      const doc = this.repo.build(ctx, this.toNew(dto, ctx));
      await this.checkReferences(tx, ctx, doc, null);
      await this.validate(tx, ctx, doc, null);
      const claims = await this.checkUnique(tx, ctx, doc, null);
      claims.forEach((c) => this.unique.apply(tx, c));
      tx.create(this.repo.ref(doc.id), doc);
      this.audit.record(ctx, { module: this.config.module, action: "created", entity: this.config.entity, entityId: doc.id, after: doc }, tx);
      return doc;
    });
  }

  async update(ctx: RequestContext, id: string, dto: U, expectedVersion?: number): Promise<T> {
    const { after } = await this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const patch = this.toPatch(dto, before, ctx);
      const next = { ...before, ...stripUndefined(patch) } as T;
      await this.checkReferences(tx, ctx, next, before);
      await this.validate(tx, ctx, next, before);
      const claims = await this.checkUnique(tx, ctx, next, before);
      claims.forEach((c) => this.unique.apply(tx, c));
      const result = this.repo.applyUpdate(ctx, tx, before, patch, expectedVersion);
      this.audit.record(ctx, { module: this.config.module, action: "updated", entity: this.config.entity, entityId: id, before, after: result.after }, tx);
      return result;
    });
    return after;
  }

  archive(ctx: RequestContext, id: string, reason?: string): Promise<T> {
    return this.setArchived(ctx, id, new Date().toISOString(), "archived", reason);
  }

  restore(ctx: RequestContext, id: string): Promise<T> {
    return this.setArchived(ctx, id, null, "restored");
  }

  history(ctx: RequestContext, id: string) {
    return this.audit.forEntity(ctx, this.config.entity, id);
  }

  private async setArchived(ctx: RequestContext, id: string, value: string | null, action: string, reason?: string): Promise<T> {
    const result: WriteResult<T> = await this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const res = this.repo.applyUpdate(ctx, tx, before, { archivedAt: value } as unknown as Patch<T>);
      this.audit.record(ctx, { module: this.config.module, action, entity: this.config.entity, entityId: id, before, after: res.after, reason }, tx);
      return res;
    });
    return result.after;
  }

  private async checkUnique(tx: Transaction, ctx: RequestContext, next: T, before: T | null): Promise<UniqueClaim[]> {
    const claims: UniqueClaim[] = [];
    for (const field of this.config.uniqueFields ?? []) {
      const value = (next as Record<string, unknown>)[field];
      if (typeof value !== "string" || value.trim() === "") continue;
      const previous = before ? ((before as Record<string, unknown>)[field] as string | null | undefined) : null;
      claims.push(
        await this.unique.check(tx, ctx, {
          entity: this.config.entity,
          field,
          value,
          ownerId: next.id,
          previousValue: previous ?? null,
          label: `${this.config.label} ${field}`,
        }),
      );
    }
    return claims;
  }

  private async checkReferences(tx: Transaction, ctx: RequestContext, next: T, before: T | null): Promise<void> {
    const record = next as Record<string, unknown>;
    for (const rule of this.config.references ?? []) {
      const value = record[rule.field];
      if (value == null || value === "" || (before && (before as Record<string, unknown>)[rule.field] === value)) continue;
      const ids = Array.isArray(value) ? (value as string[]) : [value as string];
      for (const refId of ids) {
        const snap = await tx.get(this.firestore.collection(rule.collection).doc(refId));
        const data = snap.data() as BaseDoc | undefined;
        if (!data || data.companyId !== ctx.companyId) throw new BadRequestException(`${rule.label} not found`);
      }
    }

    const parentField = this.config.parentField;
    if (parentField) {
      const parentId = record[parentField] as string | null | undefined;
      if (parentId && (!before || (before as Record<string, unknown>)[parentField] !== parentId)) {
        let cursor: string | null = parentId;
        for (let depth = 0; cursor; depth++) {
          if (cursor === next.id) throw new BadRequestException(`A ${this.config.label.toLowerCase()} cannot be its own ancestor`);
          if (depth > 50) throw new BadRequestException("Hierarchy is too deep");
          const parent: T | null = await this.repo.find(ctx, cursor, tx);
          if (!parent) throw new BadRequestException(`Parent ${this.config.label.toLowerCase()} not found`);
          cursor = ((parent as Record<string, unknown>)[parentField] as string | null) ?? null;
        }
      }
    }
  }
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a ? -1 : 1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function stripUndefined(value: object): object {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}
