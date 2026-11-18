import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { AppModule } from "../../src/app.module.js";
import { FirestoreService } from "../../src/firestore/firestore.service.js";
import { COLLECTIONS } from "../../src/firestore/collections.js";

process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-for-the-check";
process.env.BACKGROUND_WORKERS = "off";

/** Boots the real application (all guards and pipes) against the emulator. */
export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }),
  );
  app.setGlobalPrefix("api/v1");
  await app.init();
  return app;
}

export interface Seeded {
  tenantId: string;
  companyId: string;
  token(user: "admin" | "viewer" | "outsider"): string;
}

/**
 * A tenant with one company and three users: a tenant super admin, a viewer
 * assigned to the company with the given permissions, and a user of the
 * tenant who is not assigned to the company.
 */
export async function seedTenant(app: INestApplication, viewerPermissions: string[]): Promise<Seeded> {
  const fs = app.get(FirestoreService);
  const jwt = app.get(JwtService);
  const tenantId = `t_${randomUUID().slice(0, 8)}`;
  const companyId = `${tenantId}_MAIN`;
  const now = new Date().toISOString();
  await fs.collection(COLLECTIONS.tenants).doc(tenantId).set({ id: tenantId, name: "Test", slug: tenantId, plan: "pro", status: "active", settings: {}, createdAt: now, updatedAt: now });
  await fs.collection(COLLECTIONS.companies).doc(companyId).set({
    id: companyId, tenantId, name: "Main", code: "MAIN", legalName: null, taxId: null, currency: "LKR", timezone: "Asia/Colombo",
    fiscalYearStart: 4, address: null, logoUrl: null, parentId: null, isActive: true, createdAt: now, updatedAt: now,
  });
  const users = { admin: `${tenantId}_admin`, viewer: `${tenantId}_viewer`, outsider: `${tenantId}_outsider` };
  for (const [role, id] of Object.entries(users)) {
    await fs.collection(COLLECTIONS.users).doc(id).set({
      id, tenantId, email: `${role}@${tenantId}.test`, emailLower: `${role}@${tenantId}.test`, firstName: role, lastName: "User",
      passwordHash: "x", phone: null, avatar: null, isActive: true, isSuperAdmin: role === "admin", isPlatformAdmin: false,
      mfaEnabled: false, mfaSecret: null, lastLoginAt: null, createdAt: now, updatedAt: now,
    });
  }
  await fs.collection(COLLECTIONS.companyUsers).doc(`${users.viewer}_${companyId}`).set({
    id: `${users.viewer}_${companyId}`, userId: users.viewer, companyId, isDefault: true, permissionCodes: viewerPermissions,
  });
  return {
    tenantId,
    companyId,
    token: (user) =>
      jwt.sign({ sub: users[user], email: `${user}@${tenantId}.test`, tenantId, isSuperAdmin: user === "admin", isPlatformAdmin: false }),
  };
}
