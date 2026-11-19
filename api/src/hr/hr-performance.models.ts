import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const PERFORMANCE_COLLECTIONS = {
  cycles: "hrPerformanceCycles",
  goals: "hrGoals",
  reviews: "hrReviews",
  developmentPlans: "hrDevelopmentPlans",
} as const;

export const CYCLE_STATUSES = ["draft", "active", "closed"] as const;
export const GOAL_TYPES = ["goal", "kpi", "okr"] as const;
export const GOAL_STATUSES = ["not_started", "in_progress", "completed", "missed"] as const;
export const REVIEW_TYPES = ["self", "manager", "peer"] as const;
export const REVIEW_STATUSES = ["draft", "submitted"] as const;
export const DEVELOPMENT_PLAN_STATUSES = ["active", "completed", "cancelled"] as const;

export interface PerformanceCycleDoc extends BaseDoc {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  status: (typeof CYCLE_STATUSES)[number];
  description: string | null;
}

/** A goal, KPI or OKR for one employee in one cycle (blueprint §11 performance). */
export interface GoalDoc extends BaseDoc {
  employeeId: string;
  cycleId: string;
  title: string;
  description: string | null;
  type: (typeof GOAL_TYPES)[number];
  /** Percentage weight toward the overall rating, 0-100; purely informational, not auto-calculated into a score. */
  weight: number | null;
  targetValue: string | null;
  currentValue: string | null;
  status: (typeof GOAL_STATUSES)[number];
  dueDate: string | null;
}

/**
 * A self-assessment, manager review or peer feedback entry for one employee
 * in one cycle. One `ReviewDoc` per reviewer; a peer-reviewed employee can
 * have several for the same cycle, one per peer.
 */
export interface ReviewDoc extends BaseDoc {
  employeeId: string;
  cycleId: string;
  reviewerId: string;
  type: (typeof REVIEW_TYPES)[number];
  /** 1-5; null until submitted. */
  rating: number | null;
  strengths: string | null;
  improvements: string | null;
  comments: string | null;
  /** Only meaningful on a manager review. */
  recommendsPromotion: boolean;
  promotionNote: string | null;
  status: (typeof REVIEW_STATUSES)[number];
  submittedAt: string | null;
}

export interface DevelopmentPlanDoc extends BaseDoc {
  employeeId: string;
  cycleId: string | null;
  title: string;
  focusAreas: string | null;
  actions: string | null;
  targetDate: string | null;
  status: (typeof DEVELOPMENT_PLAN_STATUSES)[number];
  notes: string | null;
}

export const PERFORMANCE_LISTS: Record<"goals" | "reviews", LargeListSpec> = {
  goals: { filters: ["employeeId"], sorts: [{ field: "createdAt", direction: "desc" }] },
  reviews: { filters: ["employeeId"], sorts: [{ field: "createdAt", direction: "desc" }] },
};
