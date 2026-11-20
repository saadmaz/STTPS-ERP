import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const PAYROLL_COLLECTIONS = {
  statutoryRates: "hrStatutoryRates",
  apitBrackets: "hrApitBrackets",
  components: "hrSalaryComponents",
  structures: "hrSalaryStructures",
  loans: "hrLoans",
  runs: "hrPayrollRuns",
  payslips: "hrPayslips",
} as const;

/** Sri Lanka's three statutory contributions (blueprint §12 and §9's domain notes). Rates are effective-dated, never hard-coded. */
export const STATUTORY_CODES = ["epf_employee", "epf_employer", "etf_employer"] as const;
export const COMPONENT_TYPES = ["earning", "deduction"] as const;
export const COMPONENT_CATEGORIES = ["basic", "allowance", "bonus", "commission", "incentive", "other_earning", "other_deduction"] as const;
export const CALCULATION_TYPES = ["fixed", "percentage_of_basic"] as const;
export const LOAN_TYPES = ["loan", "advance"] as const;
export const LOAN_STATUSES = ["active", "completed", "cancelled"] as const;
export const RUN_STATUSES = ["draft", "calculated", "approved", "locked", "cancelled"] as const;
export const PAYSLIP_STATUSES = ["ok", "error"] as const;

/** An effective-dated EPF/ETF rate. `rate` is hundredths of a percent (800 = 8%), matching the rest of the codebase. */
export interface StatutoryRateDoc extends BaseDoc {
  code: (typeof STATUTORY_CODES)[number];
  rate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
}

/**
 * One band of the APIT (PAYE-style) tax table, in the published "tax = income
 * x rate - subtractAmount" form. Seed rows are illustrative only, for testing
 * the formula — real brackets must come from the current Inland Revenue
 * table before this is used for a real payroll run.
 */
export interface ApitBracketDoc extends BaseDoc {
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Monthly taxable income, minor units; the band this row applies from. */
  lowerBound: number;
  rate: number;
  subtractAmount: number;
  notes: string | null;
}

export interface SalaryComponentDoc extends BaseDoc {
  code: string;
  name: string;
  type: (typeof COMPONENT_TYPES)[number];
  category: (typeof COMPONENT_CATEGORIES)[number];
  calculationType: (typeof CALCULATION_TYPES)[number];
  /** Taxable earnings count toward APIT income; a non-taxable allowance doesn't. Ignored for deductions. */
  isTaxable: boolean;
  notes: string | null;
}

export interface StructureLine {
  componentId: string;
  /** Minor units for "fixed"; hundredths of a percent of basic for "percentage_of_basic". */
  amount: number;
}

/** One employee's pay, effective from a date; the most recent one on or before a run's period applies. */
export interface SalaryStructureDoc extends BaseDoc {
  employeeId: string;
  effectiveFrom: string;
  currency: string;
  basicSalary: number;
  lines: StructureLine[];
  notes: string | null;
}

export interface LoanDoc extends BaseDoc {
  employeeId: string;
  type: (typeof LOAN_TYPES)[number];
  principal: number;
  installmentAmount: number;
  remainingBalance: number;
  grantedOn: string;
  journalId: string | null;
  status: (typeof LOAN_STATUSES)[number];
  notes: string | null;
}

export interface PayrollRunDoc extends BaseDoc {
  /** "2026-12" */
  period: string;
  payDate: string | null;
  status: (typeof RUN_STATUSES)[number];
  employeeCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalEmployerCost: number;
  journalId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  lockedAt: string | null;
  notes: string | null;
}

export interface PayslipEarning {
  componentId: string | null;
  label: string;
  amount: number;
}
export interface PayslipDeduction {
  componentId: string | null;
  label: string;
  amount: number;
}

/** One employee's result within a run. The sibling of a journal entry line, not a draftable document on its own. */
export interface PayslipDoc extends BaseDoc {
  runId: string;
  employeeId: string;
  period: string;
  currency: string;
  earnings: PayslipEarning[];
  deductions: PayslipDeduction[];
  grossPay: number;
  epfEmployee: number;
  epfEmployer: number;
  etfEmployer: number;
  apit: number;
  loanDeductions: number;
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  overtimeMinutes: number;
  totalDeductions: number;
  netPay: number;
  status: (typeof PAYSLIP_STATUSES)[number];
  statusReason: string | null;
}

export const PAYROLL_LISTS: Record<"payslips", LargeListSpec> = {
  payslips: { filters: ["employeeId"], sorts: [{ field: "period", direction: "desc" }] },
};
