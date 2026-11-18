/**
 * Every Firestore composite index the API needs. The emulator does not
 * enforce indexes but production does, so each new query shape that combines
 * filters with ordering must be declared here. `npm run indexes` writes
 * firestore.indexes.json from this list, and a test fails if they drift.
 *
 * Firestore allows 200 composite indexes per database: master-data lists are
 * served without composite indexes (see MasterDataService.list), so this
 * budget is reserved for large transactional collections.
 */

export type Order = "ASCENDING" | "DESCENDING";

export interface IndexSpec {
  collection: string;
  fields: [field: string, order: Order][];
}

const asc = (field: string): [string, Order] => [field, "ASCENDING"];
const desc = (field: string): [string, Order] => [field, "DESCENDING"];

/** The default list index of TenantRepository: company, not archived, newest first. */
export function defaultListIndex(collection: string): IndexSpec {
  return { collection, fields: [asc("companyId"), asc("archivedAt"), desc("createdAt")] };
}

export const INDEXES: IndexSpec[] = [
  // Identity and tenancy
  { collection: "companies", fields: [asc("tenantId"), asc("name")] },
  { collection: "companies", fields: [asc("tenantId"), asc("createdAt")] },
  { collection: "users", fields: [asc("tenantId"), asc("firstName")] },
  { collection: "roles", fields: [asc("tenantId"), asc("name")] },
  { collection: "permissions", fields: [asc("module"), asc("action")] },

  // Platform kernel
  { collection: "auditLogs", fields: [asc("companyId"), asc("entity"), asc("entityId"), desc("createdAt")] },
  { collection: "domainEvents", fields: [asc("companyId"), asc("entity"), asc("entityId"), desc("occurredAt")] },
  { collection: "jobs", fields: [asc("status"), asc("runAt")] },
  { collection: "jobs", fields: [asc("status"), asc("leaseUntil")] },
  { collection: "notifications", fields: [asc("userId"), desc("createdAt")] },
  { collection: "notifications", fields: [asc("userId"), asc("readAt"), desc("createdAt")] },

  // Organisation
  {
    collection: "exchangeRates",
    fields: [asc("companyId"), asc("archivedAt"), asc("fromCurrency"), asc("toCurrency"), desc("effectiveDate")],
  },
];

/** The firestore.indexes.json document for INDEXES. */
export function indexesFile(): { indexes: unknown[]; fieldOverrides: unknown[] } {
  return {
    indexes: INDEXES.map((spec) => ({
      collectionGroup: spec.collection,
      queryScope: "COLLECTION",
      fields: spec.fields.map(([fieldPath, order]) => ({ fieldPath, order })),
    })),
    fieldOverrides: [],
  };
}
