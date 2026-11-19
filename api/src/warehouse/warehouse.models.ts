import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";
import type { RecordRef } from "../inventory/inventory.models.js";

export const WAREHOUSE_COLLECTIONS = {
  putAwayRules: "warehousePutAwayRules",
  tasks: "warehouseTasks",
} as const;

export const TASK_TYPES = ["putaway", "pick", "count"] as const;
export const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
export const PICKING_STRATEGIES = ["fifo", "fefo", "zone"] as const;

/**
 * Where to put away a received product by default. Matched most-specific
 * first: a `productId` rule beats a `categoryId` rule beats a warehouse-wide
 * default (both null), each in `priority` order among ties.
 */
export interface PutAwayRuleDoc extends BaseDoc {
  warehouseId: string;
  productId: string | null;
  categoryId: string | null;
  targetLocationId: string;
  priority: number;
}

/**
 * One put-away, pick or count job for a warehouse worker. Scanning a task's
 * `number` (the mobile barcode/QR flow) looks it up by `POST
 * /warehouse/tasks/scan`. Completing a task does **not** move stock itself —
 * that still happens through the existing goods-receipt and delivery
 * pick/pack/dispatch flows; this is a tracking and assignment layer on top,
 * the same way Maintenance's work orders track labour without being the
 * thing that changes an asset's ledger.
 */
export interface WarehouseTaskDoc extends BaseDoc {
  number: string;
  type: (typeof TASK_TYPES)[number];
  status: (typeof TASK_STATUSES)[number];
  warehouseId: string;
  locationId: string | null;
  productId: string;
  qty: number;
  assignedTo: string | null;
  reference: RecordRef | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
}

export const WAREHOUSE_LISTS: Record<"tasks", LargeListSpec> = {
  tasks: { filters: [], sorts: [{ field: "createdAt", direction: "desc" }] },
};
