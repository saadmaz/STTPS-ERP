import type { BaseDoc } from "../platform/data/repository.js";

export const PROJECT_COLLECTIONS = {
  projects: "projects",
  phases: "projectPhases",
  milestones: "projectMilestones",
  costs: "projectCosts",
} as const;

export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const;
export const PROJECT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const BILLING_METHODS = ["fixed", "time_and_materials", "milestone", "retainer", "recurring"] as const;
export const PHASE_STATUSES = ["not_started", "in_progress", "completed"] as const;
export const MILESTONE_STATUSES = ["pending", "completed"] as const;
export const COST_CATEGORIES = ["material", "expense", "contractor", "other"] as const;

/** Blueprint §13 project setup. Team, manager and billing contact are platform user ids (the same identity Tasks and Approvals use). */
export interface ProjectDoc extends BaseDoc {
  code: string;
  name: string;
  customerId: string | null;
  managerId: string | null;
  teamUserIds: string[];
  departmentId: string | null;
  branchId: string | null;
  startDate: string | null;
  endDate: string | null;
  status: (typeof PROJECT_STATUSES)[number];
  priority: (typeof PROJECT_PRIORITIES)[number];
  currency: string;
  budget: number | null;
  estimatedRevenue: number | null;
  estimatedCost: number | null;
  billingMethod: (typeof BILLING_METHODS)[number];
  /** Running total of invoices raised through `bill`; not a reconciled AR balance. */
  billedToDate: number;
  description: string | null;
  notes: string | null;
}

export interface ProjectPhaseDoc extends BaseDoc {
  projectId: string;
  name: string;
  sequence: number;
  startDate: string | null;
  endDate: string | null;
  status: (typeof PHASE_STATUSES)[number];
}

export interface MilestoneDoc extends BaseDoc {
  projectId: string;
  phaseId: string | null;
  name: string;
  dueDate: string | null;
  status: (typeof MILESTONE_STATUSES)[number];
  completedAt: string | null;
  notes: string | null;
}

/** A manually recorded material, contractor or other non-labour cost; labour cost comes from the Tasks module's time entries instead. */
export interface ProjectCostDoc extends BaseDoc {
  projectId: string;
  category: (typeof COST_CATEGORIES)[number];
  amount: number;
  date: string;
  description: string | null;
}
