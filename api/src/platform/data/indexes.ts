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

import { CRM_COLLECTIONS, CRM_LISTS } from "../../crm/crm.models.js";
import { PRODUCT_COLLECTIONS, PRODUCT_LISTS } from "../../products/products.models.js";
import { INVENTORY_COLLECTIONS, INVENTORY_LISTS } from "../../inventory/inventory.models.js";
import { SALES_COLLECTIONS, SALES_LISTS } from "../../sales/sales.models.js";
import { PROCUREMENT_COLLECTIONS, PROCUREMENT_LISTS } from "../../procurement/procurement.models.js";
import { FINANCE_COLLECTIONS, FINANCE_LISTS } from "../../finance/finance.models.js";
import { AR_COLLECTIONS, AR_LISTS } from "../../finance/ar.models.js";
import { AP_COLLECTIONS, AP_LISTS } from "../../finance/ap.models.js";
import { HR_COLLECTIONS, HR_LISTS } from "../../hr/hr.models.js";

export type Order = "ASCENDING" | "DESCENDING";

export interface IndexSpec {
  collection: string;
  fields: [field: string, order: Order][];
}

const asc = (field: string): [string, Order] => [field, "ASCENDING"];
const desc = (field: string): [string, Order] => [field, "DESCENDING"];

/**
 * What a large list may filter and sort on through Firestore. Every sort
 * works alone or with one of the filters; further filters are applied while
 * paging. Each combination costs one composite index.
 */
export interface LargeListSpec {
  filters: string[];
  sorts: { field: string; direction: "asc" | "desc" }[];
}

export function largeListIndexes(collection: string, spec: LargeListSpec): IndexSpec[] {
  const out: IndexSpec[] = [];
  for (const sort of spec.sorts) {
    const order: [string, Order] = [sort.field, sort.direction === "asc" ? "ASCENDING" : "DESCENDING"];
    out.push({ collection, fields: [asc("companyId"), asc("archived"), order] });
    for (const filter of spec.filters) out.push({ collection, fields: [asc("companyId"), asc("archived"), asc(filter), order] });
  }
  return out;
}

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

  // CRM
  ...largeListIndexes(CRM_COLLECTIONS.accounts, CRM_LISTS.accounts),
  ...largeListIndexes(CRM_COLLECTIONS.contacts, CRM_LISTS.contacts),
  ...largeListIndexes(CRM_COLLECTIONS.leads, CRM_LISTS.leads),
  ...largeListIndexes(CRM_COLLECTIONS.opportunities, CRM_LISTS.opportunities),
  ...largeListIndexes(CRM_COLLECTIONS.activities, CRM_LISTS.activities),

  // Products
  ...largeListIndexes(PRODUCT_COLLECTIONS.products, PRODUCT_LISTS.products),
  ...largeListIndexes(PRODUCT_COLLECTIONS.priceListItems, PRODUCT_LISTS.priceListItems),

  // Inventory
  ...largeListIndexes(INVENTORY_COLLECTIONS.movements, INVENTORY_LISTS.movements),
  ...largeListIndexes(INVENTORY_COLLECTIONS.adjustments, INVENTORY_LISTS.adjustments),
  ...largeListIndexes(INVENTORY_COLLECTIONS.transfers, INVENTORY_LISTS.transfers),
  ...largeListIndexes(INVENTORY_COLLECTIONS.counts, INVENTORY_LISTS.counts),
  // Sales
  ...largeListIndexes(SALES_COLLECTIONS.quotes, SALES_LISTS.quotes),
  ...largeListIndexes(SALES_COLLECTIONS.orders, SALES_LISTS.orders),
  ...largeListIndexes(SALES_COLLECTIONS.deliveries, SALES_LISTS.deliveries),
  ...largeListIndexes(SALES_COLLECTIONS.returns, SALES_LISTS.returns),
  ...largeListIndexes(PROCUREMENT_COLLECTIONS.suppliers, PROCUREMENT_LISTS.suppliers),
  ...largeListIndexes(PROCUREMENT_COLLECTIONS.requisitions, PROCUREMENT_LISTS.requisitions),
  ...largeListIndexes(PROCUREMENT_COLLECTIONS.rfqs, PROCUREMENT_LISTS.rfqs),
  ...largeListIndexes(PROCUREMENT_COLLECTIONS.orders, PROCUREMENT_LISTS.orders),
  ...largeListIndexes(PROCUREMENT_COLLECTIONS.receipts, PROCUREMENT_LISTS.receipts),
  ...largeListIndexes(PROCUREMENT_COLLECTIONS.returns, PROCUREMENT_LISTS.returns),
  ...largeListIndexes(FINANCE_COLLECTIONS.journals, FINANCE_LISTS.journals),
  ...largeListIndexes(AR_COLLECTIONS.invoices, AR_LISTS.invoices),
  ...largeListIndexes(AR_COLLECTIONS.receipts, AR_LISTS.receipts),
  ...largeListIndexes(AP_COLLECTIONS.bills, AP_LISTS.bills),
  { collection: AR_COLLECTIONS.invoices, fields: [asc("companyId"), asc("date")] },
  { collection: AP_COLLECTIONS.bills, fields: [asc("companyId"), asc("date")] },
  ...largeListIndexes(AP_COLLECTIONS.payments, AP_LISTS.payments),
  ...largeListIndexes("fixedAssets", { filters: ["status", "categoryId"], sorts: [{ field: "createdAt", direction: "desc" }, { field: "code", direction: "asc" }] }),
  ...largeListIndexes("expenseClaims", { filters: ["status", "employeeId"], sorts: [{ field: "createdAt", direction: "desc" }] }),
  { collection: FINANCE_COLLECTIONS.balances, fields: [asc("companyId"), asc("period")] },
  { collection: FINANCE_COLLECTIONS.entries, fields: [asc("companyId"), asc("accountId"), asc("date")] },
  { collection: FINANCE_COLLECTIONS.entries, fields: [asc("companyId"), asc("partyId"), asc("date")] },
  { collection: INVENTORY_COLLECTIONS.layers, fields: [asc("companyId"), asc("productId"), asc("open"), asc("receivedAt")] },

  // HR
  ...largeListIndexes(HR_COLLECTIONS.employees, HR_LISTS.employees),
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
