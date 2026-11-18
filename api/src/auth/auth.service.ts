import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { FirestoreService } from "../firestore/firestore.service.js";
import { COLLECTIONS } from "../firestore/collections.js";
import { CompanyDoc, CompanyUserDoc, RoleDoc, SessionDoc, UserDoc, UserRoleDoc } from "../firestore/models.js";
import { LoginDto } from "./dto/login.dto.js";
import { RegisterDto } from "./dto/register.dto.js";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";

@Injectable()
export class AuthService {
  constructor(
    private firestore: FirestoreService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    // Cross-tenant lookup by email — tenant is not known at login time (in
    // prod, determined by subdomain), matches the prior Prisma findFirst
    // behavior exactly, including its "first match wins" ambiguity if the
    // same email exists in more than one tenant.
    const emailLower = dto.email.toLowerCase();
    const snap = await this.firestore
      .collection<UserDoc>(COLLECTIONS.users)
      .where("emailLower", "==", emailLower)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (snap.empty) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const user = snap.docs[0].data();

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.firestore
      .collection<UserDoc>(COLLECTIONS.users)
      .doc(user.id)
      .update({ lastLoginAt: new Date().toISOString() });

    const tokens = await this.generateTokens(user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const session: SessionDoc = {
      refreshToken: tokens.refreshToken,
      userId: user.id,
      expiresAt: expiresAt.toISOString(),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.firestore
      .collection<SessionDoc>(COLLECTIONS.sessions)
      .doc(tokens.refreshToken)
      .set(session);

    const defaultCompany = await this.getDefaultCompany(user.id);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
        isSuperAdmin: user.isSuperAdmin,
        isPlatformAdmin: user.isPlatformAdmin,
        defaultCompanyId: defaultCompany?.id,
        defaultCompanyName: defaultCompany?.name,
      },
    };
  }

  async register(dto: RegisterDto) {
    // Uniqueness pre-checks (advisory, not the real race guard — see the
    // tx.create() calls below, which is what actually enforces this
    // atomically). Matches today's behavior: email uniqueness is checked
    // GLOBALLY across tenants, stricter than the per-tenant unique
    // constraint the schema otherwise implies.
    const slugSnap = await this.firestore
      .collection(COLLECTIONS.tenantSlugIndex)
      .doc(dto.organizationSlug)
      .get();
    if (slugSnap.exists) {
      throw new ConflictException("Organization slug is already taken");
    }

    const emailLower = dto.email.toLowerCase();
    const emailSnap = await this.firestore
      .collection<UserDoc>(COLLECTIONS.users)
      .where("emailLower", "==", emailLower)
      .limit(1)
      .get();
    if (!emailSnap.empty) {
      throw new ConflictException("Email is already registered");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const now = new Date().toISOString();

    const result = await this.firestore.runTransaction(async (tx) => {
      const tenantId = this.firestore.newId(COLLECTIONS.tenants);
      const userId = this.firestore.newId(COLLECTIONS.users);
      const roleId = this.firestore.newId(COLLECTIONS.roles);
      const companyId = `${tenantId}_MAIN`;
      const companyUserId = `${userId}_${companyId}`;
      const userRoleId = `${companyUserId}_${roleId}`;
      const slugIndexRef = this.firestore.collection(COLLECTIONS.tenantSlugIndex).doc(dto.organizationSlug);
      const emailIndexRef = this.firestore.collection(COLLECTIONS.emailIndex).doc(`${tenantId}_${emailLower}`);

      // Re-check inside the transaction: this, not the pre-check above, is
      // the real atomic uniqueness guard (tx.create() throws if it exists).
      const slugCheck = await tx.get(slugIndexRef);
      if (slugCheck.exists) throw new ConflictException("Organization slug is already taken");

      tx.create(slugIndexRef, { tenantId });
      tx.create(emailIndexRef, { userId });

      const tenant = {
        id: tenantId,
        name: dto.organizationName,
        slug: dto.organizationSlug,
        plan: "starter",
        status: "active",
        settings: {},
        createdAt: now,
        updatedAt: now,
      };
      tx.set(this.firestore.collection(COLLECTIONS.tenants).doc(tenantId), tenant);

      const company: CompanyDoc = {
        id: companyId,
        tenantId,
        name: dto.companyName || dto.organizationName,
        code: "MAIN",
        legalName: null,
        taxId: null,
        currency: "USD",
        timezone: "UTC",
        fiscalYearStart: 1,
        address: null,
        logoUrl: null,
        parentId: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      tx.set(this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(companyId), company);

      const user: UserDoc = {
        id: userId,
        tenantId,
        email: dto.email,
        emailLower,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        phone: null,
        avatar: null,
        isActive: true,
        isSuperAdmin: true,
        isPlatformAdmin: false,
        mfaEnabled: false,
        mfaSecret: null,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      };
      tx.set(this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId), user);

      const companyUser: CompanyUserDoc = {
        id: companyUserId,
        userId,
        companyId,
        isDefault: true,
        // Matches today's Prisma behavior exactly: the "Administrator" role
        // is created with zero permissions attached — harmless only because
        // isSuperAdmin:true bypasses RequirePermissionGuard entirely. A
        // pre-existing gap, preserved deliberately rather than silently
        // "fixed" mid-migration.
        permissionCodes: [],
      };
      tx.set(this.firestore.collection<CompanyUserDoc>(COLLECTIONS.companyUsers).doc(companyUserId), companyUser);

      const adminRole: RoleDoc = {
        id: roleId,
        tenantId,
        companyId,
        name: "Administrator",
        description: "Full system access",
        isSystem: true,
        permissionCodes: [],
        createdAt: now,
        updatedAt: now,
      };
      tx.set(this.firestore.collection<RoleDoc>(COLLECTIONS.roles).doc(roleId), adminRole);

      const userRole: UserRoleDoc = {
        id: userRoleId,
        companyUserId,
        roleId,
        grantedAt: now,
        grantedBy: null,
      };
      tx.set(this.firestore.collection<UserRoleDoc>(COLLECTIONS.userRoles).doc(userRoleId), userRole);

      return { tenant, user };
    });

    return {
      message: "Organization created successfully",
      tenantSlug: result.tenant.slug,
      email: result.user.email,
    };
  }

  async refreshTokens(refreshToken: string) {
    return this.firestore.runTransaction(async (tx) => {
      const sessionRef = this.firestore.collection<SessionDoc>(COLLECTIONS.sessions).doc(refreshToken);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) {
        throw new UnauthorizedException("Invalid or expired refresh token");
      }
      const session = sessionSnap.data()!;
      if (new Date(session.expiresAt) < new Date()) {
        throw new UnauthorizedException("Invalid or expired refresh token");
      }

      const userSnap = await tx.get(this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(session.userId));
      const user = userSnap.data();
      if (!user || !user.isActive) {
        throw new UnauthorizedException("User is inactive");
      }

      const tokens = await this.generateTokens(user);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Rotation: Firestore can't rename a doc ID (the ID *is* the token),
      // so this is a delete-old + create-new pair instead of an update.
      tx.delete(sessionRef);
      tx.create(this.firestore.collection<SessionDoc>(COLLECTIONS.sessions).doc(tokens.refreshToken), {
        refreshToken: tokens.refreshToken,
        userId: user.id,
        expiresAt: expiresAt.toISOString(),
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
      });

      return tokens;
    });
  }

  async logout(refreshToken: string) {
    await this.firestore.collection(COLLECTIONS.sessions).doc(refreshToken).delete();
  }

  async getProfile(userId: string) {
    const userSnap = await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId).get();
    const user = userSnap.data();
    if (!user) return null;

    const companyUsers = await this.getCompanyUsersWithDetail(userId);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatar: user.avatar,
      tenantId: user.tenantId,
      isSuperAdmin: user.isSuperAdmin,
      isPlatformAdmin: user.isPlatformAdmin,
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      companyUsers,
    };
  }

  /** companyUsers[].company / .userRoles[].role, matching the old nested Prisma include shape. */
  private async getCompanyUsersWithDetail(userId: string) {
    const cuSnap = await this.firestore
      .collection<CompanyUserDoc>(COLLECTIONS.companyUsers)
      .where("userId", "==", userId)
      .get();

    return Promise.all(
      cuSnap.docs.map(async (doc) => {
        const cu = doc.data();
        const companyDoc = await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(cu.companyId).get();
        const company = companyDoc.data();

        const urSnap = await this.firestore
          .collection<UserRoleDoc>(COLLECTIONS.userRoles)
          .where("companyUserId", "==", cu.id)
          .get();
        const userRoles = await Promise.all(
          urSnap.docs.map(async (urDoc) => {
            const ur = urDoc.data();
            const roleDoc = await this.firestore.collection<RoleDoc>(COLLECTIONS.roles).doc(ur.roleId).get();
            const role = roleDoc.data();
            return { id: ur.id, role: role ? { id: role.id, name: role.name } : null };
          }),
        );

        return {
          id: cu.id,
          isDefault: cu.isDefault,
          company: company
            ? { id: company.id, name: company.name, code: company.code, currency: company.currency, logoUrl: company.logoUrl }
            : null,
          userRoles,
        };
      }),
    );
  }

  private async getDefaultCompany(userId: string): Promise<CompanyDoc | undefined> {
    const cuSnap = await this.firestore
      .collection<CompanyUserDoc>(COLLECTIONS.companyUsers)
      .where("userId", "==", userId)
      .where("isDefault", "==", true)
      .limit(1)
      .get();
    if (cuSnap.empty) return undefined;
    const companyId = cuSnap.docs[0].data().companyId;
    const companyDoc = await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(companyId).get();
    return companyDoc.data();
  }

  private async generateTokens(user: { id: string; email: string; tenantId: string; isSuperAdmin: boolean; isPlatformAdmin?: boolean | null }) {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      isSuperAdmin: user.isSuperAdmin,
      isPlatformAdmin: user.isPlatformAdmin ?? false,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get("JWT_SECRET"),
        expiresIn: this.configService.get("JWT_EXPIRES_IN", "15m"),
      }),
      // Refresh token: random string, stored as its own doc ID in `sessions`.
      Promise.resolve(crypto.randomBytes(64).toString("hex")),
    ]);

    return { accessToken, refreshToken };
  }
}
