import type { BaseDoc } from "../platform/data/repository.js";

export const MRP_COLLECTIONS = {
  demandForecasts: "mfgDemandForecasts",
  runs: "mfgMrpRuns",
} as const;

export const MRP_LINE_STATUSES = ["suggested", "converted", "dismissed"] as const;
export type MrpLineStatus = (typeof MRP_LINE_STATUSES)[number];

/** A manually entered demand quantity for a product in one calendar month, fed into MRP alongside open sales orders. */
export interface DemandForecastDoc extends BaseDoc {
  productId: string;
  /** `YYYY-MM`. */
  period: string;
  qty: number;
  notes: string | null;
}

export interface MrpDemandLine {
  productId: string;
  source: "salesOrder" | "forecast";
  sourceId: string | null;
  dueDate: string;
  qty: number;
}

export interface MrpPlannedProductionLine {
  lineId: string;
  productId: string;
  qty: number;
  dueDate: string;
  bomId: string;
  status: MrpLineStatus;
  productionOrderId: string | null;
}

export interface MrpPlannedPurchaseLine {
  lineId: string;
  productId: string;
  qty: number;
  dueDate: string;
  status: MrpLineStatus;
  requisitionId: string | null;
}

/**
 * The output of one MRP computation: net requirements for the demand horizon,
 * exploded one BOM level deep. See `MrpService.computePlan` for the netting
 * and explosion rules and their documented scope cuts (single-level BOM
 * explosion, existing purchase orders read from Inventory's `onOrder`,
 * existing production orders read directly).
 */
export interface MrpRunDoc extends BaseDoc {
  runAt: string;
  /** The demand cutoff date this run was computed against. */
  horizonEnd: string;
  demand: MrpDemandLine[];
  plannedProduction: MrpPlannedProductionLine[];
  plannedPurchases: MrpPlannedPurchaseLine[];
  notes: string | null;
}
