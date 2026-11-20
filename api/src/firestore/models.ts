// Firestore document shapes for the Phase 1 (platform/identity) collections.
// Field names mirror api/legacy/prisma-schema/schema.prisma exactly so JSON responses stay
// byte-identical to what the Prisma-backed API returned. Dates are stored as
// ISO strings (not Firestore Timestamp) so they serialize to JSON exactly
// like Prisma's DateTime did, and still sort correctly with orderBy.

export interface TenantDoc {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyDoc {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  legalName: string | null;
  taxId: string | null;
  currency: string;
  timezone: string;
  fiscalYearStart: number;
  address: Record<string, unknown> | null;
  logoUrl: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserDoc {
  id: string;
  tenantId: string;
  email: string;
  emailLower: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  phone: string | null;
  avatar: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  isPlatformAdmin: boolean;
  mfaEnabled: boolean;
  /** TOTP secret, encrypted (see auth/security.ts seal). */
  mfaSecret: string | null;
  mfaPendingSecret?: string | null;
  /** Last TOTP time step accepted, so codes cannot be replayed. */
  mfaLastStep?: number | null;
  /** SHA-256 hashes of unused recovery codes. */
  mfaRecoveryHashes?: string[];
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyUserDoc {
  id: string; // `${userId}_${companyId}`
  userId: string;
  companyId: string;
  isDefault: boolean;
  // Denormalized union of every assigned role's permissionCodes — see
  // PermissionSyncService. Source of truth for RequirePermissionGuard.
  permissionCodes: string[];
}

export interface RoleDoc {
  id: string;
  tenantId: string;
  companyId: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  // Replaces the Prisma RolePermission join table — nothing ever queried it
  // standalone, and embedding is exactly what the fan-out recompute needs.
  permissionCodes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PermissionDoc {
  code: string; // also the doc ID
  name: string;
  module: string;
  action: string;
}

export interface UserRoleDoc {
  id: string; // `${companyUserId}_${roleId}`
  companyUserId: string;
  roleId: string;
  grantedAt: string;
  grantedBy: string | null;
}

export interface SessionDoc {
  /** SHA-256 of the refresh token; also the doc id. The token itself is never stored. */
  id: string;
  userId: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt?: string;
}

export interface AuditLogDoc {
  id: string;
  tenantId: string;
  companyId: string | null;
  userId: string | null;
  module: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason?: string | null;
  ipAddress: string | null;
  userAgent?: string | null;
  createdAt: string;
}
