import type { BaseDoc } from "../platform/data/repository.js";

export const MARKETING_COLLECTIONS = {
  campaigns: "marketingCampaigns",
  segments: "marketingSegments",
  sequences: "marketingSequences",
  enrollments: "marketingEnrollments",
} as const;

export const CAMPAIGN_TYPES = ["email", "social", "paid_ads", "sms", "whatsapp", "event", "referral", "influencer", "content", "other"] as const;
export const CAMPAIGN_STATUSES = ["draft", "active", "completed", "cancelled"] as const;
export const SEGMENT_ENTITY_TYPES = ["crm.account", "crm.lead", "crm.contact"] as const;
export const SEQUENCE_TRIGGERS = ["welcome", "abandoned_enquiry", "lead_nurture", "follow_up", "anniversary", "renewal", "re_engagement", "upsell_cross_sell", "feedback"] as const;
export const ENROLLMENT_STATUSES = ["active", "completed", "cancelled"] as const;

export interface CampaignDoc extends BaseDoc {
  code: string;
  name: string;
  type: (typeof CAMPAIGN_TYPES)[number];
  ownerUserId: string | null;
  /** Minor units. */
  budget: number;
  startDate: string;
  endDate: string | null;
  goals: string | null;
  channels: string[];
  status: (typeof CAMPAIGN_STATUSES)[number];
  notes: string | null;
}

/** A saved filter over one CRM collection, reusing the same `field:value,...` string every list endpoint already accepts — not a new filter language. */
export interface SegmentDoc extends BaseDoc {
  name: string;
  description: string | null;
  entityType: (typeof SEGMENT_ENTITY_TYPES)[number];
  filter: string | null;
}

export interface SequenceStep {
  stepId: string;
  seq: number;
  delayDays: number;
  subject: string;
  body: string;
}

/**
 * A sequence **definition** and enrollment tracker only — it does not send
 * anything. No outbound marketing-email-sequencing engine exists anywhere in
 * this codebase (Resend is wired for transactional notification email only);
 * building one was out of scope here. See `CLAUDE.md` §9's Marketing note.
 */
export interface SequenceDoc extends BaseDoc {
  name: string;
  trigger: (typeof SEQUENCE_TRIGGERS)[number];
  steps: SequenceStep[];
  isActive: boolean;
}

export interface SequenceEnrollmentDoc extends BaseDoc {
  sequenceId: string;
  leadId: string | null;
  accountId: string | null;
  /** -1 before the first step; otherwise the index into the sequence's `steps` just completed. */
  currentStep: number;
  enrolledAt: string;
  nextStepDueAt: string | null;
  status: (typeof ENROLLMENT_STATUSES)[number];
}
