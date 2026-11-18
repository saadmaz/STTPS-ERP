import { BaseDoc } from "../platform/data/repository.js";

export const ORG_COLLECTIONS = {
  branches: "orgBranches",
  departments: "orgDepartments",
  teams: "orgTeams",
  costCentres: "orgCostCentres",
  businessUnits: "orgBusinessUnits",
  fiscalYears: "fiscalYears",
  exchangeRates: "exchangeRates",
} as const;

export interface Address {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export const BRANCH_TYPES = ["office", "branch", "store", "warehouse", "factory", "site"] as const;
export type BranchType = (typeof BRANCH_TYPES)[number];

export interface BranchDoc extends BaseDoc {
  code: string;
  name: string;
  type: BranchType;
  address: Address | null;
  phone: string | null;
  email: string | null;
  managerUserId: string | null;
  timezone: string | null;
  isActive: boolean;
}

export interface DepartmentDoc extends BaseDoc {
  code: string;
  name: string;
  parentId: string | null;
  branchId: string | null;
  costCentreId: string | null;
  managerUserId: string | null;
  isActive: boolean;
}

export interface TeamDoc extends BaseDoc {
  code: string;
  name: string;
  departmentId: string | null;
  leadUserId: string | null;
  memberUserIds: string[];
  isActive: boolean;
}

export interface CostCentreDoc extends BaseDoc {
  code: string;
  name: string;
  parentId: string | null;
  ownerUserId: string | null;
  isActive: boolean;
}

export interface BusinessUnitDoc extends BaseDoc {
  code: string;
  name: string;
  managerUserId: string | null;
  isActive: boolean;
}

export const PERIOD_STATUSES = ["open", "soft_closed", "locked"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export interface FiscalPeriod {
  number: number;
  name: string;
  /** Inclusive, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive, YYYY-MM-DD. */
  endDate: string;
  /** open: anyone may post; soft_closed: only users with finance close rights; locked: nobody. */
  status: PeriodStatus;
}

export interface FiscalYearDoc extends BaseDoc {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  periods: FiscalPeriod[];
}

export interface ExchangeRateDoc extends BaseDoc {
  fromCurrency: string;
  toCurrency: string;
  /** Units of `toCurrency` per one unit of `fromCurrency`, as a decimal string (up to 10 places). */
  rate: string;
  effectiveDate: string;
  source: string | null;
}
