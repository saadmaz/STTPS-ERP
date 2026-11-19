import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";
import type { SalesLine, Totals } from "../sales/sales.models.js";

export const POS_COLLECTIONS = {
  terminals: "posTerminals",
  shifts: "posCashierShifts",
  sales: "posSales",
  loyalty: "posLoyaltyAccounts",
} as const;

export const SHIFT_STATUSES = ["open", "closed"] as const;
export const SALE_STATUSES = ["completed", "partially_refunded", "refunded", "voided"] as const;
export const PAYMENT_METHODS = ["cash", "card", "qr"] as const;

export interface TerminalDoc extends BaseDoc {
  code: string;
  name: string;
  warehouseId: string;
  branchId: string | null;
  isActive: boolean;
}

export interface CashierShiftDoc extends BaseDoc {
  terminalId: string;
  cashierId: string;
  status: (typeof SHIFT_STATUSES)[number];
  openedAt: string;
  openingCash: number;
  closedAt: string | null;
  closingCash: number | null;
  expectedCash: number | null;
  variance: number | null;
  notes: string | null;
}

export interface PosPayment {
  method: (typeof PAYMENT_METHODS)[number];
  amount: number;
}

/**
 * One register transaction. Pricing deliberately bypasses Sales' price-list
 * and discount-rule engine (`LinePricer`/`PricingService`) — a line's price
 * defaults from `Product.salesPrice` with an optional per-line manual
 * discount, the way a real register works, not a resolved price list. See
 * `CLAUDE.md` §9's POS note for this and the other documented scope cuts
 * (no price-list integration, no exchange entity, no invoice bridge, no
 * offline queue, whole-sale-only refunds).
 */
export interface PosSaleDoc extends BaseDoc {
  number: string;
  shiftId: string;
  terminalId: string;
  warehouseId: string;
  accountId: string | null;
  currency: string;
  lines: SalesLine[];
  totals: Totals;
  payments: PosPayment[];
  status: (typeof SALE_STATUSES)[number];
  loyaltyPointsEarned: number;
  loyaltyPointsRedeemed: number;
  notes: string | null;
}

/** Current points balance for one CRM account. Deterministic id (`= accountId`), not a `MasterDataService` — the same shape as `LeaveBalanceDoc`. */
export interface LoyaltyAccountDoc {
  id: string;
  tenantId: string;
  companyId: string;
  accountId: string;
  pointsBalance: number;
  updatedAt: string;
}

export const POS_LISTS: Record<"sales", LargeListSpec> = {
  sales: { filters: [], sorts: [{ field: "createdAt", direction: "desc" }] },
};
