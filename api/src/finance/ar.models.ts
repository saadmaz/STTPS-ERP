import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const AR_COLLECTIONS = {
  invoices: "arInvoices",
  receipts: "arReceipts",
} as const;

export interface InvoiceLine {
  lineId: string;
  productId: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  /** Hundredths of a percent. */
  discountPct: number;
  taxCode: string | null;
  taxRate: number;
  net: number;
  tax: number;
  total: number;
  /** Income account for this line; the revenue (or sales returns) posting rule when null. */
  accountId: string | null;
}

export interface InvoiceDoc extends BaseDoc {
  number: string;
  kind: "invoice" | "credit_note";
  /** `deposit` posts to customer deposits (a liability) instead of revenue; `milestone` and `recurring` are plain revenue invoices, tagged for reporting. */
  invoiceType: "standard" | "deposit" | "milestone" | "recurring";
  customerId: string;
  orderId: string | null;
  deliveryId: string | null;
  returnId: string | null;
  /** For a deposit or milestone invoice: the order's billing schedule entry it was raised from. */
  scheduleEntryId: string | null;
  /** For a recurring invoice: the schedule that generated it. */
  recurringScheduleId: string | null;
  /** For a deposit invoice once used up: the invoice it was applied to. */
  appliedToInvoiceId: string | null;
  /** For a credit note: the invoice being credited, if any. */
  creditedInvoiceId: string | null;
  customerReference: string | null;
  date: string;
  dueDate: string;
  currency: string;
  /** Base-currency units per one unit of `currency` on the invoice date (decimal string). */
  rate: string;
  lines: InvoiceLine[];
  totals: { subtotal: number; discount: number; tax: number; total: number };
  /** Total in the base currency at `rate`. */
  baseTotal: number;
  /** Settled so far (receipts, credit notes applied, write-off), in `currency`. */
  amountPaid: number;
  balanceDue: number;
  status: "draft" | "posted" | "partially_paid" | "paid" | "written_off" | "cancelled";
  journalId: string | null;
  postedAt: string | null;
  /** Credit applied from credit notes (or, on a credit note, to invoices). */
  applications: { documentId: string; amount: number; date: string }[];
  /** Dunning level reached so far (0 = no reminder sent); see the dunning policy in ar-extras.ts. */
  dunningLevel: number;
  lastReminderAt: string | null;
  notes: string | null;
}

export interface ReceiptDoc extends BaseDoc {
  number: string;
  customerId: string;
  date: string;
  currency: string;
  rate: string;
  amount: number;
  bankAccountId: string;
  method: "bank_transfer" | "cash" | "cheque" | "card" | "other";
  reference: string | null;
  allocations: { invoiceId: string; amount: number }[];
  unallocated: number;
  status: "posted" | "reversed";
  journalId: string | null;
  notes: string | null;
}

export const AR_LISTS: Record<"invoices" | "receipts", LargeListSpec> = {
  invoices: { filters: ["status", "customerId", "kind", "invoiceType"], sorts: [{ field: "date", direction: "desc" }, { field: "createdAt", direction: "desc" }] },
  receipts: { filters: ["customerId", "status"], sorts: [{ field: "date", direction: "desc" }] },
};
