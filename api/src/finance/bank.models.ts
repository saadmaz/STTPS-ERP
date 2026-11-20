export const BANK_COLLECTIONS = {
  lines: "bankStatementLines",
  reconciliations: "bankReconciliations",
} as const;

/** One line of an imported bank statement. */
export interface StatementLineDoc {
  id: string;
  tenantId: string;
  companyId: string;
  /** The bank or cash account (a postable GL account). */
  accountId: string;
  importId: string;
  date: string;
  description: string;
  reference: string | null;
  /** Signed minor units: money in is positive. */
  amount: number;
  status: "unmatched" | "matched";
  /** Ledger entries (glEntries ids) this line was matched to. */
  entryIds: string[];
  matchedBy: "auto" | "manual" | "created" | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReconciliationDoc {
  id: string;
  tenantId: string;
  companyId: string;
  accountId: string;
  statementDate: string;
  statementBalance: number;
  /** Matched (cleared) ledger movements up to the statement date. */
  clearedBalance: number;
  /** Ledger balance at the statement date. */
  bookBalance: number;
  /** Ledger lines not yet seen on a statement: deposits in transit and unpresented payments. */
  outstanding: { entryId: string; date: string; description: string | null; amount: number }[];
  createdAt: string;
  createdBy: string;
}
