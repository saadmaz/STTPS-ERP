import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const SUPPORT_COLLECTIONS = {
  slaPolicies: "supportSlaPolicies",
  tickets: "supportTickets",
  portalUsers: "supportPortalUsers",
  portalSetupTokens: "supportPortalSetupTokens",
} as const;

export const TICKET_CHANNELS = ["portal", "email", "phone", "website", "whatsapp", "internal", "sales", "automated"] as const;
export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
/** Blueprint §14's own status flow. */
export const TICKET_STATUSES = ["new", "open", "assigned", "in_progress", "waiting_customer", "resolved", "closed"] as const;

export interface SlaTarget {
  priority: (typeof TICKET_PRIORITIES)[number];
  responseMinutes: number;
  resolutionMinutes: number;
}

/** Calendar-time targets, not business-hours-aware — see the plan's note on this item. */
export interface SlaPolicyDoc extends BaseDoc {
  name: string;
  tier: string;
  targets: SlaTarget[];
  isDefault: boolean;
}

export interface TicketReply {
  authorType: "staff" | "customer";
  authorId: string;
  body: string;
  at: string;
}

/**
 * A support ticket (blueprint §14). `replies` are customer-visible; staff-only
 * internal notes use the generic per-record comments instead (free, since
 * this is a normal `MasterDataService` record type) — so the two never mix.
 */
export interface TicketDoc extends BaseDoc {
  number: string;
  customerId: string | null;
  contactId: string | null;
  channel: (typeof TICKET_CHANNELS)[number];
  subject: string;
  description: string | null;
  category: string | null;
  priority: (typeof TICKET_PRIORITIES)[number];
  status: (typeof TICKET_STATUSES)[number];
  assignedTo: string | null;
  slaPolicyId: string | null;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  productId: string | null;
  orderId: string | null;
  invoiceId: string | null;
  projectId: string | null;
  mergedIntoId: string | null;
  reopenedCount: number;
  satisfactionRating: number | null;
  satisfactionComment: string | null;
  replies: TicketReply[];
}

/** A customer's own login — a separate identity from staff `UserDoc`, scoped to one `customerId`. */
export interface PortalUserDoc extends BaseDoc {
  email: string;
  emailLower: string;
  customerId: string;
  contactId: string | null;
  passwordHash: string | null;
  isActive: boolean;
}

export const SUPPORT_LISTS: Record<"tickets", LargeListSpec> = {
  tickets: { filters: ["customerId"], sorts: [{ field: "createdAt", direction: "desc" }] },
};
