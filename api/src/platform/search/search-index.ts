import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { hasPermission, RequestContext, Scope } from "../context/request-context.js";
import { recordType } from "../records/record-types.js";

export const SEARCH_COLLECTION = "searchIndex";

export interface SearchEntry {
  entityType: string;
  entityId: string;
  title: string;
  subtitle?: string | null;
  /** Extra text worth matching (codes, emails, phone numbers). */
  keywords?: (string | null | undefined)[];
}

interface SearchDoc {
  id: string;
  tenantId: string;
  companyId: string;
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string | null;
  link: string;
  /** `${companyId}|${prefix}` for every word prefix: one array-contains query, no composite index. */
  terms: string[];
  updatedAt: string;
}

export interface SearchHit {
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string | null;
  link: string;
  typeLabel: string;
}

const MIN_PREFIX = 2;
const MAX_PREFIX = 15;
const MAX_TERMS = 400;

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^\p{L}\p{N}@.]+/u)
    .flatMap((w) => [w, ...w.split(/[@.]/)])
    .filter((w) => w.length >= MIN_PREFIX);
}

function terms(companyId: string, entry: SearchEntry): string[] {
  const set = new Set<string>();
  const source = [entry.title, entry.subtitle, ...(entry.keywords ?? [])].filter(Boolean).join(" ");
  for (const word of words(source)) {
    for (let n = MIN_PREFIX; n <= Math.min(word.length, MAX_PREFIX); n++) set.add(`${companyId}|${word.slice(0, n)}`);
    if (set.size >= MAX_TERMS) break;
  }
  return [...set].slice(0, MAX_TERMS);
}

/**
 * Global search (blueprint §3, §36 command palette). Modules keep one search
 * document per record up to date inside their own transactions; a search
 * matches word prefixes and then drops record types the user may not view.
 */
export class SearchIndex {
  constructor(private readonly firestore: FirestoreService) {}

  private ref(scope: Scope, entityType: string, entityId: string) {
    return this.firestore.collection<SearchDoc>(SEARCH_COLLECTION).doc(`${scope.companyId}__${entityType}__${entityId}`);
  }

  upsert(tx: Transaction, scope: Scope, entry: SearchEntry): void {
    const ref = this.ref(scope, entry.entityType, entry.entityId);
    tx.set(ref, {
      id: ref.id,
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      title: entry.title,
      subtitle: entry.subtitle ?? null,
      link: recordType(entry.entityType)?.link(entry.entityId) ?? "",
      terms: terms(scope.companyId, entry),
      updatedAt: new Date().toISOString(),
    });
  }

  remove(tx: Transaction, scope: Scope, entityType: string, entityId: string): void {
    tx.delete(this.ref(scope, entityType, entityId));
  }

  async search(ctx: RequestContext, query: string, options: { types?: string[]; limit?: number } = {}): Promise<SearchHit[]> {
    const parts = words(query).map((w) => w.slice(0, MAX_PREFIX));
    if (parts.length === 0) return [];
    // Query on the longest word (most selective), then require every other word in memory.
    const [first, ...rest] = [...parts].sort((a, b) => b.length - a.length);
    const snap = await this.firestore
      .collection<SearchDoc>(SEARCH_COLLECTION)
      .where("terms", "array-contains", `${ctx.companyId}|${first}`)
      .limit(300)
      .get();
    const limit = Math.min(options.limit ?? 20, 50);
    return snap.docs
      .map((d) => d.data())
      .filter((doc) => doc.tenantId === ctx.tenantId)
      .filter((doc) => rest.every((r) => doc.terms.includes(`${ctx.companyId}|${r}`)))
      .filter((doc) => !options.types?.length || options.types.includes(doc.entityType))
      .filter((doc) => {
        const type = recordType(doc.entityType);
        return !!type && hasPermission(ctx, type.viewPermission);
      })
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, limit)
      .map((doc) => ({
        entityType: doc.entityType,
        entityId: doc.entityId,
        title: doc.title,
        subtitle: doc.subtitle,
        link: doc.link,
        typeLabel: recordType(doc.entityType)?.label ?? doc.entityType,
      }));
  }
}
