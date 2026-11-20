import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { COLLECTIONS } from "../firestore/collections.js";
import { AuditLogDoc } from "../firestore/models.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { hasPermission, RequestContext } from "../platform/context/request-context.js";
import { ListQueryDto } from "../platform/crud/list-query.dto.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { toMinor } from "../platform/data/money.js";
import { NewDoc, Page, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { ORG_COLLECTIONS } from "../org/org.models.js";
import {
  BankDetailsDto,
  CertificationDto,
  CompensationDto,
  CreateEmployeeDto,
  CreateJobGradeDto,
  CreatePositionDto,
  QualificationDto,
  UpdateEmployeeDto,
  UpdateJobGradeDto,
  UpdateMyProfileDto,
  UpdatePositionDto,
} from "./hr.dto.js";
import { EmergencyContact, EmployeeDoc, EmploymentHistoryEntry, HR_COLLECTIONS, HR_LISTS, JobGradeDoc, PositionDoc } from "./hr.models.js";
import { ChecklistService } from "./hr-onboarding.services.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);
const SENSITIVE_FIELDS = new Set(["compensation", "bankDetails", "nationalId"]);
const COMPENSATION_PERMISSION = "hr.employee.compensation";
const bcryptHash = (value: string) => bcrypt.hash(value, 10);

/** Verifies a kiosk PIN against the employee's stored hash; false when none is set. */
export async function verifyAttendancePin(employee: EmployeeDoc, pin: string): Promise<boolean> {
  return employee.attendancePinHash ? bcrypt.compare(pin, employee.attendancePinHash) : false;
}

// ─── Job grades and positions ──────────────────────────────────────────────────

@Injectable()
export class JobGradeService extends MasterDataService<JobGradeDoc, CreateJobGradeDto, UpdateJobGradeDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "hr", entity: "jobGrade", label: "Job grade", collection: HR_COLLECTIONS.jobGrades,
      route: "/hr/job-grades", uniqueFields: ["code"], customFields: false,
    });
  }

  protected toNew(dto: CreateJobGradeDto): NewDoc<JobGradeDoc> {
    const currency = dto.currency ?? "LKR";
    return {
      code: dto.code, name: dto.name, currency,
      minSalary: dto.minSalary ? toMinor(dto.minSalary, currency) : null,
      maxSalary: dto.maxSalary ? toMinor(dto.maxSalary, currency) : null,
      notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateJobGradeDto, before: JobGradeDoc): Patch<JobGradeDoc> {
    const { minSalary, maxSalary, ...rest } = dto;
    const currency = dto.currency ?? before.currency;
    const patch = { ...rest } as Patch<JobGradeDoc>;
    if (minSalary !== undefined) Object.assign(patch, { minSalary: minSalary ? toMinor(minSalary, currency) : null });
    if (maxSalary !== undefined) Object.assign(patch, { maxSalary: maxSalary ? toMinor(maxSalary, currency) : null });
    return patch;
  }
}

@Injectable()
export class PositionService extends MasterDataService<PositionDoc, CreatePositionDto, UpdatePositionDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "hr", entity: "position", label: "Position", collection: HR_COLLECTIONS.positions,
      route: "/hr/positions", uniqueFields: ["code"], filterFields: ["status", "departmentId", "jobGradeId"],
      references: [
        { field: "departmentId", collection: ORG_COLLECTIONS.departments, label: "Department" },
        { field: "jobGradeId", collection: HR_COLLECTIONS.jobGrades, label: "Job grade" },
      ],
      customFields: false,
    });
  }

  protected toNew(dto: CreatePositionDto): NewDoc<PositionDoc> {
    return {
      code: dto.code, title: dto.title, departmentId: orNull(dto.departmentId), jobGradeId: orNull(dto.jobGradeId),
      description: orNull(dto.description), status: dto.status ?? "active",
    };
  }

  protected searchEntry(doc: PositionDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.title, subtitle: doc.code };
  }
}

// ─── Employees ──────────────────────────────────────────────────────────────────

function buildCompensation(dto: CompensationDto, fallbackCurrency: string) {
  const currency = dto.currency ?? fallbackCurrency;
  return { salary: toMinor(dto.salary, currency), currency, payFrequency: dto.payFrequency ?? "monthly", effectiveDate: dto.effectiveDate?.slice(0, 10) ?? today() };
}
function buildBankDetails(dto: BankDetailsDto) {
  return { bankName: orNull(dto.bankName), branch: orNull(dto.branch), accountName: orNull(dto.accountName), accountNumber: orNull(dto.accountNumber) };
}
function buildEmergencyContact(dto: { name: string; relationship?: string; phone: string }): EmergencyContact {
  return { name: dto.name, relationship: orNull(dto.relationship), phone: dto.phone };
}
function buildQualifications(dto: QualificationDto[]) {
  return dto.map((q) => ({ title: q.title, institution: orNull(q.institution), year: orNull(q.year) }));
}
function buildCertifications(dto: CertificationDto[]) {
  return dto.map((c) => ({ name: c.name, issuer: orNull(c.issuer), issuedDate: c.issuedDate?.slice(0, 10) ?? null, expiryDate: c.expiryDate?.slice(0, 10) ?? null }));
}

/** Throws unless the caller holds `hr.employee.compensation`; call before touching salary, bank details or national ID. */
function requireCompensationAccess(ctx: RequestContext): void {
  if (!hasPermission(ctx, COMPENSATION_PERMISSION)) throw new ForbiddenException("Salary, bank details and national ID need the compensation permission");
}

@Injectable()
export class EmployeeService extends MasterDataService<EmployeeDoc, CreateEmployeeDto, UpdateEmployeeDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly checklists: ChecklistService) {
    super(fs, audit, unique, {
      module: "hr", entity: "employee", label: "Employee", collection: HR_COLLECTIONS.employees,
      route: "/hr/employees", uniqueFields: ["employeeNumber"], parentField: "managerId",
      filterFields: [...HR_LISTS.employees.filters, "employmentType", "branchId", "positionId"], large: HR_LISTS.employees,
      references: [
        { field: "branchId", collection: ORG_COLLECTIONS.branches, label: "Branch" },
        { field: "departmentId", collection: ORG_COLLECTIONS.departments, label: "Department" },
        { field: "positionId", collection: HR_COLLECTIONS.positions, label: "Position" },
        { field: "jobGradeId", collection: HR_COLLECTIONS.jobGrades, label: "Job grade" },
      ],
      numbering: { field: "employeeNumber", key: "employee", prefix: "EMP" },
      customFields: true,
    });
  }

  /** Redacts salary, bank details and national ID unless the caller holds `hr.employee.compensation`. */
  private redact(ctx: RequestContext, doc: EmployeeDoc): EmployeeDoc {
    if (hasPermission(ctx, COMPENSATION_PERMISSION)) return doc;
    return { ...doc, compensation: null, bankDetails: null, nationalId: null };
  }

  async get(ctx: RequestContext, id: string): Promise<EmployeeDoc> {
    return this.redact(ctx, await super.get(ctx, id));
  }

  async list(ctx: RequestContext, query: ListQueryDto): Promise<Page<EmployeeDoc>> {
    const page = await super.list(ctx, query);
    return { ...page, items: page.items.map((d) => this.redact(ctx, d)) };
  }

  async history(ctx: RequestContext, id: string): Promise<AuditLogDoc[]> {
    const entries = await super.history(ctx, id);
    if (hasPermission(ctx, COMPENSATION_PERMISSION)) return entries;
    const strip = (o: Record<string, unknown> | null) => (o ? Object.fromEntries(Object.entries(o).filter(([k]) => !SENSITIVE_FIELDS.has(k))) : o);
    return entries.map((e) => ({ ...e, before: strip(e.before), after: strip(e.after) }));
  }

  protected toNew(dto: CreateEmployeeDto, ctx: RequestContext): NewDoc<EmployeeDoc> {
    if (dto.compensation || dto.bankDetails || dto.nationalId) requireCompensationAccess(ctx);
    const joiningDate = dto.joiningDate.slice(0, 10);
    const history: EmploymentHistoryEntry[] = [{
      date: joiningDate, type: "hired", description: "Hired", departmentId: orNull(dto.departmentId), positionId: orNull(dto.positionId), managerId: orNull(dto.managerId),
    }];
    return {
      employeeNumber: dto.employeeNumber ?? "", userId: orNull(dto.userId), firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), preferredName: orNull(dto.preferredName),
      email: orNull(dto.email), phone: orNull(dto.phone), dateOfBirth: dto.dateOfBirth?.slice(0, 10) ?? null, gender: orNull(dto.gender), maritalStatus: orNull(dto.maritalStatus),
      nationality: orNull(dto.nationality), nationalId: orNull(dto.nationalId), address: orNull(dto.address), emergencyContact: dto.emergencyContact ? buildEmergencyContact(dto.emergencyContact) : null,
      branchId: orNull(dto.branchId), departmentId: orNull(dto.departmentId), positionId: orNull(dto.positionId), jobGradeId: orNull(dto.jobGradeId), managerId: orNull(dto.managerId),
      employmentType: dto.employmentType ?? "full_time", status: dto.status ?? "active", joiningDate, probationEndDate: dto.probationEndDate?.slice(0, 10) ?? null,
      contractType: dto.contractType ?? null, contractEndDate: dto.contractEndDate?.slice(0, 10) ?? null, terminationDate: null, terminationReason: null,
      compensation: dto.compensation ? buildCompensation(dto.compensation, "LKR") : null, bankDetails: dto.bankDetails ? buildBankDetails(dto.bankDetails) : null,
      qualifications: dto.qualifications ? buildQualifications(dto.qualifications) : [], skills: dto.skills ?? [],
      certifications: dto.certifications ? buildCertifications(dto.certifications) : [], employmentHistory: history, attendancePinHash: null, notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateEmployeeDto, before: EmployeeDoc, ctx: RequestContext): Patch<EmployeeDoc> {
    if (before.status === "terminated") throw new BadRequestException("A terminated employee cannot be changed; reinstate first");
    if (dto.status === "terminated") throw new BadRequestException("Use the terminate action, which records the date and reason");
    if ((dto.compensation !== undefined || dto.bankDetails !== undefined || dto.nationalId !== undefined)) requireCompensationAccess(ctx);
    const { compensation, bankDetails, emergencyContact, address, qualifications, certifications, dateOfBirth, probationEndDate, contractEndDate, joiningDate, ...rest } = dto;
    const patch = { ...rest } as Patch<EmployeeDoc>;
    if (compensation !== undefined) Object.assign(patch, { compensation: compensation ? buildCompensation(compensation, before.compensation?.currency ?? "LKR") : null });
    if (bankDetails !== undefined) Object.assign(patch, { bankDetails: bankDetails ? buildBankDetails(bankDetails) : null });
    if (emergencyContact !== undefined) Object.assign(patch, { emergencyContact: emergencyContact ? buildEmergencyContact(emergencyContact) : null });
    if (address !== undefined) Object.assign(patch, { address: address ?? null });
    if (qualifications !== undefined) Object.assign(patch, { qualifications: buildQualifications(qualifications) });
    if (certifications !== undefined) Object.assign(patch, { certifications: buildCertifications(certifications) });
    if (dateOfBirth !== undefined) Object.assign(patch, { dateOfBirth: dateOfBirth?.slice(0, 10) ?? null });
    if (probationEndDate !== undefined) Object.assign(patch, { probationEndDate: probationEndDate?.slice(0, 10) ?? null });
    if (contractEndDate !== undefined) Object.assign(patch, { contractEndDate: contractEndDate?.slice(0, 10) ?? null });
    if (joiningDate !== undefined) Object.assign(patch, { joiningDate: joiningDate.slice(0, 10) });
    return patch;
  }

  /** Users are tenant-scoped (no `companyId`), so this needs its own check rather than the generic `references` config. */
  protected async validate(tx: Transaction, ctx: RequestContext, next: EmployeeDoc, before: EmployeeDoc | null): Promise<void> {
    if (next.userId && next.userId !== before?.userId) {
      const assignment = await tx.get(this.firestore.collection(COLLECTIONS.companyUsers).doc(`${next.userId}_${ctx.companyId}`));
      if (!assignment.exists) throw new BadRequestException("That user is not assigned to this company");
    }
  }

  /** Appends an employment-history entry when a job-affecting field changes, so promotions and transfers are traceable. */
  protected async derive(_tx: Transaction, _ctx: RequestContext, next: EmployeeDoc, before: EmployeeDoc | null): Promise<Partial<EmployeeDoc>> {
    if (!before) return {};
    const entries: EmploymentHistoryEntry[] = [];
    const moved = next.departmentId !== before.departmentId || next.positionId !== before.positionId || next.managerId !== before.managerId;
    if (moved) {
      entries.push({ date: today(), type: "transferred", description: "Department, position or manager changed", departmentId: next.departmentId, positionId: next.positionId, managerId: next.managerId });
    }
    if ((next.compensation?.salary ?? null) !== (before.compensation?.salary ?? null)) {
      entries.push({ date: today(), type: "salary_changed", description: "Compensation changed", departmentId: next.departmentId, positionId: next.positionId, managerId: next.managerId });
    }
    return entries.length ? { employmentHistory: [...before.employmentHistory, ...entries] } : {};
  }

  /** Ends employment: status, date and reason, with a closing history entry. */
  async terminate(ctx: RequestContext, id: string, date: string | undefined, reason: string): Promise<EmployeeDoc> {
    const after = await this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status === "terminated") throw new BadRequestException("Already terminated");
      const terminationDate = date?.slice(0, 10) ?? today();
      const entry: EmploymentHistoryEntry = { date: terminationDate, type: "terminated", description: reason, departmentId: before.departmentId, positionId: before.positionId, managerId: before.managerId };
      const { after } = this.repo.applyUpdate(ctx, tx, before, {
        status: "terminated", terminationDate, terminationReason: reason, employmentHistory: [...before.employmentHistory, entry],
      });
      this.audit.record(ctx, { module: "hr", action: "terminated", entity: this.entityType, entityId: id, reason }, tx);
      return after;
    });
    await this.checklists.start(ctx, id, "offboarding", after.terminationDate);
    return after;
  }

  /** Brings a terminated employee back, as a fresh stint (does not undo the termination record). */
  async reinstate(ctx: RequestContext, id: string, date: string | undefined): Promise<EmployeeDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "terminated") throw new BadRequestException("Only a terminated employee can be reinstated");
      const rehireDate = date?.slice(0, 10) ?? today();
      const entry: EmploymentHistoryEntry = { date: rehireDate, type: "reinstated", description: "Reinstated", departmentId: before.departmentId, positionId: before.positionId, managerId: before.managerId };
      const { after } = this.repo.applyUpdate(ctx, tx, before, {
        status: "active", terminationDate: null, terminationReason: null, employmentHistory: [...before.employmentHistory, entry],
      });
      this.audit.record(ctx, { module: "hr", action: "reinstated", entity: this.entityType, entityId: id }, tx);
      return after;
    });
  }

  /** The reporting tree rooted at every employee with no manager (or, from `rootId`, one subtree). */
  async orgChart(ctx: RequestContext, rootId?: string): Promise<OrgChartNode[]> {
    const all = await this.loadAll(ctx);
    const byManager = new Map<string | null, EmployeeDoc[]>();
    for (const e of all) {
      const key = e.managerId;
      byManager.set(key, [...(byManager.get(key) ?? []), e]);
    }
    const build = (e: EmployeeDoc): OrgChartNode => ({
      id: e.id, name: `${e.firstName} ${e.lastName}`, employeeNumber: e.employeeNumber, positionId: e.positionId, departmentId: e.departmentId, status: e.status,
      reports: (byManager.get(e.id) ?? []).map(build),
    });
    const roots = rootId ? all.filter((e) => e.id === rootId) : (byManager.get(null) ?? []);
    return roots.map(build);
  }

  protected searchEntry(doc: EmployeeDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.firstName} ${doc.lastName}`, subtitle: doc.employeeNumber, keywords: [doc.email, doc.phone] };
  }

  /** The employee linked to this platform user, for self-service (attendance, and later leave and payslips). */
  async findByUserId(ctx: RequestContext, userId: string): Promise<EmployeeDoc | null> {
    const all = await this.loadAll(ctx);
    return all.find((e) => e.userId === userId) ?? null;
  }

  /** For kiosk/device identification, where the caller has no session. */
  async findByEmployeeNumber(ctx: RequestContext, employeeNumber: string): Promise<EmployeeDoc | null> {
    const all = await this.loadAll(ctx);
    return all.find((e) => e.employeeNumber === employeeNumber) ?? null;
  }

  /** For company-wide batch jobs (leave rollover). */
  async listActive(ctx: RequestContext): Promise<EmployeeDoc[]> {
    const all = await this.loadAll(ctx);
    return all.filter((e) => e.status !== "terminated");
  }

  /** Self-service: phone, address and emergency contact only, never employment or pay fields. */
  async updateOwnProfile(ctx: RequestContext, id: string, dto: UpdateMyProfileDto): Promise<EmployeeDoc> {
    const patch: Patch<EmployeeDoc> = {};
    if (dto.phone !== undefined) Object.assign(patch, { phone: dto.phone || null });
    if (dto.address !== undefined) Object.assign(patch, { address: dto.address ?? null });
    if (dto.emergencyContact !== undefined) Object.assign(patch, { emergencyContact: dto.emergencyContact ? buildEmergencyContact(dto.emergencyContact) : null });
    return (await this.repo.update(ctx, id, patch)).after;
  }

  /** Sets or clears the attendance kiosk PIN; hashed, never returned by the API. */
  async setAttendancePin(ctx: RequestContext, id: string, pin: string | null): Promise<EmployeeDoc> {
    const attendancePinHash = pin ? await bcryptHash(pin) : null;
    return (await this.repo.update(ctx, id, { attendancePinHash } as Patch<EmployeeDoc>)).after;
  }
}

export interface OrgChartNode {
  id: string;
  name: string;
  employeeNumber: string;
  positionId: string | null;
  departmentId: string | null;
  status: string;
  reports: OrgChartNode[];
}
