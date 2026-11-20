import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, Scope } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { ORG_COLLECTIONS } from "../org/org.models.js";
import { EmployeeDoc, HR_COLLECTIONS } from "./hr.models.js";
import { EmployeeService, verifyAttendancePin } from "./hr.services.js";
import { CreateAttendanceRecordDto, CreateDeviceDto, UpdateAttendanceRecordDto, UpdateAttendanceSettingsDto, UpdateDeviceDto } from "./hr-attendance.dto.js";
import { ATTENDANCE_COLLECTIONS, ATTENDANCE_LISTS, AttendanceRecordDoc, AttendanceSettingsDoc, BreakEntry, CorrectionRequest, DeviceDoc } from "./hr-attendance.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);
const minutesSinceMidnight = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const timeOfDayMinutes = (iso: string): number => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const minutesBetween = (fromIso: string, toIso: string): number => Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));

// ─── Settings ───────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = { startTime: "09:00", endTime: "17:00", graceMinutes: 15, standardMinutes: 480 };

@Injectable()
export class AttendanceSettingsService {
  constructor(private readonly firestore: FirestoreService) {}

  private ref(scope: Scope) {
    return this.firestore.collection<AttendanceSettingsDoc>(ATTENDANCE_COLLECTIONS.settings).doc(scope.companyId);
  }

  async get(scope: Scope): Promise<AttendanceSettingsDoc> {
    return (await this.ref(scope).get()).data() ?? {
      companyId: scope.companyId, tenantId: scope.tenantId, ...DEFAULT_SETTINGS, updatedAt: new Date(0).toISOString(), updatedBy: null,
    };
  }

  async update(ctx: RequestContext, dto: UpdateAttendanceSettingsDto): Promise<AttendanceSettingsDoc> {
    const current = await this.get(ctx);
    const next: AttendanceSettingsDoc = {
      ...current, startTime: dto.startTime ?? current.startTime, endTime: dto.endTime ?? current.endTime,
      graceMinutes: dto.graceMinutes ?? current.graceMinutes, standardMinutes: dto.standardMinutes ?? current.standardMinutes,
      updatedAt: new Date().toISOString(), updatedBy: ctx.userId,
    };
    await this.ref(ctx).set(next);
    return next;
  }
}

// ─── Devices ────────────────────────────────────────────────────────────────────

@Injectable()
export class DeviceService extends MasterDataService<DeviceDoc, CreateDeviceDto, UpdateDeviceDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "hr", entity: "device", label: "Attendance device", collection: ATTENDANCE_COLLECTIONS.devices,
      route: "/hr/devices", uniqueFields: ["code"], filterFields: ["status", "branchId"],
      references: [{ field: "branchId", collection: ORG_COLLECTIONS.branches, label: "Branch" }],
      customFields: false,
    });
  }

  protected toNew(dto: CreateDeviceDto): NewDoc<DeviceDoc> {
    return { code: dto.code, name: dto.name, branchId: orNull(dto.branchId), status: "active", currentKeyHash: null, lastSeenAt: null };
  }

  /** Issues a new bearer key, retiring the device's current one; the raw key is returned once and never stored. */
  async issueKey(ctx: RequestContext, id: string): Promise<{ device: DeviceDoc; key: string }> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const key = randomBytes(24).toString("base64url");
      const hash = createHash("sha256").update(key).digest("hex");
      if (before.currentKeyHash) tx.delete(this.firestore.collection(ATTENDANCE_COLLECTIONS.deviceKeys).doc(before.currentKeyHash));
      tx.set(this.firestore.collection(ATTENDANCE_COLLECTIONS.deviceKeys).doc(hash), { deviceId: id, tenantId: ctx.tenantId, companyId: ctx.companyId, createdAt: new Date().toISOString() });
      const { after } = this.repo.applyUpdate(ctx, tx, before, { currentKeyHash: hash, status: "active" } as Patch<DeviceDoc>);
      this.audit.record(ctx, { module: "hr", action: "key_issued", entity: this.entityType, entityId: id }, tx);
      return { device: after, key };
    });
  }

  async revoke(ctx: RequestContext, id: string): Promise<DeviceDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.currentKeyHash) tx.delete(this.firestore.collection(ATTENDANCE_COLLECTIONS.deviceKeys).doc(before.currentKeyHash));
      return this.repo.applyUpdate(ctx, tx, before, { status: "revoked", currentKeyHash: null } as Patch<DeviceDoc>).after;
    });
  }

  /** Resolves a bearer key to the tenant, company and device it belongs to; updates `lastSeenAt`. Returns null for an unknown or revoked key. */
  async resolveByKey(key: string): Promise<{ tenantId: string; companyId: string; deviceId: string } | null> {
    const hash = createHash("sha256").update(key).digest("hex");
    const lookup = (await this.firestore.collection(ATTENDANCE_COLLECTIONS.deviceKeys).doc(hash).get()).data() as
      | { deviceId: string; tenantId: string; companyId: string }
      | undefined;
    if (!lookup) return null;
    const ref = this.firestore.collection<DeviceDoc>(ATTENDANCE_COLLECTIONS.devices).doc(lookup.deviceId);
    const device = (await ref.get()).data();
    if (!device || device.status !== "active") return null;
    await ref.update({ lastSeenAt: new Date().toISOString() });
    return lookup;
  }

  protected searchEntry(doc: DeviceDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code };
  }
}

// ─── Attendance records ─────────────────────────────────────────────────────────

@Injectable()
export class AttendanceService extends MasterDataService<AttendanceRecordDoc, CreateAttendanceRecordDto, UpdateAttendanceRecordDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly employees: EmployeeService,
    private readonly settingsService: AttendanceSettingsService,
  ) {
    super(fs, audit, unique, {
      module: "hr", entity: "attendanceRecord", label: "Attendance record", collection: ATTENDANCE_COLLECTIONS.records,
      route: "/hr/attendance", filterFields: ATTENDANCE_LISTS.records.filters, large: ATTENDANCE_LISTS.records,
      references: [{ field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" }],
      customFields: false,
    });
  }

  /** A manual (HR-entered) record; clocking in/out always goes through the dedicated actions below. */
  protected toNew(dto: CreateAttendanceRecordDto): NewDoc<AttendanceRecordDoc> {
    const clockIn = dto.clockIn ?? null;
    const clockOut = dto.clockOut ?? null;
    return {
      employeeId: dto.employeeId, date: dto.date.slice(0, 10), clockIn, clockOut, breaks: [], method: "manual", deviceId: null,
      status: dto.status ?? (clockIn ? "present" : "absent"), workedMinutes: clockIn && clockOut ? minutesBetween(clockIn, clockOut) : 0,
      overtimeMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, correction: null, notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateAttendanceRecordDto, before: AttendanceRecordDoc): Patch<AttendanceRecordDoc> {
    const { employeeId: _e, date: _d, ...rest } = dto;
    const patch = { ...rest } as Patch<AttendanceRecordDoc>;
    const clockIn = dto.clockIn ?? before.clockIn;
    const clockOut = dto.clockOut ?? before.clockOut;
    if ((dto.clockIn !== undefined || dto.clockOut !== undefined) && clockIn && clockOut) Object.assign(patch, { workedMinutes: minutesBetween(clockIn, clockOut) });
    return patch;
  }

  /** Today's record for the employee, read-only (no write phase); pass `tx` to read inside a transaction. */
  private async findToday(ctx: RequestContext, employeeId: string, date: string, tx?: Transaction): Promise<AttendanceRecordDoc | null> {
    const q = this.repo.collection.where("companyId", "==", ctx.companyId).where("archived", "==", false).where("employeeId", "==", employeeId).where("date", "==", date);
    const snap = tx ? await tx.get(q) : await q.get();
    return snap.docs[0]?.data() ?? null;
  }

  async clockIn(ctx: RequestContext, employeeId: string, method: AttendanceRecordDoc["method"], deviceId: string | null): Promise<AttendanceRecordDoc> {
    const date = today();
    const settings = await this.settingsService.get(ctx);
    const now = new Date().toISOString();
    return this.firestore.runTransaction(async (tx) => {
      const existing = await this.findToday(ctx, employeeId, date, tx);
      if (existing) throw new BadRequestException(existing.clockOut ? "Attendance for today is already complete" : "Already clocked in today");
      const lateMinutes = Math.max(0, timeOfDayMinutes(now) - minutesSinceMidnight(settings.startTime) - settings.graceMinutes);
      const doc = this.repo.build(ctx, {
        employeeId, date, clockIn: now, clockOut: null, breaks: [], method, deviceId: orNull(deviceId),
        status: lateMinutes > 0 ? "late" : "present", workedMinutes: 0, overtimeMinutes: 0, lateMinutes, earlyLeaveMinutes: 0, correction: null, notes: null,
      } as NewDoc<AttendanceRecordDoc>);
      tx.create(this.repo.ref(doc.id), doc);
      this.audit.record(ctx, { module: "hr", action: "clocked_in", entity: this.entityType, entityId: doc.id }, tx);
      return doc;
    });
  }

  async clockOut(ctx: RequestContext, employeeId: string): Promise<AttendanceRecordDoc> {
    const date = today();
    const settings = await this.settingsService.get(ctx);
    const now = new Date().toISOString();
    return this.firestore.runTransaction(async (tx) => {
      const existing = await this.findToday(ctx, employeeId, date, tx);
      if (!existing || !existing.clockIn) throw new BadRequestException("Not clocked in today");
      if (existing.clockOut) throw new BadRequestException("Already clocked out today");
      if (existing.breaks.some((b) => !b.end)) throw new BadRequestException("End the open break first");
      const breakMinutes = existing.breaks.reduce((a, b) => a + (b.end ? minutesBetween(b.start, b.end) : 0), 0);
      const workedMinutes = Math.max(0, minutesBetween(existing.clockIn, now) - breakMinutes);
      const earlyLeaveMinutes = Math.max(0, minutesSinceMidnight(settings.endTime) - timeOfDayMinutes(now));
      const overtimeMinutes = Math.max(0, workedMinutes - settings.standardMinutes);
      const status = workedMinutes < settings.standardMinutes / 2 ? "half_day" : existing.lateMinutes > 0 ? "late" : earlyLeaveMinutes > 0 ? "early_leave" : "present";
      const { after } = this.repo.applyUpdate(ctx, tx, existing, { clockOut: now, workedMinutes, overtimeMinutes, earlyLeaveMinutes, status } as Patch<AttendanceRecordDoc>);
      this.audit.record(ctx, { module: "hr", action: "clocked_out", entity: this.entityType, entityId: existing.id }, tx);
      return after;
    });
  }

  async startBreak(ctx: RequestContext, employeeId: string): Promise<AttendanceRecordDoc> {
    const date = today();
    return this.firestore.runTransaction(async (tx) => {
      const existing = await this.findToday(ctx, employeeId, date, tx);
      if (!existing || !existing.clockIn || existing.clockOut) throw new BadRequestException("Clock in first");
      if (existing.breaks.some((b) => !b.end)) throw new BadRequestException("A break is already in progress");
      const entry: BreakEntry = { breakId: randomUUID().slice(0, 8), start: new Date().toISOString(), end: null };
      return this.repo.applyUpdate(ctx, tx, existing, { breaks: [...existing.breaks, entry] } as Patch<AttendanceRecordDoc>).after;
    });
  }

  async endBreak(ctx: RequestContext, employeeId: string): Promise<AttendanceRecordDoc> {
    const date = today();
    return this.firestore.runTransaction(async (tx) => {
      const existing = await this.findToday(ctx, employeeId, date, tx);
      if (!existing) throw new BadRequestException("Not clocked in today");
      const open = existing.breaks.find((b) => !b.end);
      if (!open) throw new BadRequestException("No break is in progress");
      const end = new Date().toISOString();
      const breaks = existing.breaks.map((b) => (b.breakId === open.breakId ? { ...b, end } : b));
      return this.repo.applyUpdate(ctx, tx, existing, { breaks } as Patch<AttendanceRecordDoc>).after;
    });
  }

  /** Records a day with no clock-in at all; refused if a record already exists for that date. */
  async markAbsent(ctx: RequestContext, employeeId: string, date: string, reason: string | undefined): Promise<AttendanceRecordDoc> {
    const day = date.slice(0, 10);
    const existing = await this.findToday(ctx, employeeId, day);
    if (existing) throw new BadRequestException("An attendance record already exists for this date");
    return this.create(ctx, { employeeId, date: day, status: "absent", notes: reason } as CreateAttendanceRecordDto);
  }

  async requestCorrection(ctx: RequestContext, id: string, employeeId: string, requestedClockIn: string | undefined, requestedClockOut: string | undefined, reason: string): Promise<AttendanceRecordDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.employeeId !== employeeId) throw new ForbiddenException("This is not your attendance record");
    if (before.correction?.status === "pending") throw new BadRequestException("A correction request is already pending");
    const correction: CorrectionRequest = {
      requestedAt: new Date().toISOString(), requestedBy: ctx.userId, requestedClockIn: requestedClockIn ?? null, requestedClockOut: requestedClockOut ?? null,
      reason, status: "pending", decidedBy: null, decidedAt: null, decisionNote: null,
    };
    return (await this.repo.update(ctx, id, { correction } as Patch<AttendanceRecordDoc>)).after;
  }

  /** Approving fills in the requested times and recomputes worked minutes; it does not re-run late/overtime, which stay as first recorded. */
  async decideCorrection(ctx: RequestContext, id: string, approve: boolean, note: string | undefined): Promise<AttendanceRecordDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.correction?.status !== "pending") throw new BadRequestException("No correction request is pending");
    const correction: CorrectionRequest = { ...before.correction, status: approve ? "approved" : "rejected", decidedBy: ctx.userId, decidedAt: new Date().toISOString(), decisionNote: orNull(note) };
    const patch: Patch<AttendanceRecordDoc> = { correction };
    if (approve) {
      const clockIn = correction.requestedClockIn ?? before.clockIn;
      const clockOut = correction.requestedClockOut ?? before.clockOut;
      if (correction.requestedClockIn) Object.assign(patch, { clockIn });
      if (correction.requestedClockOut) Object.assign(patch, { clockOut });
      if (clockIn && clockOut) Object.assign(patch, { workedMinutes: minutesBetween(clockIn, clockOut) });
    }
    return (await this.repo.update(ctx, id, patch)).after;
  }

  /** Worked, overtime and late minutes over a range, newest first (matching the one composite index this module needs). */
  async timesheet(ctx: RequestContext, employeeId: string, from: string, to: string) {
    const snap = await this.repo.collection
      .where("companyId", "==", ctx.companyId).where("archived", "==", false).where("employeeId", "==", employeeId)
      .where("date", ">=", from).where("date", "<=", to).orderBy("date", "desc").get();
    const records = snap.docs.map((d) => d.data()).reverse();
    const totals = records.reduce(
      (a, r) => ({
        workedMinutes: a.workedMinutes + r.workedMinutes, overtimeMinutes: a.overtimeMinutes + r.overtimeMinutes, lateMinutes: a.lateMinutes + r.lateMinutes,
        presentDays: a.presentDays + (r.status === "absent" ? 0 : 1), absentDays: a.absentDays + (r.status === "absent" ? 1 : 0),
      }),
      { workedMinutes: 0, overtimeMinutes: 0, lateMinutes: 0, presentDays: 0, absentDays: 0 },
    );
    return { employeeId, from, to, records, totals };
  }

  /** The employee identified by a kiosk request: by PIN when one is given, otherwise by employee number alone (a QR badge scan). */
  async resolveKioskEmployee(ctx: RequestContext, employeeNumber: string, pin: string | undefined): Promise<EmployeeDoc> {
    const employee = await this.employees.findByEmployeeNumber(ctx, employeeNumber);
    if (!employee || employee.status === "terminated") throw new BadRequestException("Employee not found");
    if (pin) {
      if (!(await verifyAttendancePin(employee, pin))) throw new BadRequestException("Incorrect PIN");
    }
    return employee;
  }

  protected searchEntry(doc: AttendanceRecordDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.date, subtitle: doc.status };
  }
}
