import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const INVENTORY_COLLECTIONS = {
  warehouses: "warehouses",
  locations: "warehouseLocations",
  movements: "stockMovements",
  balances: "stockBalances",
  summaries: "stockSummaries",
  layers: "stockCostLayers",
  serials: "stockSerials",
  reservations: "stockReservations",
  adjustments: "stockAdjustments",
  transfers: "stockTransfers",
  counts: "stockCounts",
  settings: "inventorySettings",
} as const;

export interface WarehouseDoc extends BaseDoc {
  code: string;
  name: string;
  type: "main" | "store" | "transit" | "virtual";
  branchId: string | null;
  /** null: follow the company policy. */
  allowNegative: boolean | null;
  isActive: boolean;
}

export interface LocationDoc extends BaseDoc {
  warehouseId: string;
  code: string;
  zone: string | null;
  isActive: boolean;
}

export const MOVEMENT_TYPES = [
  "receipt",
  "issue",
  "adjustment",
  "transfer_out",
  "transfer_in",
  "count",
  "sale",
  "purchase",
  "customer_return",
  "supplier_return",
  "production_in",
  "production_out",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export interface RecordRef {
  entityType: string;
  entityId: string;
  label: string;
}

/** One immutable line of the stock ledger. Corrections are new movements, never edits. */
export interface StockMovementDoc extends BaseDoc {
  number: string;
  type: MovementType;
  productId: string;
  warehouseId: string;
  locationId: string | null;
  lotNo: string | null;
  expiryDate: string | null;
  serialNos: string[];
  /** Signed, thousandths of the base unit: positive in, negative out. */
  qty: number;
  /** Minor units of the company currency per base unit. */
  unitCost: number;
  /** Signed value in minor units (qty × cost). */
  value: number;
  currency: string;
  reference: RecordRef | null;
  reason: string | null;
  postedAt: string;
  /** Date the movement belongs to (YYYY-MM-DD), for period reporting. */
  date: string;
}

/** Quantity of one product in one warehouse and lot (projection of the ledger). */
export interface StockBalanceDoc {
  id: string;
  tenantId: string;
  companyId: string;
  productId: string;
  warehouseId: string;
  lotNo: string | null;
  expiryDate: string | null;
  onHand: number;
  reserved: number;
  updatedAt: string;
}

/** Company-wide position and value of one product (projection of the ledger). */
export interface StockSummaryDoc {
  id: string;
  tenantId: string;
  companyId: string;
  productId: string;
  onHand: number;
  reserved: number;
  inTransit: number;
  onOrder: number;
  /** Minor units: total inventory value. */
  value: number;
  /** Minor units per base unit (weighted average or standard). */
  avgCost: number;
  reorderPoint: number;
  safetyStock: number;
  reorderQty: number;
  lowStock: boolean;
  lastReceiptAt: string | null;
  lastIssueAt: string | null;
  updatedAt: string;
}

/** FIFO cost layer: a receipt's remaining quantity at its cost. */
export interface CostLayerDoc {
  id: string;
  companyId: string;
  productId: string;
  receivedAt: string;
  qtyRemaining: number;
  unitCost: number;
  movementId: string;
  /** Has quantity left; lets issues find the oldest open layers with one index. */
  open: boolean;
}

export interface SerialDoc {
  id: string;
  companyId: string;
  productId: string;
  serialNo: string;
  status: "in_stock" | "out";
  warehouseId: string | null;
  lastMovementId: string;
  history: { movementId: string; type: MovementType; at: string; warehouseId: string }[];
}

export interface ReservationDoc extends BaseDoc {
  productId: string;
  warehouseId: string;
  lotNo: string | null;
  qty: number;
  reference: RecordRef;
  status: "active" | "released" | "consumed";
}

export interface DocLine {
  productId: string;
  /** Signed for adjustments, positive for transfers. Thousandths of the base unit. */
  qty: number;
  lotNo: string | null;
  expiryDate: string | null;
  serialNos: string[];
  /** Optional cost for stock increases (minor units per base unit). */
  unitCost: number | null;
}

export interface AdjustmentDoc extends BaseDoc {
  number: string;
  warehouseId: string;
  reason: string;
  note: string | null;
  date: string;
  lines: DocLine[];
  status: "draft" | "pending_approval" | "posted" | "rejected" | "cancelled";
  /** Absolute value of the adjustment (minor units), estimated at submission for approval rules. */
  estimatedValue: number;
  postedAt: string | null;
}

export interface TransferDoc extends BaseDoc {
  number: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  date: string;
  note: string | null;
  lines: DocLine[];
  status: "draft" | "in_transit" | "received" | "cancelled";
  shippedAt: string | null;
  receivedAt: string | null;
}

export interface CountLine {
  productId: string;
  lotNo: string | null;
  expected: number;
  counted: number | null;
}

export interface CountDoc extends BaseDoc {
  number: string;
  warehouseId: string;
  status: "counting" | "posted" | "cancelled";
  /** Snapshot of the counted products when the count started. */
  lines: CountLine[];
  startedAt: string;
  postedAt: string | null;
  note: string | null;
}

export interface InventorySettingsDoc {
  companyId: string;
  allowNegative: boolean;
  adjustmentReasons: string[];
  /** Warehouses with a count in progress: no movements allowed. */
  lockedWarehouses: Record<string, string>;
  updatedAt: string;
}

export const DEFAULT_ADJUSTMENT_REASONS = ["damaged", "expired", "lost", "found", "correction", "sample", "write_off", "opening_balance"];

export const INVENTORY_LISTS: Record<"movements" | "adjustments" | "transfers" | "counts", LargeListSpec> = {
  movements: { filters: ["productId", "warehouseId", "type"], sorts: [{ field: "postedAt", direction: "desc" }] },
  adjustments: { filters: ["status", "warehouseId"], sorts: [{ field: "createdAt", direction: "desc" }] },
  transfers: { filters: ["status", "fromWarehouseId", "toWarehouseId"], sorts: [{ field: "createdAt", direction: "desc" }] },
  counts: { filters: ["status", "warehouseId"], sorts: [{ field: "createdAt", direction: "desc" }] },
};

export const balanceId = (companyId: string, productId: string, warehouseId: string, lotNo: string | null) =>
  `${companyId}__${productId}__${warehouseId}__${lotNo ? encodeURIComponent(lotNo) : "-"}`;
export const summaryId = (companyId: string, productId: string) => `${companyId}__${productId}`;
export const serialId = (companyId: string, productId: string, serialNo: string) => `${companyId}__${productId}__${encodeURIComponent(serialNo)}`;
