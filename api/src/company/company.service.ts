import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { UpdateCompanyDto } from "./dto/update-company.dto.js";
import { FirestoreService } from "../firestore/firestore.service.js";
import { COLLECTIONS } from "../firestore/collections.js";
import { CompanyDoc, CompanyUserDoc, UserDoc, UserRoleDoc, RoleDoc } from "../firestore/models.js";
import { CreateCompanyDto } from "./dto/create-company.dto.js";

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

  /** The parent must be another company of the same tenant, and not a descendant (no cycles). */
  private async assertValidParent(id: string | null, parentId: string, tenantId: string) {
    let cursor: string | null = parentId;
    for (let depth = 0; cursor; depth++) {
      if (cursor === id || depth > 20) throw new BadRequestException("Invalid parent company");
      const parent = (await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(cursor).get()).data();
      if (!parent || parent.tenantId !== tenantId) throw new BadRequestException("Parent company not found");
      cursor = parent.parentId;
    }
  }

  async create(dto: CreateCompanyDto, tenantId: string) {
    if (dto.parentId) await this.assertValidParent(null, dto.parentId, tenantId);
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

  async update(id: string, tenantId: string, data: UpdateCompanyDto) {
    await this.findById(id, tenantId);
    if (data.parentId) await this.assertValidParent(id, data.parentId, tenantId);
    // `code` is part of the doc id and is not in UpdateCompanyDto; copy only known fields.
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of ["name", "legalName", "taxId", "currency", "timezone", "fiscalYearStart", "parentId"] as const) {
      if (data[key] !== undefined) update[key] = data[key];
    }
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
