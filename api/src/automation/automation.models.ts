import type { BaseDoc } from "../platform/data/repository.js";

export const AUTOMATION_COLLECTIONS = {
  rules: "automationRules",
} as const;

/**
 * The event types an automation rule can react to: every domain event
 * already published somewhere in this codebase (see EventBusService
 * callers). A new published event type is invisible to the engine until it
 * is added here too — there is no dynamic discovery.
 */
export const AUTOMATION_EVENT_TYPES = [
  "LowStock",
  "StockMoved",
  "GoodsReceived",
  "GoodsDispatched",
  "PurchaseOrderApproved",
  "SupplierReturnShipped",
  "SalesOrderConfirmed",
  "SalesDelivered",
  "SalesReturnReceived",
  "QuoteAccepted",
  "InvoicePosted",
  "CreditNotePosted",
  "DebitNotePosted",
  "PaymentReceived",
  "SupplierPaymentMade",
  "ExpenseClaimApproved",
  "LeadConverted",
  "OpportunityWon",
  "OpportunityLost",
] as const;

export const AUTOMATION_CONDITION_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains"] as const;

export const AUTOMATION_ACTION_TYPES = ["notify", "create_task", "create_requisition"] as const;

export interface AutomationCondition {
  /** Dot path into the event context, e.g. "payload.available" or "entityId". */
  field: string;
  operator: (typeof AUTOMATION_CONDITION_OPERATORS)[number];
  value: string;
}

export interface AutomationAction {
  type: (typeof AUTOMATION_ACTION_TYPES)[number];
  /**
   * Per-action settings. Values may use `{{path}}` to pull from the event
   * context (e.g. "{{payload.productId}}"), or `{{qty:path}}` to read a
   * thousandths-scaled quantity and render it as a decimal string. A plain
   * literal with no `{{...}}` is used as-is.
   */
  config: Record<string, string>;
}

export interface AutomationRunLogEntry {
  at: string;
  eventId: string | null;
  matched: boolean;
  actions: { type: string; ok: boolean; error?: string }[];
}

export interface AutomationRuleDoc extends BaseDoc {
  name: string;
  description: string | null;
  active: boolean;
  eventType: (typeof AUTOMATION_EVENT_TYPES)[number];
  /** All conditions must match (AND only — no OR/grouping). Empty means always match. */
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  /** Newest first, capped at 20 — enough to see recent firings without a dedicated collection. */
  recentRuns: AutomationRunLogEntry[];
}
