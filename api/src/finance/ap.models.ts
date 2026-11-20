import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const AP_COLLECTIONS = {
  bills: "apBills",
  payments: "apPayments",
} as const;

export interface BillLine {
  lineId: string;
  productId: string | null;
  /** The purchase order line billed, for three-way matching. */
  orderLineId: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  taxCode: string | null;
  taxRate: number;
  net: number;
  tax: number;
  total: number;
  /** Expense (or asset) account for lines that did not go through stock. */
  accountId: string | null;
  /** Set from the order: true when the goods were received into stock (debited to goods-received-not-invoiced). */
  stocked: boolean;
  /** Order price per unit, for the price variance. */
  orderPrice: number | null;
}

export interface MatchResult {
  status: "matched" | "variance" | "not_applicable";
  issues: string[];
}

export interface BillDoc extends BaseDoc {
  number: string;
  kind: "bill" | "debit_note";
  supplierId: string;
  /** The supplier's own invoice number; unique per supplier. */
  supplierInvoiceNo: string;
  supplierInvoiceKey: string;
  orderId: string | null;
  receiptId: string | null;
  creditedBillId: string | null;
  date: string;
  dueDate: string;
  currency: string;
  rate: string;
  lines: BillLine[];
  totals: { subtotal: number; tax: number; total: number };
  baseTotal: number;
  match: MatchResult;
  /** Reason given when a bill that does not match was posted anyway. */
  overrideReason: string | null;
  amountPaid: number;
  balanceDue: number;
  status: "draft" | "posted" | "partially_paid" | "paid" | "cancelled";
  journalId: string | null;
  postedAt: string | null;
  applications: { documentId: string; amount: number; date: string }[];
  notes: string | null;
}

export interface PaymentDoc extends BaseDoc {
  number: string;
  supplierId: string;
  date: string;
  currency: string;
  rate: string;
  amount: number;
  bankAccountId: string;
  method: "bank_transfer" | "cash" | "cheque" | "card" | "other";
  reference: string | null;
  allocations: { billId: string; amount: number }[];
  unallocated: number;
  /** Payments made together in one payment run. */
  runId: string | null;
  status: "posted" | "reversed";
  journalId: string | null;
  notes: string | null;
}

export const AP_LISTS: Record<"bills" | "payments", LargeListSpec> = {
  bills: { filters: ["status", "supplierId", "kind"], sorts: [{ field: "date", direction: "desc" }, { field: "dueDate", direction: "asc" }] },
  payments: { filters: ["supplierId", "runId"], sorts: [{ field: "date", direction: "desc" }] },
};
