import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { COLLECTIONS } from "../firestore/collections.js";
import { CompanyDoc, CompanyUserDoc, RoleDoc, UserDoc, UserRoleDoc } from "../firestore/models.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import * as bcrypt from "bcryptjs";

@Injectable()
export class UserService {
  constructor(private firestore: FirestoreService) {}

  async findAll(tenantId: string) {
    const snap = await this.firestore
      .collection<UserDoc>(COLLECTIONS.users)
      .where("tenantId", "==", tenantId)
      .orderBy("firstName", "asc")
      .get();

    return Promise.all(snap.docs.map((d) => this.toListShape(d.data())));
  }

  async findById(id: string, tenantId: string) {
    const doc = await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(id).get();
    const user = doc.data();
    if (!user || user.tenantId !== tenantId) throw new NotFoundException("User not found");

    const companyUsers = await this.getCompanyUsersDetail(id);
    return {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      phone: user.phone, avatar: user.avatar, isActive: user.isActive, isSuperAdmin: user.isSuperAdmin,
      mfaEnabled: user.mfaEnabled, lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt, updatedAt: user.updatedAt,
      companyUsers,
    };
  }

  async create(dto: CreateUserDto, tenantId: string) {
    const emailLower = dto.email.toLowerCase();
    const indexRef = this.firestore.collection(COLLECTIONS.emailIndex).doc(`${tenantId}_${emailLower}`);
    const existing = await indexRef.get();
    if (existing.exists) throw new ConflictException("Email already exists in this organization");

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const now = new Date().toISOString();
    const id = this.firestore.newId(COLLECTIONS.users);
    const user: UserDoc = {
      id, tenantId, email: dto.email, emailLower,
      firstName: dto.firstName, lastName: dto.lastName, passwordHash,
      phone: dto.phone ?? null, avatar: null, isActive: true,
      isSuperAdmin: false, isPlatformAdmin: false, mfaEnabled: false, mfaSecret: null,
      lastLoginAt: null, createdAt: now, updatedAt: now,
    };

    await this.firestore.runTransaction(async (tx) => {
      tx.create(indexRef, { userId: id });
      tx.set(this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(id), user);
    });

    return {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      phone: user.phone, isActive: user.isActive, createdAt: user.createdAt,
    };
  }

  async update(id: string, tenantId: string, data: Partial<CreateUserDto>) {
    await this.findById(id, tenantId);
    const update: Record<string, unknown> = { ...data, updatedAt: new Date().toISOString() };
    if (data.password) {
      update.passwordHash = await bcrypt.hash(data.password, 12);
      delete update.password;
    }
    await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(id).update(update);
    const doc = await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(id).get();
    return doc.data();
  }

  async deactivate(id: string, tenantId: string) {
    await this.findById(id, tenantId);
    await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(id).update({
      isActive: false,
      updatedAt: new Date().toISOString(),
    });
    const doc = await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(id).get();
    return doc.data();
  }

  private async toListShape(user: UserDoc) {
    const companyUsers = await this.getCompanyUsersDetail(user.id);
    return {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      phone: user.phone, avatar: user.avatar, isActive: user.isActive, isSuperAdmin: user.isSuperAdmin,
      lastLoginAt: user.lastLoginAt, createdAt: user.createdAt,
      companyUsers,
    };
  }

  private async getCompanyUsersDetail(userId: string) {
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
          company: company ? { id: company.id, name: company.name, code: company.code } : null,
          userRoles,
        };
      }),
    );
  }
}
