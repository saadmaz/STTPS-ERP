import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { PermissionSyncService } from "../common/permission-sync.service.js";
import { COLLECTIONS } from "../firestore/collections.js";
import {
  CompanyDoc, CompanyUserDoc, PermissionDoc, RoleDoc, TenantDoc, UserDoc, UserRoleDoc,
} from "../firestore/models.js";
import {
  CreateTenantDto,
  UpdateTenantDto,
  CreateCompanyDto,
  AdminCreateUserDto,
  CreateRoleDto,
  UpdateRolePermissionsDto,
  AssignUserToCompanyDto,
} from "./dto/admin.dto.js";
import * as bcrypt from "bcryptjs";

const PLATFORM_SLUG = "_platform";

@Injectable()
export class AdminService {
  constructor(
    private firestore: FirestoreService,
    private permissionSync: PermissionSyncService,
  ) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const platformTenantId = await this.getPlatformTenantId();

    const [tenantsSnap, companiesCount, usersCount] = await Promise.all([
      this.firestore.collection<TenantDoc>(COLLECTIONS.tenants).orderBy("createdAt", "desc").get(),
      this.firestore.collection(COLLECTIONS.companies).where("tenantId", "!=", platformTenantId).count().get(),
      this.firestore.collection(COLLECTIONS.users).where("isPlatformAdmin", "!=", true).count().get(),
    ]);

    const tenants = tenantsSnap.docs.map((d) => d.data()).filter((t) => t.slug !== PLATFORM_SLUG);

    return {
      tenants: tenants.length,
      users: usersCount.data().count,
      companies: companiesCount.data().count,
      recentTenants: tenants.slice(0, 5),
    };
  }

  // ── Tenants ────────────────────────────────────────────────────────────────

  async listTenants(search?: string) {
    const snap = await this.firestore.collection<TenantDoc>(COLLECTIONS.tenants).orderBy("createdAt", "desc").get();
    let tenants = snap.docs.map((d) => d.data()).filter((t) => t.slug !== PLATFORM_SLUG);
    if (search) {
      const term = search.toLowerCase();
      tenants = tenants.filter((t) => t.name.toLowerCase().includes(term));
    }

    return Promise.all(
      tenants.map(async (t) => {
        const [companies, users] = await Promise.all([
          this.firestore.collection(COLLECTIONS.companies).where("tenantId", "==", t.id).count().get(),
          this.firestore.collection(COLLECTIONS.users).where("tenantId", "==", t.id).count().get(),
        ]);
        return { ...t, _count: { companies: companies.data().count, users: users.data().count } };
      }),
    );
  }

  async getTenant(id: string) {
    const tenantDoc = await this.firestore.collection<TenantDoc>(COLLECTIONS.tenants).doc(id).get();
    if (!tenantDoc.exists) throw new NotFoundException("Tenant not found");
    const tenant = tenantDoc.data()!;

    const companiesSnap = await this.firestore
      .collection<CompanyDoc>(COLLECTIONS.companies)
      .where("tenantId", "==", id)
      .orderBy("createdAt", "asc")
      .get();

    const usersSnap = await this.firestore
      .collection<UserDoc>(COLLECTIONS.users)
      .where("tenantId", "==", id)
      .orderBy("firstName", "asc")
      .get();

    const users = await Promise.all(
      usersSnap.docs
        .map((d) => d.data())
        .filter((u) => !u.isPlatformAdmin)
        .map(async (u) => ({
          id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName,
          isActive: u.isActive, isSuperAdmin: u.isSuperAdmin, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
          companyUsers: await this.getCompanyUsersBrief(u.id),
        })),
    );

    return { ...tenant, companies: companiesSnap.docs.map((d) => d.data()), users };
  }

  async createTenant(dto: CreateTenantDto) {
    const slugRef = this.firestore.collection(COLLECTIONS.tenantSlugIndex).doc(dto.slug);
    const preCheck = await slugRef.get();
    if (preCheck.exists) throw new ConflictException("Slug already taken");

    const now = new Date().toISOString();

    return this.firestore.runTransaction(async (tx) => {
      const check = await tx.get(slugRef);
      if (check.exists) throw new ConflictException("Slug already taken");

      const tenantId = this.firestore.newId(COLLECTIONS.tenants);
      const companyId = `${tenantId}_MAIN`;

      tx.create(slugRef, { tenantId });

      const tenant: TenantDoc = {
        id: tenantId, name: dto.name, slug: dto.slug, plan: dto.plan ?? "starter",
        status: "active", settings: {}, createdAt: now, updatedAt: now,
      };
      tx.set(this.firestore.collection<TenantDoc>(COLLECTIONS.tenants).doc(tenantId), tenant);

      const company: CompanyDoc = {
        id: companyId, tenantId, name: dto.companyName ?? dto.name, code: "MAIN",
        legalName: null, taxId: null, currency: dto.currency ?? "USD", timezone: dto.timezone ?? "UTC",
        fiscalYearStart: 1, address: null, logoUrl: null, parentId: null, isActive: true,
        createdAt: now, updatedAt: now,
      };
      tx.set(this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(companyId), company);

      return tenant;
    });
  }

  async updateTenant(id: string, dto: UpdateTenantDto) {
    const doc = await this.firestore.collection<TenantDoc>(COLLECTIONS.tenants).doc(id).get();
    if (!doc.exists) throw new NotFoundException("Tenant not found");
    await this.firestore.collection<TenantDoc>(COLLECTIONS.tenants).doc(id).update({
      ...dto,
      updatedAt: new Date().toISOString(),
    });
    const updated = await this.firestore.collection<TenantDoc>(COLLECTIONS.tenants).doc(id).get();
    return updated.data();
  }

  async deleteTenant(id: string) {
    const doc = await this.firestore.collection<TenantDoc>(COLLECTIONS.tenants).doc(id).get();
    if (!doc.exists) throw new NotFoundException("Tenant not found");
    const tenant = doc.data()!;
    if (tenant.slug === PLATFORM_SLUG) throw new BadRequestException("Cannot delete platform tenant");

    await this.firestore.collection(COLLECTIONS.tenants).doc(id).delete();
    await this.firestore.collection(COLLECTIONS.tenantSlugIndex).doc(tenant.slug).delete();
    return tenant;
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(tenantId: string) {
    const snap = await this.firestore
      .collection<CompanyDoc>(COLLECTIONS.companies)
      .where("tenantId", "==", tenantId)
      .orderBy("createdAt", "asc")
      .get();

    return Promise.all(
      snap.docs.map(async (d) => {
        const company = d.data();
        const count = await this.firestore
          .collection(COLLECTIONS.companyUsers)
          .where("companyId", "==", company.id)
          .count()
          .get();
        return { ...company, _count: { companyUsers: count.data().count } };
      }),
    );
  }

  async createCompany(tenantId: string, dto: CreateCompanyDto) {
    const code = dto.code.toUpperCase();
    const id = `${tenantId}_${code}`;
    const existing = await this.firestore.collection(COLLECTIONS.companies).doc(id).get();
    if (existing.exists) throw new ConflictException("Company code already exists in this tenant");

    const now = new Date().toISOString();
    const company: CompanyDoc = {
      id, tenantId, name: dto.name, code,
      legalName: dto.legalName ?? null, taxId: dto.taxId ?? null,
      currency: dto.currency ?? "USD", timezone: dto.timezone ?? "UTC", fiscalYearStart: 1,
      address: null, logoUrl: null, parentId: null, isActive: true,
      createdAt: now, updatedAt: now,
    };
    await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(id).create(company);
    return company;
  }

  async updateCompany(companyId: string, dto: Partial<CreateCompanyDto>) {
    const { code: _ignoredCode, ...rest } = dto;
    await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(companyId).update({
      ...rest,
      updatedAt: new Date().toISOString(),
    });
    const doc = await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(companyId).get();
    return doc.data();
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(tenantId: string) {
    const snap = await this.firestore
      .collection<UserDoc>(COLLECTIONS.users)
      .where("tenantId", "==", tenantId)
      .orderBy("firstName", "asc")
      .get();

    const users = snap.docs.map((d) => d.data()).filter((u) => !u.isPlatformAdmin);
    return Promise.all(
      users.map(async (u) => ({
        id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName,
        phone: u.phone, isActive: u.isActive, isSuperAdmin: u.isSuperAdmin,
        lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
        companyUsers: await this.getCompanyUsersBrief(u.id),
      })),
    );
  }

  async createUser(tenantId: string, dto: AdminCreateUserDto) {
    const emailLower = dto.email.toLowerCase();
    const indexRef = this.firestore.collection(COLLECTIONS.emailIndex).doc(`${tenantId}_${emailLower}`);
    const existing = await indexRef.get();
    if (existing.exists) throw new ConflictException("Email already exists in this tenant");

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const now = new Date().toISOString();
    const userId = this.firestore.newId(COLLECTIONS.users);
    const user: UserDoc = {
      id: userId, tenantId, email: dto.email, emailLower,
      firstName: dto.firstName, lastName: dto.lastName, passwordHash,
      phone: dto.phone ?? null, avatar: null, isActive: true,
      isSuperAdmin: dto.isSuperAdmin ?? false, isPlatformAdmin: false,
      mfaEnabled: false, mfaSecret: null, lastLoginAt: null, createdAt: now, updatedAt: now,
    };

    let companyUserId: string | undefined;

    await this.firestore.runTransaction(async (tx) => {
      tx.create(indexRef, { userId });
      tx.set(this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId), user);

      if (dto.companyId) {
        companyUserId = `${userId}_${dto.companyId}`;
        const companyUser: CompanyUserDoc = {
          id: companyUserId, userId, companyId: dto.companyId, isDefault: true, permissionCodes: [],
        };
        tx.set(this.firestore.collection<CompanyUserDoc>(COLLECTIONS.companyUsers).doc(companyUserId), companyUser);

        for (const roleId of dto.roleIds ?? []) {
          const userRoleId = `${companyUserId}_${roleId}`;
          const userRole: UserRoleDoc = { id: userRoleId, companyUserId, roleId, grantedAt: now, grantedBy: null };
          tx.set(this.firestore.collection<UserRoleDoc>(COLLECTIONS.userRoles).doc(userRoleId), userRole);
        }
      }
    });

    if (companyUserId && dto.roleIds?.length) {
      await this.permissionSync.recomputeCompanyUserPermissions(companyUserId);
    }

    return {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      isActive: user.isActive, isSuperAdmin: user.isSuperAdmin, createdAt: user.createdAt,
      companyUsers: await this.getCompanyUsersBrief(user.id),
    };
  }

  async toggleUserActive(userId: string, isActive: boolean) {
    await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId).update({
      isActive,
      updatedAt: new Date().toISOString(),
    });
    const doc = await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId).get();
    return doc.data();
  }

  async toggleSuperAdmin(userId: string, isSuperAdmin: boolean) {
    await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId).update({
      isSuperAdmin,
      updatedAt: new Date().toISOString(),
    });
    const doc = await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId).get();
    return doc.data();
  }

  async assignUserToCompany(dto: AssignUserToCompanyDto) {
    const companyUserId = `${dto.userId}_${dto.companyId}`;
    const ref = this.firestore.collection<CompanyUserDoc>(COLLECTIONS.companyUsers).doc(companyUserId);
    const existing = await ref.get();

    if (existing.exists) {
      await ref.update({ isDefault: dto.isDefault ?? false });
    } else {
      await ref.set({
        id: companyUserId, userId: dto.userId, companyId: dto.companyId,
        isDefault: dto.isDefault ?? false, permissionCodes: [],
      });
    }

    if (dto.roleIds?.length) {
      const now = new Date().toISOString();
      await Promise.all(
        dto.roleIds.map((roleId) => {
          const userRoleId = `${companyUserId}_${roleId}`;
          return this.firestore
            .collection<UserRoleDoc>(COLLECTIONS.userRoles)
            .doc(userRoleId)
            .set({ id: userRoleId, companyUserId, roleId, grantedAt: now, grantedBy: null });
        }),
      );
      await this.permissionSync.recomputeCompanyUserPermissions(companyUserId);
    }

    const doc = await ref.get();
    return doc.data();
  }

  async resetUserPassword(userId: string, newPassword: string) {
    if (newPassword.length < 8) throw new BadRequestException("Password must be at least 8 characters");
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId).update({
      passwordHash,
      updatedAt: new Date().toISOString(),
    });
  }

  // ── Roles ──────────────────────────────────────────────────────────────────

  async listRoles(tenantId: string) {
    const snap = await this.firestore
      .collection<RoleDoc>(COLLECTIONS.roles)
      .where("tenantId", "==", tenantId)
      .orderBy("name", "asc")
      .get();

    return Promise.all(
      snap.docs.map(async (d) => {
        const role = d.data();
        const [countSnap, company, rolePermissions] = await Promise.all([
          this.firestore.collection(COLLECTIONS.userRoles).where("roleId", "==", role.id).count().get(),
          this.getCompanySummary(role.companyId),
          this.hydrateRolePermissions(role.permissionCodes),
        ]);
        return { ...role, _count: { userRoles: countSnap.data().count }, company, rolePermissions };
      }),
    );
  }

  async createRole(tenantId: string, dto: CreateRoleDto) {
    const now = new Date().toISOString();
    const id = this.firestore.newId(COLLECTIONS.roles);
    const permissionCodes = dto.permissionCodes ?? [];
    const role: RoleDoc = {
      id, tenantId, companyId: dto.companyId ?? null, name: dto.name,
      description: dto.description ?? null, isSystem: false, permissionCodes,
      createdAt: now, updatedAt: now,
    };
    await this.firestore.collection<RoleDoc>(COLLECTIONS.roles).doc(id).set(role);
    return { ...role, rolePermissions: await this.hydrateRolePermissions(permissionCodes) };
  }

  async updateRolePermissions(roleId: string, dto: UpdateRolePermissionsDto) {
    await this.firestore.collection<RoleDoc>(COLLECTIONS.roles).doc(roleId).update({
      permissionCodes: dto.permissionCodes,
      updatedAt: new Date().toISOString(),
    });
    await this.permissionSync.recomputeForRole(roleId);

    const doc = await this.firestore.collection<RoleDoc>(COLLECTIONS.roles).doc(roleId).get();
    const role = doc.data()!;
    return { ...role, rolePermissions: await this.hydrateRolePermissions(role.permissionCodes) };
  }

  async deleteRole(roleId: string) {
    const doc = await this.firestore.collection<RoleDoc>(COLLECTIONS.roles).doc(roleId).get();
    if (!doc.exists) throw new NotFoundException("Role not found");
    const role = doc.data()!;
    if (role.isSystem) throw new BadRequestException("Cannot delete system roles");

    const urSnap = await this.firestore
      .collection<UserRoleDoc>(COLLECTIONS.userRoles)
      .where("roleId", "==", roleId)
      .get();
    const companyUserIds = [...new Set(urSnap.docs.map((d) => d.data().companyUserId))];

    await Promise.all(urSnap.docs.map((d) => d.ref.delete()));
    await this.firestore.collection(COLLECTIONS.roles).doc(roleId).delete();
    // These lost the role's grants — recompute so a stale permission doesn't linger.
    await Promise.all(companyUserIds.map((id) => this.permissionSync.recomputeCompanyUserPermissions(id)));

    return role;
  }

  // ── Permissions ────────────────────────────────────────────────────────────

  async listPermissions() {
    const snap = await this.firestore
      .collection<PermissionDoc>(COLLECTIONS.permissions)
      .orderBy("module", "asc")
      .orderBy("action", "asc")
      .get();
    return snap.docs.map((d) => d.data());
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getPlatformTenantId(): Promise<string> {
    const doc = await this.firestore.collection(COLLECTIONS.tenantSlugIndex).doc(PLATFORM_SLUG).get();
    return doc.exists ? (doc.data() as { tenantId: string }).tenantId : "";
  }

  private async getCompanySummary(companyId: string | null) {
    if (!companyId) return null;
    const doc = await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(companyId).get();
    const c = doc.data();
    return c ? { id: c.id, name: c.name } : null;
  }

  private async hydrateRolePermissions(codes: string[]) {
    const docs = await Promise.all(
      codes.map((code) => this.firestore.collection<PermissionDoc>(COLLECTIONS.permissions).doc(code).get()),
    );
    return docs.filter((d) => d.exists).map((d) => ({ permission: d.data() }));
  }

  /** companyUsers[].company{id,name} / .userRoles[].role{id,name} for a user. */
  private async getCompanyUsersBrief(userId: string) {
    const cuSnap = await this.firestore
      .collection<CompanyUserDoc>(COLLECTIONS.companyUsers)
      .where("userId", "==", userId)
      .get();

    return Promise.all(
      cuSnap.docs.map(async (doc) => {
        const cu = doc.data();
        const [company, urSnap] = await Promise.all([
          this.getCompanySummary(cu.companyId),
          this.firestore.collection<UserRoleDoc>(COLLECTIONS.userRoles).where("companyUserId", "==", cu.id).get(),
        ]);
        const userRoles = await Promise.all(
          urSnap.docs.map(async (urDoc) => {
            const ur = urDoc.data();
            const roleDoc = await this.firestore.collection<RoleDoc>(COLLECTIONS.roles).doc(ur.roleId).get();
            const role = roleDoc.data();
            return { id: ur.id, role: role ? { id: role.id, name: role.name } : null };
          }),
        );
        return { id: cu.id, company, userRoles };
      }),
    );
  }
}
