import { Injectable, NotFoundException } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service";
import { COLLECTIONS } from "../firestore/collections";
import { TenantDoc } from "../firestore/models";

@Injectable()
export class TenantService {
  constructor(private firestore: FirestoreService) {}

  async findAll() {
    const snap = await this.firestore
      .collection<TenantDoc>(COLLECTIONS.tenants)
      .orderBy("createdAt", "desc")
      .get();
    return snap.docs.map((d) => d.data());
  }

  async findBySlug(slug: string) {
    const indexDoc = await this.firestore.collection(COLLECTIONS.tenantSlugIndex).doc(slug).get();
    if (!indexDoc.exists) throw new NotFoundException("Tenant not found");
    return this.findById(indexDoc.data()!.tenantId);
  }

  async findById(id: string) {
    const doc = await this.firestore.collection<TenantDoc>(COLLECTIONS.tenants).doc(id).get();
    if (!doc.exists) throw new NotFoundException("Tenant not found");
    return doc.data();
  }

  async getStats(tenantId: string) {
    const [companies, users] = await Promise.all([
      this.firestore.collection(COLLECTIONS.companies).where("tenantId", "==", tenantId).count().get(),
      this.firestore.collection(COLLECTIONS.users).where("tenantId", "==", tenantId).count().get(),
    ]);
    return { companies: companies.data().count, users: users.data().count };
  }
}
