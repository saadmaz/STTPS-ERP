import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const SHIFT_COLLECTIONS = {
  templates: "hrShiftTemplates",
  assignments: "hrShiftAssignments",
} as const;

export const ASSIGNMENT_STATUSES = ["scheduled", "swapped", "cancelled"] as const;
export const SWAP_STATUSES = ["pending", "approved", "rejected"] as const;

/** A reusable shift shape (blueprint §11 shift management). */
export interface ShiftTemplateDoc extends BaseDoc {
  code: string;
  name: string;
  /** "09:00" */
  startTime: string;
  /** "17:00"; a night shift has `endTime <= startTime` (crosses midnight). */
  endTime: string;
  isNightShift: boolean;
  breakMinutes: number;
  color: string | null;
  notes: string | null;
}

export interface SwapRequest {
  requestedAt: string;
  requestedBy: string;
  targetAssignmentId: string;
  targetEmployeeId: string;
  note: string | null;
  status: (typeof SWAP_STATUSES)[number];
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

/**
 * One employee assigned to one shift on one date. `startTime`/`endTime` are
 * copied from the template at assignment time, so editing or retiring a
 * template later never changes shifts already assigned — the same
 * snapshot-at-write approach as an order line's price.
 */
export interface ShiftAssignmentDoc extends BaseDoc {
  employeeId: string;
  date: string;
  templateId: string;
  startTime: string;
  endTime: string;
  isNightShift: boolean;
  isHoliday: boolean;
  status: (typeof ASSIGNMENT_STATUSES)[number];
  swap: SwapRequest | null;
  notes: string | null;
}

export const SHIFT_LISTS: Record<"assignments", LargeListSpec> = {
  assignments: { filters: ["employeeId"], sorts: [{ field: "date", direction: "desc" }] },
};
