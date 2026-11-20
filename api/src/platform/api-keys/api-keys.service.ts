import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { AuditService } from "../audit/audit.service.js";
import { RequestContext } from "../context/request-context.js";
import { MasterDataService } from "../crud/master-data.service.js";
import { NewDoc, Patch } from "../data/repository.js";
import { UniqueService } from "../data/unique.service.js";
import { SearchEntry } from "../search/search-index.js";
import { CreateApiKeyDto, UpdateApiKeyDto } from "./api-keys.dto.js";
import { API_KEY_COLLECTIONS, ApiKeyDoc } from "./api-keys.models.js";

type CreateInput = CreateApiKeyDto & { built?: { hash: string; prefix: string } };

export interface ResolvedApiKey {
  apiKeyId: string;
  tenantId: string;
  companyId: string;
  permissions: string[];
  rateLimitPerMinute: number;
}

/**
 * API keys for the public REST API (blueprint §29). The raw key is shown
 * once on creation and never stored — only its SHA-256 hash, as the id of a
 * separate lookup collection (`api-keys/:hash`-style doc), the exact shape
 * already used for attendance device keys and portal setup tokens. A key's
 * scope is a plain permission-code list, checked the same way a signed-in
 * user's permissions are (`hasPermission`), not a second authorization model.
 */
@Injectable()
export class ApiKeyService extends MasterDataService<ApiKeyDoc, CreateInput, UpdateApiKeyDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "integrations", entity: "apiKey", label: "API key", collection: API_KEY_COLLECTIONS.keys,
      route: "/platform/api-keys", filterFields: ["status"], customFields: false,
    });
  }

  /** Returns the raw key once — callers must store it themselves; it can never be retrieved again. */
  async createKey(ctx: RequestContext, dto: CreateApiKeyDto): Promise<{ apiKey: ApiKeyDoc; key: string }> {
    const key = `sttps_${randomBytes(24).toString("base64url")}`;
    const hash = createHash("sha256").update(key).digest("hex");
    const apiKey = await super.create(ctx, { ...dto, built: { hash, prefix: key.slice(0, 14) } });
    return { apiKey, key };
  }

  protected toNew(dto: CreateInput): NewDoc<ApiKeyDoc> {
    return {
      name: dto.name, prefix: dto.built!.prefix, hash: dto.built!.hash, permissions: dto.permissions ?? [],
      status: "active", rateLimitPerMinute: dto.rateLimitPerMinute ?? 120, lastUsedAt: null, requestCount: 0,
    };
  }

  protected toPatch(dto: UpdateApiKeyDto): Patch<ApiKeyDoc> {
    return { ...dto } as Patch<ApiKeyDoc>;
  }

  protected afterWrite(tx: Transaction, ctx: RequestContext, after: ApiKeyDoc, before: ApiKeyDoc | null): void {
    if (!before) {
      tx.set(this.firestore.collection(API_KEY_COLLECTIONS.keyHashes).doc(after.hash), { apiKeyId: after.id, tenantId: ctx.tenantId, companyId: ctx.companyId });
    }
  }

  protected searchEntry(doc: ApiKeyDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.prefix };
  }

  async revoke(ctx: RequestContext, id: string): Promise<ApiKeyDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      tx.delete(this.firestore.collection(API_KEY_COLLECTIONS.keyHashes).doc(before.hash));
      return this.repo.applyUpdate(ctx, tx, before, { status: "revoked" } as Patch<ApiKeyDoc>).after;
    });
  }

  /** Resolves a raw bearer key for the auth guard. Returns null for an unknown, revoked, or otherwise invalid key. */
  async resolveByKey(key: string): Promise<ResolvedApiKey | null> {
    const hash = createHash("sha256").update(key).digest("hex");
    const lookup = (await this.firestore.collection(API_KEY_COLLECTIONS.keyHashes).doc(hash).get()).data() as
      | { apiKeyId: string; tenantId: string; companyId: string }
      | undefined;
    if (!lookup) return null;
    const doc = (await this.firestore.collection<ApiKeyDoc>(API_KEY_COLLECTIONS.keys).doc(lookup.apiKeyId).get()).data();
    if (!doc || doc.status !== "active") return null;
    return { apiKeyId: doc.id, tenantId: lookup.tenantId, companyId: lookup.companyId, permissions: doc.permissions, rateLimitPerMinute: doc.rateLimitPerMinute };
  }

  /** Fire-and-forget usage counters; never awaited by the guard, so a slow write never slows down the real request. */
  recordUsage(apiKeyId: string): void {
    void this.firestore
      .collection(API_KEY_COLLECTIONS.keys)
      .doc(apiKeyId)
      .set({ lastUsedAt: new Date().toISOString(), requestCount: FieldValue.increment(1) }, { merge: true })
      .catch(() => {});
  }
}
