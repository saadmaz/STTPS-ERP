import { Injectable, NotFoundException } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service";
import { COLLECTIONS } from "../firestore/collections";
import { CompanyDoc, CompanyUserDoc, UserDoc, UserRoleDoc, RoleDoc } from "../firestore/models";
import { CreateCompanyDto } from "./dto/create-company.dto";

@Injectable()
export class CompanyService {
  constructor(private firestore: FirestoreService) {}

  async findAll(tenantId: string) {
    const snap = await this.firestore
      .collection<CompanyDoc>(COLLECTIONS.companies)
      .where("tenantId", "==", tenantId)
      .orderBy("name", "asc")
      .get();

    return Promise.all(
      snap.docs.map(async (doc) => {
        const company = doc.data();
        const parent = await this.getCompanySummary(company.parentId);
        return { ...company, parent };
      }),
    );
  }

  async findById(id: string, tenantId: string) {
    const doc = await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(id).get();
    const company = doc.data();
    if (!company || company.tenantId !== tenantId) throw new NotFoundException("Company not found");

    const [parent, childrenSnap] = await Promise.all([
      this.getCompanySummary(company.parentId),
      this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).where("parentId", "==", id).get(),
    ]);
    const children = childrenSnap.docs.map((d) => {
      const c = d.data();
      return { id: c.id, name: c.name, code: c.code };
    });

    return { ...company, parent, children };
  }

  async create(dto: CreateCompanyDto, tenantId: string) {
    const now = new Date().toISOString();
    const id = `${tenantId}_${dto.code}`;
    const company: CompanyDoc = {
      id,
      tenantId,
      name: dto.name,
      code: dto.code,
      legalName: dto.legalName ?? null,
      taxId: dto.taxId ?? null,
      currency: dto.currency ?? "USD",
      timezone: dto.timezone ?? "UTC",
      fiscalYearStart: dto.fiscalYearStart ?? 1,
      address: null,
      logoUrl: null,
      parentId: dto.parentId ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    // .create() (not .set()) so a duplicate code within this tenant throws,
    // same failure mode as the prior @@unique([tenantId,code]) constraint.
    await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(id).create(company);
    return company;
  }

  async update(id: string, tenantId: string, data: Partial<CreateCompanyDto>) {
    await this.findById(id, tenantId);
    // `code` is baked into the doc ID (`{tenantId}_{code}`) — renaming it
    // here would orphan every other collection's stored companyId, so it's
    // silently ignored rather than applied (a deliberate, small behavior
    // change from the prior Prisma code, which technically permitted it).
    const { code: _ignoredCode, ...rest } = data;
    const update = { ...rest, updatedAt: new Date().toISOString() };
    await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(id).update(update);
    const doc = await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(id).get();
    return doc.data();
  }

  async getUsers(companyId: string, tenantId: string) {
    await this.findById(companyId, tenantId);

    const cuSnap = await this.firestore
      .collection<CompanyUserDoc>(COLLECTIONS.companyUsers)
      .where("companyId", "==", companyId)
      .get();

    return Promise.all(
      cuSnap.docs.map(async (doc) => {
        const cu = doc.data();
        const userDoc = await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(cu.userId).get();
        const u = userDoc.data();

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
          user: u
            ? {
                id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName,
                phone: u.phone, avatar: u.avatar, isActive: u.isActive, lastLoginAt: u.lastLoginAt,
              }
            : null,
          userRoles,
        };
      }),
    );
  }

  private async getCompanySummary(companyId: string | null) {
    if (!companyId) return null;
    const doc = await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(companyId).get();
    const c = doc.data();
    return c ? { id: c.id, name: c.name, code: c.code } : null;
  }
}
