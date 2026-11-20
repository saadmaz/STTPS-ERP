// Seeds a Firestore project with the permission catalogue, the platform
// tenant and administrator, and a demo tenant.
//
// Run: `npx tsx scripts/seed-firestore.ts` with FIREBASE_PROJECT_ID,
// FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY set (or FIRESTORE_EMULATOR_HOST).
// Passwords come from SEED_PLATFORM_ADMIN_PASSWORD and SEED_DEMO_ADMIN_PASSWORD;
// when unset, strong random passwords are generated and printed once.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as bcrypt from "bcryptjs";
import { allPermissions } from "../src/platform/modules/catalog.js";

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

function password(envName: string): string {
  const fromEnv = process.env[envName];
  if (fromEnv) {
    if (fromEnv.length < 12) throw new Error(`${envName} must be at least 12 characters`);
    return fromEnv;
  }
  return randomBytes(18).toString("base64url");
}

async function seedPermissions() {
  const perms = allPermissions();
  const batch = db.batch();
  for (const p of perms) batch.set(db.collection("permissions").doc(p.code), p);
  await batch.commit();
  console.log(`Permissions: ${perms.length} seeded`);
}

async function upsertTenant(slug: string, name: string, plan: string) {
  const indexRef = db.collection("tenantSlugIndex").doc(slug);
  const indexDoc = await indexRef.get();
  if (indexDoc.exists) {
    const tenantId = (indexDoc.data() as { tenantId: string }).tenantId;
    const doc = await db.collection("tenants").doc(tenantId).get();
    return doc.data() as any;
  }

  const now = new Date().toISOString();
  const tenantId = db.collection("tenants").doc().id;
  const tenant = { id: tenantId, name, slug, plan, status: "active", settings: {}, createdAt: now, updatedAt: now };
  await db.runTransaction(async (tx) => {
    tx.create(indexRef, { tenantId });
    tx.set(db.collection("tenants").doc(tenantId), tenant);
  });
  return tenant;
}

async function upsertCompany(tenantId: string, code: string, name: string) {
  const id = `${tenantId}_${code}`;
  const doc = await db.collection("companies").doc(id).get();
  if (doc.exists) return doc.data() as any;

  const now = new Date().toISOString();
  const company = {
    id, tenantId, name, code, legalName: null, taxId: null,
    currency: "USD", timezone: "UTC", fiscalYearStart: 1,
    address: null, logoUrl: null, parentId: null, isActive: true,
    createdAt: now, updatedAt: now,
  };
  await db.collection("companies").doc(id).set(company);
  return company;
}

async function upsertUser(tenantId: string, email: string, password: string, extra: Record<string, unknown> = {}) {
  const emailLower = email.toLowerCase();
  const indexRef = db.collection("emailIndex").doc(`${tenantId}_${emailLower}`);
  const indexDoc = await indexRef.get();
  if (indexDoc.exists) {
    const userId = (indexDoc.data() as { userId: string }).userId;
    const doc = await db.collection("users").doc(userId).get();
    return doc.data() as any;
  }

  const now = new Date().toISOString();
  const userId = db.collection("users").doc().id;
  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id: userId, tenantId, email, emailLower,
    firstName: (extra.firstName as string) ?? "Admin", lastName: (extra.lastName as string) ?? "User",
    passwordHash, phone: null, avatar: null, isActive: true,
    isSuperAdmin: false, isPlatformAdmin: false, mfaEnabled: false, mfaSecret: null,
    lastLoginAt: null, createdAt: now, updatedAt: now,
    ...extra,
  };
  await db.runTransaction(async (tx) => {
    tx.create(indexRef, { userId });
    tx.set(db.collection("users").doc(userId), user);
  });
  return { ...user, created: true };
}

async function assignAdmin(userId: string, companyId: string, tenantId: string) {
  const companyUserId = `${userId}_${companyId}`;
  const cuDoc = await db.collection("companyUsers").doc(companyUserId).get();
  if (cuDoc.exists) return;

  const now = new Date().toISOString();
  const roleId = db.collection("roles").doc().id;
  const userRoleId = `${companyUserId}_${roleId}`;

  await db.runTransaction(async (tx) => {
    tx.set(db.collection("companyUsers").doc(companyUserId), {
      id: companyUserId, userId, companyId, isDefault: true, permissionCodes: [],
    });
    tx.set(db.collection("roles").doc(roleId), {
      id: roleId, tenantId, companyId, name: "Administrator", description: "Full system access",
      isSystem: true, permissionCodes: [], createdAt: now, updatedAt: now,
    });
    tx.set(db.collection("userRoles").doc(userRoleId), {
      id: userRoleId, companyUserId, roleId, grantedAt: now, grantedBy: null,
    });
  });
}

async function main() {
  console.log("Seeding STTPS Firestore (Phase 1 scope)...\n");

  await seedPermissions();

  // Platform tenant + super admin (platform console login)
  const platformTenant = await upsertTenant("_platform", "STTPS Platform", "platform");
  const platformCompany = await upsertCompany(platformTenant.id, "PLAT", "STTPS Platform");
  const platformPassword = password("SEED_PLATFORM_ADMIN_PASSWORD");
  const platformAdmin = await upsertUser(platformTenant.id, "admin@sttps.com", platformPassword, {
    firstName: "Platform", lastName: "Admin", isSuperAdmin: true, isPlatformAdmin: true,
  });
  await assignAdmin(platformAdmin.id, platformCompany.id, platformTenant.id);
  console.log(`Platform admin: ${platformAdmin.email}${!platformAdmin.created || process.env.SEED_PLATFORM_ADMIN_PASSWORD ? "" : ` (new password: ${platformPassword})`}`);

  const demoTenant = await upsertTenant("demo", "STTPS Demo Organization", "professional");
  const demoCompany = await upsertCompany(demoTenant.id, "DEMO", "Demo Corporation Ltd");
  const demoPassword = password("SEED_DEMO_ADMIN_PASSWORD");
  const demoAdmin = await upsertUser(demoTenant.id, "admin@demo.sttps.live", demoPassword, {
    firstName: "System", lastName: "Administrator", isSuperAdmin: true,
  });
  await assignAdmin(demoAdmin.id, demoCompany.id, demoTenant.id);
  console.log(`Demo admin: ${demoAdmin.email}${!demoAdmin.created || process.env.SEED_DEMO_ADMIN_PASSWORD ? "" : ` (new password: ${demoPassword})`}`);
  console.log("Passwords are printed only when an account is created; existing accounts keep theirs.");

  console.log("\nSeed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
