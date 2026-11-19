import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const LEAVE_COLLECTIONS = {
  policies: "hrLeavePolicies",
  holidays: "hrHolidays",
  balances: "hrLeaveBalances",
  requests: "hrLeaveRequests",
} as const;

export const LEAVE_TYPES = ["annual", "sick", "casual", "unpaid", "maternity", "paternity", "special", "custom"] as const;
export const ACCRUAL_FREQUENCIES = ["annual", "monthly"] as const;
export const LEAVE_REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

/** A leave type's rules (blueprint §11 leave policies). Whole days only; half-day leave is not modelled yet. */
export interface LeavePolicyDoc extends BaseDoc {
  code: string;
  name: string;
  type: (typeof LEAVE_TYPES)[number];
  /** Only "annual" (the full entitlement granted by `rollover`) is automated; "monthly" needs a manual balance adjustment for now. */
  accrualFrequency: (typeof ACCRUAL_FREQUENCIES)[number];
  annualEntitlementDays: number;
  carryForwardMaxDays: number;
  isPaid: boolean;
  requiresApproval: boolean;
  noticeDays: number;
  color: string | null;
  notes: string | null;
}

export interface HolidayDoc extends BaseDoc {
  date: string;
  name: string;
  isOptional: boolean;
  notes: string | null;
}

/**
 * One employee's running balance for one policy — current state, not a
 * transaction log (like a stock balance), so it doesn't grow over time.
 * Document id is `${employeeId}_${policyId}`; `rollover` resets it yearly.
 */
export interface LeaveBalanceDoc {
  companyId: string;
  tenantId: string;
  employeeId: string;
  policyId: string;
  year: number;
  entitlementDays: number;
  carriedForwardDays: number;
  usedDays: number;
  remainingDays: number;
  updatedAt: string;
}

export interface LeaveRequestDoc extends BaseDoc {
  employeeId: string;
  policyId: string;
  startDate: string;
  endDate: string;
  /** Business days in the range, excluding weekends and holidays. */
  days: number;
  reason: string | null;
  status: (typeof LEAVE_REQUEST_STATUSES)[number];
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export const LEAVE_LISTS: Record<"requests", LargeListSpec> = {
  requests: { filters: ["employeeId"], sorts: [{ field: "startDate", direction: "desc" }] },
};
