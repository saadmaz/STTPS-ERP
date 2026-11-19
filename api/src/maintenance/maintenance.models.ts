import type { BaseDoc } from "../platform/data/repository.js";

export const MAINTENANCE_COLLECTIONS = {
  plans: "maintenancePlans",
  workOrders: "maintenanceWorkOrders",
} as const;

export const WORK_ORDER_TYPES = ["preventive", "corrective", "predictive", "emergency"] as const;
export const WORK_ORDER_STATUSES = ["requested", "scheduled", "in_progress", "completed", "cancelled"] as const;
export const WORK_ORDER_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const PLAN_FREQUENCIES = ["daily", "weekly", "monthly", "custom"] as const;

export interface ChecklistItem {
  itemId: string;
  text: string;
  done: boolean;
}

/** A recurring preventive schedule for one asset (blueprint §16 "equipment schedules"/"maintenance plans"). */
export interface MaintenancePlanDoc extends BaseDoc {
  assetId: string;
  name: string;
  frequency: (typeof PLAN_FREQUENCIES)[number];
  intervalDays: number;
  lastDoneDate: string | null;
  nextDueDate: string;
  checklistTemplate: string[];
  active: boolean;
  notes: string | null;
}

export interface PartUsed {
  productId: string;
  /** Thousandths (QTY_SCALE). */
  qty: number;
  unitCost: number | null;
  totalCost: number;
}

/**
 * One maintenance event (blueprint §16 workflow: trigger → work order →
 * technician → parts → repair → completion → asset history and costs).
 * Technician assignment and labour cost are by platform user id and a
 * manually entered rate, the same pattern Tasks' time entries use, to avoid
 * this module needing anything from HR. Parts consumption is recorded for
 * costing only — it does not post a real stock movement against Inventory
 * (a deliberate scope cut; see the plan's note on this item).
 */
export interface WorkOrderDoc extends BaseDoc {
  code: string;
  assetId: string;
  planId: string | null;
  type: (typeof WORK_ORDER_TYPES)[number];
  title: string;
  description: string | null;
  priority: (typeof WORK_ORDER_PRIORITIES)[number];
  status: (typeof WORK_ORDER_STATUSES)[number];
  requestedBy: string;
  assignedTo: string | null;
  scheduledDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  downtimeMinutes: number;
  parts: PartUsed[];
  /** Thousandths (QTY_SCALE). */
  laborHours: number;
  laborCost: number;
  partsCost: number;
  totalCost: number;
  checklist: ChecklistItem[];
  notes: string | null;
}
