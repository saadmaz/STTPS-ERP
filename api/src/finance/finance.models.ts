import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const FINANCE_COLLECTIONS = {
  accounts: "glAccounts",
  settings: "financeSettings",
  journals: "glJournals",
  entries: "glEntries",
  balances: "glBalances",
  issues: "financePostingIssues",
} as const;

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Debit-normal types; the others are credit-normal. */
export const DEBIT_NORMAL: ReadonlySet<AccountType> = new Set(["asset", "expense"]);

export interface AccountDoc extends BaseDoc {
  code: string;
  name: string;
  type: AccountType;
  /** What the account is for (bank, receivable, inventory …); used by posting rules and reports. */
  subtype: string | null;
  parentId: string | null;
  /** Group (header) accounts organise the chart and cannot be posted to. */
  isGroup: boolean;
  /** Control accounts (receivables, payables, inventory) only take postings from their sub-ledgers. */
  isControl: boolean;
  /** Restrict to one currency (bank accounts), or null for any. */
  currency: string | null;
  status: "active" | "inactive";
  description: string | null;
}

/** The accounts each kind of automatic posting uses. */
export const POSTING_ROLES = [
  "receivable",
  "payable",
  "grni",
  "inventory",
  "wip",
  "cogs",
  "inventoryAdjustment",
  "priceVariance",
  "revenue",
  "salesReturns",
  "taxOutput",
  "taxInput",
  "retainedEarnings",
  "fx",
  "rounding",
  "bank",
  "cash",
  "depreciation",
  "accumulatedDepreciation",
] as const;
export type PostingRole = (typeof POSTING_ROLES)[number];

export interface FinanceSettingsDoc {
  companyId: string;
  tenantId: string;
  baseCurrency: string;
  accounts: Partial<Record<PostingRole, string>>;
  updatedAt: string;
  updatedBy: string | null;
}

export interface JournalLine {
  lineId: string;
  accountId: string;
  /** Base-currency minor units; exactly one of debit/credit is non-zero. */
  debit: number;
  credit: number;
  description: string | null;
  partyType: "customer" | "supplier" | "employee" | null;
  partyId: string | null;
  branchId: string | null;
  departmentId: string | null;
  costCentreId: string | null;
  projectId: string | null;
  /** Original transaction currency and amount, when not the base currency. */
  currency: string | null;
  foreignAmount: number | null;
}

export interface RecordRef {
  entityType: string;
  entityId: string;
  label?: string | null;
}

export interface JournalDoc extends BaseDoc {
  number: string;
  date: string;
  /** YYYY-MM of `date`; balances are kept per month. */
  period: string;
  source: "manual" | "system" | "reversal";
  /** For system journals: the event that produced it. */
  sourceEvent: { type: string; id: string } | null;
  reference: RecordRef | null;
  memo: string | null;
  currency: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  status: "draft" | "pending_approval" | "posted" | "reversed" | "cancelled";
  postedAt: string | null;
  reversalOfId: string | null;
  reversedById: string | null;
}

/** One posted journal line, for account drill-down and party statements. */
export interface EntryDoc {
  id: string;
  tenantId: string;
  companyId: string;
  journalId: string;
  journalNumber: string;
  date: string;
  period: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string | null;
  partyType: string | null;
  partyId: string | null;
  branchId: string | null;
  departmentId: string | null;
  costCentreId: string | null;
  projectId: string | null;
  reference: RecordRef | null;
  createdAt: string;
}

/** Running totals per account and month. */
export interface BalanceDoc {
  id: string;
  companyId: string;
  accountId: string;
  period: string;
  debit: number;
  credit: number;
  updatedAt: string;
}

/** An automatic posting that could not be made (closed period, missing account mapping …). */
export interface PostingIssueDoc {
  id: string;
  tenantId: string;
  companyId: string;
  eventId: string;
  eventType: string;
  entity: string;
  entityId: string;
  error: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
}

export const FINANCE_LISTS: Record<"journals", LargeListSpec> = {
  journals: { filters: ["status", "source"], sorts: [{ field: "date", direction: "desc" }, { field: "createdAt", direction: "desc" }] },
};

/** A standard chart for a trading company (codes, names and posting roles). */
export const STANDARD_CHART: { code: string; name: string; type: AccountType; parent?: string; group?: boolean; subtype?: string; control?: boolean; role?: PostingRole }[] = [
  { code: "1000", name: "Assets", type: "asset", group: true },
  { code: "1100", name: "Cash and bank", type: "asset", parent: "1000", group: true },
  { code: "1110", name: "Cash on hand", type: "asset", parent: "1100", subtype: "cash", role: "cash" },
  { code: "1120", name: "Main bank account", type: "asset", parent: "1100", subtype: "bank", role: "bank" },
  { code: "1200", name: "Accounts receivable", type: "asset", parent: "1000", subtype: "receivable", control: true, role: "receivable" },
  { code: "1300", name: "Inventory", type: "asset", parent: "1000", subtype: "inventory", control: true, role: "inventory" },
  { code: "1350", name: "Work in progress", type: "asset", parent: "1000", subtype: "wip", control: true, role: "wip" },
  { code: "1400", name: "Input VAT", type: "asset", parent: "1000", subtype: "tax_input", role: "taxInput" },
  { code: "1500", name: "Prepayments", type: "asset", parent: "1000" },
  { code: "1600", name: "Fixed assets", type: "asset", parent: "1000", group: true },
  { code: "1610", name: "Plant and equipment", type: "asset", parent: "1600", subtype: "fixed_asset" },
  { code: "1690", name: "Accumulated depreciation", type: "asset", parent: "1600", subtype: "accumulated_depreciation", role: "accumulatedDepreciation" },
  { code: "2000", name: "Liabilities", type: "liability", group: true },
  { code: "2100", name: "Accounts payable", type: "liability", parent: "2000", subtype: "payable", control: true, role: "payable" },
  { code: "2150", name: "Goods received not invoiced", type: "liability", parent: "2000", subtype: "grni", control: true, role: "grni" },
  { code: "2200", name: "Output VAT", type: "liability", parent: "2000", subtype: "tax_output", role: "taxOutput" },
  { code: "2300", name: "Accrued expenses", type: "liability", parent: "2000" },
  { code: "2400", name: "Payroll liabilities", type: "liability", parent: "2000", subtype: "payroll" },
  { code: "3000", name: "Equity", type: "equity", group: true },
  { code: "3100", name: "Share capital", type: "equity", parent: "3000" },
  { code: "3200", name: "Retained earnings", type: "equity", parent: "3000", subtype: "retained_earnings", role: "retainedEarnings" },
  { code: "4000", name: "Income", type: "income", group: true },
  { code: "4100", name: "Sales revenue", type: "income", parent: "4000", subtype: "revenue", role: "revenue" },
  { code: "4200", name: "Sales returns and allowances", type: "income", parent: "4000", subtype: "sales_returns", role: "salesReturns" },
  { code: "4300", name: "Other income", type: "income", parent: "4000" },
  { code: "5000", name: "Cost of sales", type: "expense", group: true },
  { code: "5100", name: "Cost of goods sold", type: "expense", parent: "5000", subtype: "cogs", role: "cogs" },
  { code: "5200", name: "Inventory adjustments", type: "expense", parent: "5000", subtype: "inventory_adjustment", role: "inventoryAdjustment" },
  { code: "5300", name: "Purchase price variance", type: "expense", parent: "5000", subtype: "price_variance", role: "priceVariance" },
  { code: "6000", name: "Operating expenses", type: "expense", group: true },
  { code: "6100", name: "Salaries and wages", type: "expense", parent: "6000", subtype: "payroll" },
  { code: "6200", name: "Rent", type: "expense", parent: "6000" },
  { code: "6300", name: "Utilities", type: "expense", parent: "6000" },
  { code: "6400", name: "Depreciation", type: "expense", parent: "6000", subtype: "depreciation", role: "depreciation" },
  { code: "6500", name: "Bank charges", type: "expense", parent: "6000" },
  { code: "6900", name: "Rounding differences", type: "expense", parent: "6000", role: "rounding" },
  { code: "7000", name: "Other gains and losses", type: "expense", group: true },
  { code: "7100", name: "Exchange gains and losses", type: "expense", parent: "7000", subtype: "fx", role: "fx" },
];
