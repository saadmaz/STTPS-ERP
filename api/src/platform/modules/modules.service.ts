import { BadRequestException, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { createHash } from "node:crypto";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { COLLECTIONS } from "../../firestore/collections.js";
import { allPermissions, defaultEnabledModules, MODULES, MODULES_BY_KEY } from "./catalog.js";

export const TENANT_MODULES_COLLECTION = "tenantModules";
const META_COLLECTION = "meta";
const CACHE_MS = 30_000;

interface TenantModulesDoc {
  tenantId: string;
  enabled: string[];
  updatedAt: string;
  updatedBy: string | null;
}

export interface ModuleState {
  key: string;
  name: string;
  description: string;
  group: string;
  core: boolean;
  available: boolean;
  enabled: boolean;
  dependsOn: string[];
}

/** Which modules each tenant has switched on, and the permission catalogue in Firestore. */
@Injectable()
export class ModulesService implements OnApplicationBootstrap {
  private readonly logger = new Logger("Modules");
  private readonly cache = new Map<string, { enabled: Set<string>; at: number }>();

  constructor(private readonly firestore: FirestoreService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.BACKGROUND_WORKERS === "off") return;
    try {
      await this.syncPermissionCatalog();
    } catch (error) {
      this.logger.error(`Permission catalogue sync failed: ${(error as Error).message}`);
    }
  }

  /**
   * Writes the code-defined permission catalogue to the `permissions`
   * collection (read by the role editors), only when it changed.
   */
  async syncPermissionCatalog(): Promise<number> {
    const perms = allPermissions();
    const hash = createHash("sha256").update(JSON.stringify(perms)).digest("hex");
    const metaRef = this.firestore.collection(META_COLLECTION).doc("permissionCatalog");
    if ((await metaRef.get()).data()?.hash === hash) return 0;
    for (let i = 0; i < perms.length; i += 400) {
      const batch = this.firestore.db.batch();
      for (const p of perms.slice(i, i + 400)) {
        batch.set(this.firestore.collection(COLLECTIONS.permissions).doc(p.code), p);
      }
      await batch.commit();
    }
    await metaRef.set({ hash, count: perms.length, updatedAt: new Date().toISOString() });
    this.logger.log(`Permission catalogue updated (${perms.length} permissions)`);
    return perms.length;
  }

  async enabledFor(tenantId: string): Promise<Set<string>> {
    const cached = this.cache.get(tenantId);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.enabled;
    const doc = (await this.firestore.collection<TenantModulesDoc>(TENANT_MODULES_COLLECTION).doc(tenantId).get()).data();
    const enabled = new Set([...(doc?.enabled ?? defaultEnabledModules()), ...MODULES.filter((m) => m.core).map((m) => m.key)]);
    this.cache.set(tenantId, { enabled, at: Date.now() });
    return enabled;
  }

  async isEnabled(tenantId: string, key: string): Promise<boolean> {
    return (await this.enabledFor(tenantId)).has(key);
  }

  async list(tenantId: string): Promise<ModuleState[]> {
    const enabled = await this.enabledFor(tenantId);
    return MODULES.map((m) => ({
      key: m.key,
      name: m.name,
      description: m.description,
      group: m.group,
      core: m.core === true,
      available: m.available,
      enabled: m.available && enabled.has(m.key),
      dependsOn: m.dependsOn,
    }));
  }

  /** Switches a module on or off, keeping dependencies consistent. */
  async setEnabled(tenantId: string, key: string, enabled: boolean, userId: string | null): Promise<ModuleState[]> {
    const def = MODULES_BY_KEY.get(key);
    if (!def) throw new BadRequestException(`Unknown module "${key}"`);
    if (def.core) throw new BadRequestException(`${def.name} is always on`);
    if (enabled && !def.available) throw new BadRequestException(`${def.name} is not available yet`);

    const current = await this.enabledFor(tenantId);
    const next = new Set(current);
    if (enabled) {
      const missing = def.dependsOn.filter((d) => !current.has(d));
      if (missing.length) {
        const names = missing.map((d) => MODULES_BY_KEY.get(d)?.name ?? d).join(", ");
        throw new BadRequestException(`Enable ${names} first`);
      }
      next.add(key);
    } else {
      const dependants = MODULES.filter((m) => current.has(m.key) && m.dependsOn.includes(key));
      if (dependants.length) {
        throw new BadRequestException(`Switch off ${dependants.map((m) => m.name).join(", ")} first`);
      }
      next.delete(key);
    }
    await this.firestore.collection<TenantModulesDoc>(TENANT_MODULES_COLLECTION).doc(tenantId).set({
      tenantId,
      enabled: [...next].sort(),
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    });
    this.cache.delete(tenantId);
    return this.list(tenantId);
  }
}
