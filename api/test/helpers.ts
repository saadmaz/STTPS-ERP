import { randomUUID } from "node:crypto";
import { FirestoreService } from "../src/firestore/firestore.service.js";
import { RequestContext } from "../src/platform/context/request-context.js";

process.env.BACKGROUND_WORKERS = "off";
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Tests run against the Firestore emulator: use `npm test`, which starts it.");
}

let shared: FirestoreService | null = null;

export function firestore(): FirestoreService {
  if (!shared) {
    shared = new FirestoreService();
    shared.onModuleInit();
  }
  return shared;
}

/** A fresh tenant and company per test, so tests never see each other's data. */
export function testContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const tenantId = `t_${randomUUID().slice(0, 8)}`;
  return {
    tenantId,
    companyId: `${tenantId}_MAIN`,
    userId: "u_test",
    allPermissions: true,
    permissions: new Set(),
    ip: "127.0.0.1",
    userAgent: "vitest",
    ...overrides,
  };
}
