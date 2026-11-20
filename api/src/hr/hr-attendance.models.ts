import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const ATTENDANCE_COLLECTIONS = {
  records: "hrAttendanceRecords",
  devices: "hrAttendanceDevices",
  deviceKeys: "hrAttendanceDeviceKeys",
  settings: "hrAttendanceSettings",
} as const;

/** `manual` is an HR-entered backfill; the rest are blueprint §11 attendance methods. */
export const ATTENDANCE_METHODS = ["web", "mobile", "qr", "pin", "device", "manual"] as const;
export const ATTENDANCE_STATUSES = ["present", "late", "early_leave", "half_day", "absent"] as const;
export const CORRECTION_STATUSES = ["pending", "approved", "rejected"] as const;

export interface BreakEntry {
  breakId: string;
  start: string;
  end: string | null;
}

export interface CorrectionRequest {
  requestedAt: string;
  requestedBy: string;
  requestedClockIn: string | null;
  requestedClockOut: string | null;
  reason: string;
  status: (typeof CORRECTION_STATUSES)[number];
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

/**
 * One employee, one work day (blueprint §11 attendance & time). Late, early
 * leave and overtime are computed against `AttendanceSettingsDoc` using the
 * timestamp's own UTC time of day — the platform has no per-company
 * timezone-aware date arithmetic yet (`CompanyDoc.timezone` is stored but
 * not used anywhere for calculation), so this matches dates and times
 * handled naively (UTC) everywhere else in the codebase.
 */
export interface AttendanceRecordDoc extends BaseDoc {
  employeeId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  breaks: BreakEntry[];
  method: (typeof ATTENDANCE_METHODS)[number];
  deviceId: string | null;
  status: (typeof ATTENDANCE_STATUSES)[number];
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  correction: CorrectionRequest | null;
  notes: string | null;
}

export interface AttendanceSettingsDoc {
  companyId: string;
  tenantId: string;
  /** "09:00" */
  startTime: string;
  /** "17:00" */
  endTime: string;
  graceMinutes: number;
  /** A standard work day, for overtime and half-day thresholds. */
  standardMinutes: number;
  updatedAt: string;
  updatedBy: string | null;
}

/**
 * A clock-in kiosk or scanner (blueprint §11 attendance methods: QR, PIN,
 * device integrations). Authenticates with a bearer key, looked up the same
 * way as the public quote link (a SHA-256 digest as the lookup key; see
 * `DeviceService.resolveByKey`), never a normal user session.
 */
export interface DeviceDoc extends BaseDoc {
  code: string;
  name: string;
  branchId: string | null;
  status: "active" | "revoked";
  /** The active key's digest, so a new key can retire the old one; never returned by the API. */
  currentKeyHash: string | null;
  lastSeenAt: string | null;
}

export const ATTENDANCE_LISTS: Record<"records", LargeListSpec> = {
  records: { filters: ["employeeId"], sorts: [{ field: "date", direction: "desc" }] },
};
