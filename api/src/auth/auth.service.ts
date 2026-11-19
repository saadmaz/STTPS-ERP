import * as bcrypt from "bcryptjs";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { assertStrongPassword, newRecoveryCodes, newTotpSecret, open, otpauthUrl, seal, sha256, verifyTotp } from "./security.js";

const SESSION_DAYS = 30;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
// Real bcrypt hash at the same cost, compared when the email is unknown so sign-in timing is uniform.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

interface ThrottleDoc {
  failures: number;
  lockedUntil: string | null;
  updatedAt: string;
}
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { FirestoreService } from "../firestore/firestore.service.js";
import { COLLECTIONS } from "../firestore/collections.js";
import { CompanyDoc, CompanyUserDoc, RoleDoc, SessionDoc, UserDoc, UserRoleDoc } from "../firestore/models.js";
import { LoginDto } from "./dto/login.dto.js";
import { RegisterDto } from "./dto/register.dto.js";
import * as crypto from "crypto";

@Injectable()
export class AuthService {
  constructor(
    private firestore: FirestoreService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Step one of sign-in. Returns tokens, or `{ mfaRequired, mfaToken }` when
   * the user has MFA on; the client then calls `completeMfa`. Five failed
   * passwords in a row lock the email for 15 minutes.
   */
  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    // Cross-tenant lookup by email: the tenant is not known at sign-in.
    const emailLower = dto.email.toLowerCase();
    await this.assertNotLocked(emailLower);
    const snap = await this.firestore
      .collection<UserDoc>(COLLECTIONS.users)
      .where("emailLower", "==", emailLower)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    const user = snap.empty ? null : snap.docs[0].data();
    // Compare against a dummy hash when the user does not exist, so timing does not reveal valid emails.
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      await this.recordFailure(emailLower);
      throw new UnauthorizedException("Invalid credentials");
    }
    await this.clearFailures(emailLower);

    if (user.mfaEnabled && user.mfaSecret) {
      const mfaToken = await this.jwtService.signAsync(
        { sub: user.id, purpose: "mfa" },
        { secret: this.configService.get("JWT_SECRET"), expiresIn: "5m" },
      );
      return { mfaRequired: true as const, mfaToken };
    }
    return this.startSession(user, ipAddress, userAgent);
  }

  /** Step two when MFA is on: a TOTP code or one recovery code. */
  async completeMfa(mfaToken: string, code: string, ipAddress?: string, userAgent?: string) {
    let payload: { sub: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync(mfaToken, { secret: this.configService.get("JWT_SECRET") });
    } catch {
      throw new UnauthorizedException("The sign-in attempt expired; sign in again");
    }
    if (payload.purpose !== "mfa") throw new UnauthorizedException("Invalid sign-in attempt");
    const userRef = this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(payload.sub);
    const user = (await userRef.get()).data();
    if (!user || !user.isActive || !user.mfaEnabled || !user.mfaSecret) throw new UnauthorizedException("Invalid sign-in attempt");
    await this.assertNotLocked(user.emailLower);
    if (!(await this.consumeSecondFactor(user, code))) {
      await this.recordFailure(user.emailLower);
      throw new UnauthorizedException("Invalid code");
    }
    await this.clearFailures(user.emailLower);
    return this.startSession(user, ipAddress, userAgent);
  }

  /** Accepts a fresh TOTP code (no replays) or an unused recovery code, and records its use. */
  private async consumeSecondFactor(user: UserDoc, code: string): Promise<boolean> {
    const userRef = this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(user.id);
    const clean = code.trim().toLowerCase();
    if (/^\d{6}$/.test(clean)) {
      const step = verifyTotp(open(user.mfaSecret!), clean);
      if (step === null || step <= (user.mfaLastStep ?? -1)) return false;
      await userRef.update({ mfaLastStep: step });
      return true;
    }
    const hash = sha256(clean);
    if (!(user.mfaRecoveryHashes ?? []).includes(hash)) return false;
    await userRef.update({ mfaRecoveryHashes: (user.mfaRecoveryHashes ?? []).filter((h) => h !== hash) });
    return true;
  }

  private async startSession(user: UserDoc, ipAddress?: string, userAgent?: string) {
    await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(user.id).update({ lastLoginAt: new Date().toISOString() });
    const tokens = await this.generateTokens(user);
    const now = new Date();
    const session: SessionDoc = {
      id: sha256(tokens.refreshToken),
      userId: user.id,
      expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString(),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      createdAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    };
    await this.firestore.collection<SessionDoc>(COLLECTIONS.sessions).doc(session.id).set(session);

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

    assertStrongPassword(dto.password, dto.email);
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

  /** Rotates the refresh token: the old one stops working the moment a new one is issued. */
  async refreshTokens(refreshToken: string) {
    return this.firestore.runTransaction(async (tx) => {
      const sessionRef = this.firestore.collection<SessionDoc>(COLLECTIONS.sessions).doc(sha256(refreshToken));
      const session = (await tx.get(sessionRef)).data();
      if (!session || new Date(session.expiresAt) < new Date()) {
        throw new UnauthorizedException("Invalid or expired refresh token");
      }

      const user = (await tx.get(this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(session.userId))).data();
      if (!user || !user.isActive) {
        throw new UnauthorizedException("User is inactive");
      }

      const tokens = await this.generateTokens(user);
      const now = new Date();
      tx.delete(sessionRef);
      const next: SessionDoc = {
        ...session,
        id: sha256(tokens.refreshToken),
        expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString(),
        lastUsedAt: now.toISOString(),
      };
      tx.create(this.firestore.collection<SessionDoc>(COLLECTIONS.sessions).doc(next.id), next);
      return tokens;
    });
  }

  async logout(refreshToken: string) {
    await this.firestore.collection(COLLECTIONS.sessions).doc(sha256(refreshToken)).delete();
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  /** The user's signed-in devices; `current` marks the one making the request. */
  async listSessions(userId: string, currentRefreshToken?: string) {
    const currentId = currentRefreshToken ? sha256(currentRefreshToken) : null;
    const snap = await this.firestore.collection<SessionDoc>(COLLECTIONS.sessions).where("userId", "==", userId).get();
    const now = new Date().toISOString();
    return snap.docs
      .map((d) => d.data())
      .filter((s) => s.expiresAt > now)
      .map((s) => ({
        id: s.id.slice(0, 16),
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt ?? s.createdAt,
        current: s.id === currentId,
      }))
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  /** Signs out one device (by the short id from listSessions) or every device except the current one. */
  async revokeSessions(userId: string, which: { id?: string; allExcept?: string | null }) {
    const snap = await this.firestore.collection<SessionDoc>(COLLECTIONS.sessions).where("userId", "==", userId).get();
    const keep = which.allExcept ? sha256(which.allExcept) : null;
    const targets = snap.docs.filter((d) => (which.id ? d.id.startsWith(which.id) : d.id !== keep));
    if (which.id && targets.length !== 1) throw new NotFoundException("Session not found");
    const batch = this.firestore.db.batch();
    targets.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return { revoked: targets.length };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, currentRefreshToken?: string) {
    const ref = this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId);
    const user = (await ref.get()).data();
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw new UnauthorizedException("Current password is wrong");
    assertStrongPassword(newPassword, user.email);
    if (await bcrypt.compare(newPassword, user.passwordHash)) throw new BadRequestException("Choose a password you have not used here");
    await ref.update({ passwordHash: await bcrypt.hash(newPassword, 12), updatedAt: new Date().toISOString() });
    // Other devices must sign in again with the new password.
    await this.revokeSessions(userId, { allExcept: currentRefreshToken ?? null });
    return { changed: true };
  }

  // ─── MFA ──────────────────────────────────────────────────────────────────

  /** Starts MFA enrolment: a new secret to scan, held as pending until confirmed with a code. */
  async mfaSetup(userId: string) {
    const ref = this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId);
    const user = (await ref.get()).data();
    if (!user) throw new UnauthorizedException();
    if (user.mfaEnabled) throw new BadRequestException("Two-step sign-in is already on");
    const secret = newTotpSecret();
    await ref.update({ mfaPendingSecret: seal(secret) });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  /** Confirms enrolment with a code from the app; returns recovery codes, shown once. */
  async mfaEnable(userId: string, code: string) {
    const ref = this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId);
    const user = (await ref.get()).data();
    if (!user?.mfaPendingSecret) throw new BadRequestException("Start setup first");
    const secret = open(user.mfaPendingSecret);
    const step = verifyTotp(secret, code.trim());
    if (step === null) throw new BadRequestException("That code is not right; check the time on your phone");
    const recoveryCodes = newRecoveryCodes();
    await ref.update({
      mfaEnabled: true,
      mfaSecret: seal(secret),
      mfaPendingSecret: null,
      mfaLastStep: step,
      mfaRecoveryHashes: recoveryCodes.map(sha256),
      updatedAt: new Date().toISOString(),
    });
    return { enabled: true, recoveryCodes };
  }

  async mfaDisable(userId: string, code: string) {
    const ref = this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(userId);
    const user = (await ref.get()).data();
    if (!user?.mfaEnabled) throw new BadRequestException("Two-step sign-in is not on");
    if (!(await this.consumeSecondFactor(user, code))) throw new BadRequestException("Invalid code");
    await ref.update({ mfaEnabled: false, mfaSecret: null, mfaLastStep: null, mfaRecoveryHashes: [], updatedAt: new Date().toISOString() });
    return { enabled: false };
  }

  // ─── Throttling ───────────────────────────────────────────────────────────

  private throttleRef(emailLower: string) {
    return this.firestore.collection<ThrottleDoc>("loginThrottle").doc(sha256(emailLower));
  }

  private async assertNotLocked(emailLower: string) {
    const doc = (await this.throttleRef(emailLower).get()).data();
    if (doc?.lockedUntil && doc.lockedUntil > new Date().toISOString()) {
      const minutes = Math.ceil((new Date(doc.lockedUntil).getTime() - Date.now()) / 60_000);
      throw new HttpException(`Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async recordFailure(emailLower: string) {
    const ref = this.throttleRef(emailLower);
    await this.firestore.runTransaction(async (tx) => {
      const doc = (await tx.get(ref)).data();
      const failures = (doc?.lockedUntil && doc.lockedUntil <= new Date().toISOString() ? 0 : doc?.failures ?? 0) + 1;
      tx.set(ref, {
        failures: failures >= MAX_FAILURES ? 0 : failures,
        lockedUntil: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : doc?.lockedUntil ?? null,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  private async clearFailures(emailLower: string) {
    await this.throttleRef(emailLower).delete();
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
