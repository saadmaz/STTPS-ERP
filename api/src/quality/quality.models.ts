import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const QUALITY_COLLECTIONS = {
  inspectionPlans: "qualityInspectionPlans",
  inspections: "qualityInspections",
  nonConformances: "qualityNonConformances",
} as const;

export const INSPECTION_STAGES = ["incoming", "in_process", "finished"] as const;
export const INSPECTION_ITEM_TYPES = ["pass_fail", "numeric", "text"] as const;
export const INSPECTION_RESPONSE_RESULTS = ["pass", "fail", "na"] as const;
export const INSPECTION_RESULTS = ["pass", "fail", "conditional"] as const;
export const INSPECTION_STATUSES = ["planned", "in_progress", "completed", "cancelled"] as const;
export const NCR_SEVERITIES = ["minor", "major", "critical"] as const;
export const NCR_STATUSES = ["open", "in_progress", "closed"] as const;
export const NCR_ACTION_TYPES = ["corrective", "preventive"] as const;

export interface InspectionPlanItem {
  itemId: string;
  seq: number;
  question: string;
  type: (typeof INSPECTION_ITEM_TYPES)[number];
  minValue: number | null;
  maxValue: number | null;
  isRequired: boolean;
}

/** What to check for a stage of inspection; optionally scoped to one product. */
export interface InspectionPlanDoc extends BaseDoc {
  code: string;
  name: string;
  stage: (typeof INSPECTION_STAGES)[number];
  productId: string | null;
  sampleSize: number | null;
  items: InspectionPlanItem[];
  isActive: boolean;
}

export interface InspectionResponse {
  itemId: string;
  result: (typeof INSPECTION_RESPONSE_RESULTS)[number];
  numericValue: number | null;
  textValue: string | null;
  notes: string | null;
}

/**
 * One inspection event. Linking to the goods receipt or production order it
 * is about reuses the generic related-records feature
 * (`/records/:type/:id/related`) rather than a bespoke `referenceType`/
 * `referenceId` pair — the same choice Documents made, for the same reason.
 */
export interface InspectionDoc extends BaseDoc {
  number: string;
  planId: string;
  stage: (typeof INSPECTION_STAGES)[number];
  productId: string | null;
  status: (typeof INSPECTION_STATUSES)[number];
  scheduledAt: string | null;
  conductedAt: string | null;
  conductedBy: string | null;
  qtyInspected: number | null;
  qtySampled: number | null;
  qtyRejected: number | null;
  responses: InspectionResponse[];
  overallResult: (typeof INSPECTION_RESULTS)[number] | null;
  findings: string | null;
  notes: string | null;
}

export interface NcrAction {
  actionId: string;
  type: (typeof NCR_ACTION_TYPES)[number];
  description: string;
  assignedTo: string;
  dueDate: string | null;
  status: "open" | "done";
  completedAt: string | null;
}

export interface NonConformanceDoc extends BaseDoc {
  number: string;
  title: string;
  description: string;
  severity: (typeof NCR_SEVERITIES)[number];
  status: (typeof NCR_STATUSES)[number];
  inspectionId: string | null;
  productId: string | null;
  raisedBy: string;
  dueDate: string | null;
  actions: NcrAction[];
  resolution: string | null;
  closedAt: string | null;
}

export const QUALITY_LISTS: Record<"inspections", LargeListSpec> = {
  inspections: { filters: [], sorts: [{ field: "createdAt", direction: "desc" }] },
};
