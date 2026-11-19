import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const HR_COLLECTIONS = {
  employees: "hrEmployees",
  positions: "hrPositions",
  jobGrades: "hrJobGrades",
} as const;

export interface Address {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

/** A salary band positions are graded against (blueprint §11 organisation structure). */
export interface JobGradeDoc extends BaseDoc {
  code: string;
  name: string;
  currency: string;
  minSalary: number | null;
  maxSalary: number | null;
  notes: string | null;
}

/** A role in the org chart, independent of who currently holds it. */
export interface PositionDoc extends BaseDoc {
  code: string;
  title: string;
  departmentId: string | null;
  jobGradeId: string | null;
  description: string | null;
  status: "active" | "inactive";
}

export interface EmergencyContact {
  name: string;
  relationship: string | null;
  phone: string;
}

/** Sensitive: masked unless the viewer holds `hr.employee.compensation`. */
export interface BankDetails {
  bankName: string | null;
  branch: string | null;
  accountName: string | null;
  accountNumber: string | null;
}

/** Sensitive: masked unless the viewer holds `hr.employee.compensation`. */
export interface Compensation {
  /** Minor units of `currency`. */
  salary: number;
  currency: string;
  payFrequency: "monthly" | "biweekly" | "weekly";
  effectiveDate: string;
}

export interface Qualification {
  title: string;
  institution: string | null;
  year: number | null;
}

export interface Certification {
  name: string;
  issuer: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
}

export const EMPLOYMENT_HISTORY_TYPES = ["hired", "promoted", "transferred", "salary_changed", "suspended", "terminated", "reinstated", "note"] as const;

export interface EmploymentHistoryEntry {
  date: string;
  type: (typeof EMPLOYMENT_HISTORY_TYPES)[number];
  description: string;
  /** Recorded alongside the change, for a point-in-time org chart; never redacted (no salary figure here). */
  departmentId: string | null;
  positionId: string | null;
  managerId: string | null;
}

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern", "probation"] as const;
export const EMPLOYEE_STATUSES = ["active", "on_leave", "suspended", "terminated"] as const;

export interface EmployeeDoc extends BaseDoc {
  employeeNumber: string;
  /** Links to the platform user this employee signs in as, once one exists. */
  userId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  /** Sensitive: masked unless the viewer holds `hr.employee.compensation`. */
  nationalId: string | null;
  address: Address | null;
  emergencyContact: EmergencyContact | null;
  branchId: string | null;
  departmentId: string | null;
  positionId: string | null;
  jobGradeId: string | null;
  /** Another employee; self-referential, cycle-checked like an org chart. */
  managerId: string | null;
  employmentType: (typeof EMPLOYMENT_TYPES)[number];
  status: (typeof EMPLOYEE_STATUSES)[number];
  joiningDate: string;
  probationEndDate: string | null;
  contractType: "permanent" | "fixed_term" | "casual" | null;
  contractEndDate: string | null;
  terminationDate: string | null;
  terminationReason: string | null;
  compensation: Compensation | null;
  bankDetails: BankDetails | null;
  qualifications: Qualification[];
  skills: string[];
  certifications: Certification[];
  employmentHistory: EmploymentHistoryEntry[];
  /** A PIN for kiosk/device attendance clock-in; never returned by the API (stripped globally, like a password). */
  attendancePinHash: string | null;
  notes: string | null;
}

export const HR_LISTS: Record<"employees", LargeListSpec> = {
  employees: {
    filters: ["status", "departmentId", "managerId"],
    sorts: [{ field: "employeeNumber", direction: "asc" }, { field: "joiningDate", direction: "desc" }],
  },
};
