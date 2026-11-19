import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const SALES_COLLECTIONS = {
  quotes: "salesQuotes",
  orders: "salesOrders",
  deliveries: "salesDeliveries",
  returns: "salesReturns",
  settings: "salesSettings",
  quoteTokens: "salesQuoteTokens",
} as const;

export interface SalesLine {
  lineId: string;
  productId: string;
  description: string;
  /** Thousandths of the product's base unit. */
  qty: number;
  /** Minor units per base unit, before the line discount. */
  unitPrice: number;
  /** Hundredths of a percent (12.5% = 1250). */
  discountPct: number;
  taxCode: string | null;
  /** Hundredths of a percent. */
  taxRate: number;
  /** Minor units after discount, before tax. */
  net: number;
  tax: number;
  total: number;
}

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export interface QuoteDoc extends BaseDoc {
  number: string;
  revision: number;
  previousRevisionId: string | null;
  accountId: string;
  contactId: string | null;
  opportunityId: string | null;
  currency: string;
  date: string;
  validUntil: string;
  lines: SalesLine[];
  totals: Totals;
  terms: string | null;
  notes: string | null;
  status: "draft" | "pending_approval" | "approved" | "sent" | "accepted" | "rejected" | "expired" | "superseded" | "converted";
  sentAt: string | null;
  respondedAt: string | null;
  customerComment: string | null;
  orderId: string | null;
  ownerUserId: string | null;
}

export interface OrderLine extends SalesLine {
  /** Stocked products are reserved and issued; services and non-stock items are not. */
  stocked: boolean;
  warehouseId: string;
  reserved: number;
  delivered: number;
  returned: number;
}

/** A deposit or milestone invoice to raise ahead of (or instead of) invoicing from delivery. */
export interface BillingScheduleEntry {
  entryId: string;
  label: string;
  kind: "deposit" | "milestone";
  /** A percentage of the order's net (pre-tax) total, or a fixed amount in the order currency. */
  basis: "percent" | "amount";
  /** Hundredths of a percent for `basis: "percent"`; minor units for `basis: "amount"`. */
  value: number;
  taxCode: string | null;
  dueDate: string | null;
  status: "pending" | "invoiced" | "cancelled";
  invoiceId: string | null;
}

export interface OrderDoc extends BaseDoc {
  number: string;
  accountId: string;
  contactId: string | null;
  quoteId: string | null;
  customerReference: string | null;
  currency: string;
  date: string;
  requestedDate: string | null;
  warehouseId: string;
  billingAddress: Record<string, unknown> | null;
  shippingAddress: Record<string, unknown> | null;
  paymentTermsDays: number;
  lines: OrderLine[];
  totals: Totals;
  status: "draft" | "pending_approval" | "confirmed" | "partially_delivered" | "delivered" | "cancelled" | "closed";
  /** Why approval was needed (credit limit, discount). */
  holdReasons: string[];
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  ownerUserId: string | null;
  notes: string | null;
  /** Deposit and milestone invoices to raise against this order, ahead of delivery. */
  billingSchedule: BillingScheduleEntry[];
}

export interface DeliveryLine {
  orderLineId: string;
  productId: string;
  qty: number;
  lotNo: string | null;
  serialNos: string[];
  /** Cost recorded when the stock left, for returns. */
  unitCost: number | null;
}

export interface DeliveryDoc extends BaseDoc {
  number: string;
  orderId: string;
  accountId: string;
  warehouseId: string;
  lines: DeliveryLine[];
  status: "draft" | "picked" | "packed" | "dispatched" | "delivered" | "failed" | "cancelled";
  carrier: string | null;
  trackingNo: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  receivedBy: string | null;
  exception: string | null;
  shippingAddress: Record<string, unknown> | null;
}

export interface ReturnLine {
  deliveryLineIndex: number;
  productId: string;
  qty: number;
  lotNo: string | null;
  serialNos: string[];
  condition: "resellable" | "damaged";
}

export interface ReturnDoc extends BaseDoc {
  number: string;
  deliveryId: string;
  orderId: string;
  accountId: string;
  warehouseId: string;
  reason: string;
  lines: ReturnLine[];
  status: "requested" | "approved" | "received" | "rejected" | "cancelled";
  receivedAt: string | null;
}

export interface TaxRate {
  code: string;
  name: string;
  /** Hundredths of a percent; the current rate, and the fallback when `effectiveRates` is empty or has nothing on or before the date asked for. */
  rate: number;
  /** Scheduled rate changes, so a change takes effect on its date without a deploy. Resolve with `taxRateOn`. */
  effectiveRates?: { rate: number; effectiveDate: string }[];
}

export interface SalesSettingsDoc {
  companyId: string;
  taxRates: TaxRate[];
  defaultTaxCode: string | null;
  quoteValidityDays: number;
  /** Discounts above this (hundredths of a percent) need approval. */
  discountApprovalPct: number;
  /** Quote and order prices typed in are tax-inclusive; the exclusive net price is what gets stored. */
  pricesIncludeTax: boolean;
  defaultTerms: string | null;
  defaultWarehouseId: string | null;
  updatedAt: string;
}

export const SALES_LISTS: Record<"quotes" | "orders" | "deliveries" | "returns", LargeListSpec> = {
  quotes: { filters: ["status", "accountId", "ownerUserId"], sorts: [{ field: "createdAt", direction: "desc" }] },
  orders: { filters: ["status", "accountId", "ownerUserId"], sorts: [{ field: "createdAt", direction: "desc" }] },
  deliveries: { filters: ["status", "orderId", "accountId"], sorts: [{ field: "createdAt", direction: "desc" }] },
  returns: { filters: ["status", "orderId", "accountId"], sorts: [{ field: "createdAt", direction: "desc" }] },
};
