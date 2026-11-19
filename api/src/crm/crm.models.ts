import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const CRM_COLLECTIONS = {
  accounts: "crmAccounts",
  contacts: "crmContacts",
  leads: "crmLeads",
  opportunities: "crmOpportunities",
  activities: "crmActivities",
  settings: "crmSettings",
} as const;

export interface Address {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export const ACCOUNT_TYPES = ["prospect", "customer", "partner", "other"] as const;
export const ACCOUNT_STATUSES = ["active", "inactive", "blocked"] as const;

/** A customer or prospect organisation (blueprint §5 customer management). */
export interface AccountDoc extends BaseDoc {
  code: string;
  name: string;
  nameLower: string;
  type: (typeof ACCOUNT_TYPES)[number];
  status: (typeof ACCOUNT_STATUSES)[number];
  segment: string | null;
  industry: string | null;
  parentId: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: Address | null;
  shippingAddress: Address | null;
  currency: string;
  paymentTermsDays: number;
  /** Credit limit in minor units of `currency`; null for no limit. */
  creditLimit: number | null;
  taxId: string | null;
  ownerUserId: string | null;
  portalAccess: boolean;
  notes: string | null;
}

export interface ContactDoc extends BaseDoc {
  firstName: string;
  lastName: string;
  accountId: string | null;
  title: string | null;
  /** Role at the account: decision maker, billing, technical … */
  role: string | null;
  email: string | null;
  emailLower: string | null;
  phone: string | null;
  phoneDigits: string | null;
  preferredChannel: "email" | "phone" | "whatsapp" | "sms" | null;
  doNotContact: boolean;
  address: Address | null;
  ownerUserId: string | null;
  notes: string | null;
}

export const LEAD_STATUSES = ["new", "contacted", "qualified", "unqualified", "converted"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadDoc extends BaseDoc {
  firstName: string;
  lastName: string;
  company: string | null;
  title: string | null;
  email: string | null;
  emailLower: string | null;
  phone: string | null;
  phoneDigits: string | null;
  website: string | null;
  source: string | null;
  campaign: string | null;
  status: LeadStatus;
  score: number;
  ownerUserId: string | null;
  notes: string | null;
  convertedAt: string | null;
  convertedAccountId: string | null;
  convertedContactId: string | null;
  convertedOpportunityId: string | null;
}

export const OPPORTUNITY_STAGES = ["prospecting", "qualification", "proposal", "negotiation", "won", "lost"] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  prospecting: 10,
  qualification: 25,
  proposal: 50,
  negotiation: 75,
  won: 100,
  lost: 0,
};
export const FORECAST_CATEGORIES = ["pipeline", "best_case", "commit", "closed", "omitted"] as const;

export interface StageChange {
  stage: OpportunityStage;
  at: string;
  by: string | null;
}

export interface OpportunityDoc extends BaseDoc {
  name: string;
  accountId: string | null;
  contactId: string | null;
  stage: OpportunityStage;
  probability: number;
  /** Minor units of `currency`. */
  amount: number;
  currency: string;
  expectedCloseDate: string | null;
  forecastCategory: (typeof FORECAST_CATEGORIES)[number];
  ownerUserId: string | null;
  source: string | null;
  competitors: string[];
  nextAction: string | null;
  nextActionDate: string | null;
  winLossReason: string | null;
  closedAt: string | null;
  leadId: string | null;
  stageHistory: StageChange[];
  notes: string | null;
}

export const ACTIVITY_TYPES = ["call", "email", "meeting", "visit", "note", "task", "follow_up"] as const;
export const ACTIVITY_STATUSES = ["planned", "done", "cancelled"] as const;

export interface ActivityDoc extends BaseDoc {
  type: (typeof ACTIVITY_TYPES)[number];
  subject: string;
  description: string | null;
  status: (typeof ACTIVITY_STATUSES)[number];
  dueAt: string | null;
  completedAt: string | null;
  ownerUserId: string | null;
  /** The record it is about, e.g. "crm.lead". */
  relatedType: string | null;
  relatedId: string | null;
  /** `${relatedType}:${relatedId}` for one-field filtering. */
  relatedKey: string | null;
  /** Denormalised so an account's timeline includes activities on its contacts and opportunities. */
  accountId: string | null;
  outcome: string | null;
}

export interface ScoringRule {
  /** Lead field to test. */
  field: string;
  /** "present", "equals" or "contains" (case-insensitive). */
  test: "present" | "equals" | "contains";
  value?: string;
  points: number;
}

export interface CrmSettingsDoc {
  companyId: string;
  scoringRules: ScoringRule[];
  /** "owner" keeps the creator (or given owner); "roundRobin" rotates new leads through `assignees`. */
  assignment: { mode: "owner" | "roundRobin"; assignees: string[]; next: number };
  leadSources: string[];
  lossReasons: string[];
  updatedAt: string;
}

export const DEFAULT_SCORING: ScoringRule[] = [
  { field: "email", test: "present", points: 10 },
  { field: "phone", test: "present", points: 10 },
  { field: "company", test: "present", points: 10 },
  { field: "website", test: "present", points: 5 },
  { field: "title", test: "contains", value: "director", points: 15 },
  { field: "title", test: "contains", value: "manager", points: 10 },
  { field: "title", test: "contains", value: "owner", points: 15 },
  { field: "source", test: "equals", value: "referral", points: 20 },
];

export const DEFAULT_SOURCES = ["website", "referral", "email", "phone", "event", "campaign", "import", "walk_in", "other"];
export const DEFAULT_LOSS_REASONS = ["price", "competitor", "no_budget", "no_decision", "timing", "product_fit", "other"];

// Indexed list shapes; each combination is one composite index (see platform/data/indexes.ts).
export const CRM_LISTS: Record<"accounts" | "contacts" | "leads" | "opportunities" | "activities", LargeListSpec> = {
  accounts: { filters: ["status", "type", "ownerUserId"], sorts: [{ field: "nameLower", direction: "asc" }, { field: "createdAt", direction: "desc" }] },
  contacts: { filters: ["accountId", "ownerUserId"], sorts: [{ field: "lastName", direction: "asc" }, { field: "createdAt", direction: "desc" }] },
  leads: { filters: ["status", "ownerUserId", "source"], sorts: [{ field: "createdAt", direction: "desc" }, { field: "score", direction: "desc" }] },
  opportunities: {
    filters: ["stage", "ownerUserId", "accountId"],
    sorts: [{ field: "createdAt", direction: "desc" }, { field: "expectedCloseDate", direction: "asc" }, { field: "amount", direction: "desc" }],
  },
  activities: { filters: ["ownerUserId", "status", "relatedKey", "accountId"], sorts: [{ field: "dueAt", direction: "asc" }, { field: "createdAt", direction: "desc" }] },
};

export function digits(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 6 ? d.slice(-9) : null;
}
