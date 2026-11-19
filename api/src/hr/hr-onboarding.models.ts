import type { BaseDoc } from "../platform/data/repository.js";

export const ONBOARDING_COLLECTIONS = {
  checklists: "hrChecklists",
} as const;

export const CHECKLIST_TYPES = ["onboarding", "offboarding"] as const;
export const CHECKLIST_STATUSES = ["in_progress", "completed", "cancelled"] as const;
export const CHECKLIST_ITEM_STATUSES = ["pending", "done", "skipped"] as const;
export const CHECKLIST_ITEM_CATEGORIES = ["account", "access", "equipment", "documents", "training", "policy", "introduction", "other"] as const;

export interface ChecklistItem {
  itemId: string;
  title: string;
  category: (typeof CHECKLIST_ITEM_CATEGORIES)[number];
  /** A platform user responsible for this item (IT, HR, the manager …). */
  assigneeUserId: string | null;
  dueDate: string | null;
  status: (typeof CHECKLIST_ITEM_STATUSES)[number];
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
}

/**
 * A hire or exit checklist for one employee (blueprint §11 onboarding; the
 * same shape covers offboarding, which the blueprint does not detail beyond
 * the Hire-to-Retire flow). `account`, `access` and `equipment` items are
 * reminders for real action elsewhere (Settings → Users, the Assets
 * register) rather than automated side effects.
 */
export interface ChecklistDoc extends BaseDoc {
  employeeId: string;
  type: (typeof CHECKLIST_TYPES)[number];
  startedAt: string;
  targetDate: string | null;
  status: (typeof CHECKLIST_STATUSES)[number];
  items: ChecklistItem[];
  notes: string | null;
}

export interface ChecklistItemTemplate {
  title: string;
  category: ChecklistItem["category"];
  assigneeUserId?: string;
  dueDate?: string;
}

export const ONBOARDING_TEMPLATE: ChecklistItemTemplate[] = [
  { title: "Create user account", category: "account" },
  { title: "Provision system access and permissions", category: "access" },
  { title: "Assign equipment", category: "equipment" },
  { title: "Collect personal and emergency documents", category: "documents" },
  { title: "Department introduction", category: "introduction" },
  { title: "Policy briefing", category: "policy" },
  { title: "Orientation and training", category: "training" },
];

export const OFFBOARDING_TEMPLATE: ChecklistItemTemplate[] = [
  { title: "Knowledge transfer and handover", category: "other" },
  { title: "Exit interview", category: "other" },
  { title: "Revoke system access", category: "access" },
  { title: "Deactivate user account", category: "account" },
  { title: "Collect equipment", category: "equipment" },
  { title: "Final settlement and clearance", category: "documents" },
];
