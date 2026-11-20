import type { BaseDoc } from "../platform/data/repository.js";

export const SELF_SERVICE_COLLECTIONS = {
  announcements: "hrAnnouncements",
  requests: "hrRequests",
  equipmentRequests: "hrEquipmentRequests",
} as const;

export const HR_REQUEST_TYPES = ["document", "address_change", "general_query", "other"] as const;
export const HR_REQUEST_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export const EQUIPMENT_REQUEST_STATUSES = ["pending", "approved", "rejected", "fulfilled"] as const;

/** A company-wide post (blueprint §11 employee self-service: announcements). Not targeted to a branch or department yet. */
export interface AnnouncementDoc extends BaseDoc {
  title: string;
  body: string;
  isPublished: boolean;
  expiresAt: string | null;
}

/** A general request to HR — a document, an address change, a question. */
export interface HrRequestDoc extends BaseDoc {
  employeeId: string;
  type: (typeof HR_REQUEST_TYPES)[number];
  subject: string;
  description: string | null;
  status: (typeof HR_REQUEST_STATUSES)[number];
  resolution: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/**
 * A request for equipment. Bookkeeping and approval only: there is no
 * asset register to allocate from yet (Phase 4's Asset management item, not
 * built), so "fulfilled" is recorded by hand once the equipment is actually
 * handed over.
 */
export interface EquipmentRequestDoc extends BaseDoc {
  employeeId: string;
  itemDescription: string;
  reason: string | null;
  status: (typeof EQUIPMENT_REQUEST_STATUSES)[number];
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}
