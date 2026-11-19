import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const TASK_COLLECTIONS = {
  tasks: "tasks",
  timeEntries: "timeEntries",
} as const;

/** Blueprint §25's suggested flow. */
export const TASK_STATUSES = ["todo", "in_progress", "blocked", "review", "completed"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly"] as const;

export interface ChecklistItem {
  itemId: string;
  text: string;
  done: boolean;
}

export interface Recurrence {
  frequency: (typeof RECURRENCE_FREQUENCIES)[number];
  interval: number;
  /** No further occurrences are created once the next due date would be past this. */
  until: string | null;
}

/**
 * A personal or project task (blueprint §25 My Work, and §13's project
 * tasks/subtasks — one entity serves both, `projectId` being null for a
 * personal task). Assignment is by platform user id, the same identity
 * Approvals and Notifications already use, so this module needs nothing
 * from HR. Comments, tags, files and the activity timeline come for free
 * from the generic per-record platform (`registerRecordType`).
 */
export interface TaskDoc extends BaseDoc {
  title: string;
  description: string | null;
  projectId: string | null;
  /** Who created it. */
  ownerId: string;
  assigneeId: string | null;
  collaboratorIds: string[];
  priority: (typeof TASK_PRIORITIES)[number];
  status: (typeof TASK_STATUSES)[number];
  dueDate: string | null;
  /** Hours, thousandths (QTY_SCALE), matching the codebase's quantity convention. */
  estimatedHours: number | null;
  /** Kept in sync with the sum of this task's time entries. */
  actualHours: number;
  parentTaskId: string | null;
  dependsOnTaskIds: string[];
  checklist: ChecklistItem[];
  tags: string[];
  recurrence: Recurrence | null;
  reminderAt: string | null;
  completedAt: string | null;
}

/** Billable or not, against a task, a project, or neither (e.g. general admin time). */
export interface TimeEntryDoc extends BaseDoc {
  userId: string;
  taskId: string | null;
  projectId: string | null;
  date: string;
  hours: number;
  billable: boolean;
  approved: boolean;
  /** Minor units, entered by hand; this module does not resolve a real pay or bill rate. */
  cost: number | null;
  description: string | null;
}

export const TASK_LISTS: Record<"tasks" | "timeEntries", LargeListSpec> = {
  tasks: { filters: ["assigneeId"], sorts: [{ field: "createdAt", direction: "desc" }] },
  timeEntries: { filters: ["userId"], sorts: [{ field: "date", direction: "desc" }] },
};
