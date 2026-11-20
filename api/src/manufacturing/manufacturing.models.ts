import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const MFG_COLLECTIONS = {
  workCentres: "mfgWorkCentres",
  machines: "mfgMachines",
  boms: "mfgBoms",
  routings: "mfgRoutings",
  productionOrders: "mfgProductionOrders",
} as const;

export const MACHINE_STATUSES = ["operational", "maintenance", "down"] as const;
export const BOM_STATUSES = ["draft", "active", "obsolete"] as const;
export const PRODUCTION_ORDER_STATUSES = ["planned", "released", "in_progress", "completed", "cancelled"] as const;

export interface WorkCentreDoc extends BaseDoc {
  code: string;
  name: string;
  description: string | null;
  capacityHoursPerDay: number | null;
}

export interface MachineDoc extends BaseDoc {
  code: string;
  name: string;
  workCentreId: string;
  status: (typeof MACHINE_STATUSES)[number];
}

export interface BomLine {
  componentProductId: string;
  /** Thousandths (see `platform/data/money.ts`), per one unit of the parent product. */
  qty: number;
  /** Hundredths of a percent (800 = 8%), applied to `qty` for planned scrap. */
  scrapPct: number;
  isAlternate: boolean;
  alternateGroup: string | null;
  laborMinutes: number;
}

/** Versioned by `(productId, revision)`; the active one for a date is resolved by `BomService.activeFor`. */
export interface BomDoc extends BaseDoc {
  productId: string;
  revision: number;
  status: (typeof BOM_STATUSES)[number];
  effectiveFrom: string;
  effectiveTo: string | null;
  lines: BomLine[];
  notes: string | null;
}

export interface RoutingOperation {
  seq: number;
  name: string;
  workCentreId: string;
  setupMinutes: number;
  runMinutesPerUnit: number;
}

export interface RoutingDoc extends BaseDoc {
  productId: string;
  revision: number;
  status: (typeof BOM_STATUSES)[number];
  operations: RoutingOperation[];
}

export interface ProductionMaterial {
  componentProductId: string;
  qtyRequired: number;
  qtyIssued: number;
}

export interface ProductionOperation {
  seq: number;
  name: string;
  workCentreId: string;
  machineId: string | null;
  status: "pending" | "in_progress" | "completed";
  actualMinutes: number;
  downtimeMinutes: number;
}

/**
 * One production run. Material issue and finished-goods output are recorded
 * here for costing and tracking only, **not** posted to Inventory's own
 * ledger — the same deliberate gap Maintenance's parts consumption already
 * documents, and for the same reason (it would mean this module depending on
 * Inventory's adjustment lifecycle, built for a different purpose, or the
 * reverse; neither was worth it for this pass).
 */
export interface ProductionOrderDoc extends BaseDoc {
  number: string;
  productId: string;
  bomId: string;
  routingId: string | null;
  qtyPlanned: number;
  qtyProduced: number;
  qtyScrapped: number;
  status: (typeof PRODUCTION_ORDER_STATUSES)[number];
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  warehouseId: string | null;
  materials: ProductionMaterial[];
  operations: ProductionOperation[];
  notes: string | null;
}

export const MFG_LISTS: Record<"productionOrders", LargeListSpec> = {
  productionOrders: { filters: [], sorts: [{ field: "createdAt", direction: "desc" }] },
};
