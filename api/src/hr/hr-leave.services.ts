import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, Scope } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { HR_COLLECTIONS } from "./hr.models.js";
import { CreateHolidayDto, CreateLeavePolicyDto, CreateLeaveRequestDto, UpdateHolidayDto, UpdateLeavePolicyDto, UpdateLeaveRequestDto } from "./hr-leave.dto.js";
import { LEAVE_COLLECTIONS, LEAVE_LISTS, LeaveBalanceDoc, LeavePolicyDoc, LeaveRequestDoc, HolidayDoc } from "./hr-leave.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

function countBusinessDays(startDate: string, endDate: string, holidays: Set<string>): number {
  let count = 0;
  let t = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  while (t <= end) {
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidays.has(iso)) count++;
    t += 86_400_000;
  }
  return count;
}

// ─── Policies and holidays ──────────────────────────────────────────────────

@Injectable()
export class LeavePolicyService extends MasterDataService<LeavePolicyDoc, CreateLeavePolicyDto, UpdateLeavePolicyDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, { module: "hr", entity: "leavePolicy", label: "Leave policy", collection: LEAVE_COLLECTIONS.policies, route: "/hr/leave-policies", uniqueFields: ["code"], customFields: false });
  }

  protected toNew(dto: CreateLeavePolicyDto): NewDoc<LeavePolicyDoc> {
    return {
      code: dto.code, name: dto.name, type: dto.type, accrualFrequency: dto.accrualFrequency ?? "annual", annualEntitlementDays: dto.annualEntitlementDays,
      carryForwardMaxDays: dto.carryForwardMaxDays ?? 0, isPaid: dto.isPaid ?? dto.type !== "unpaid", requiresApproval: dto.requiresApproval ?? true,
      noticeDays: dto.noticeDays ?? 0, color: orNull(dto.color), notes: orNull(dto.notes),
    };
  }

  /** Every active policy, for the rollover run and self-service balance listing. */
  async listActive(ctx: RequestContext): Promise<LeavePolicyDoc[]> {
    return this.loadAll(ctx);
  }

  protected searchEntry(doc: LeavePolicyDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code };
  }
}

@Injectable()
export class HolidayService extends MasterDataService<HolidayDoc, CreateHolidayDto, UpdateHolidayDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, { module: "hr", entity: "holiday", label: "Holiday", collection: LEAVE_COLLECTIONS.holidays, route: "/hr/holidays", filterFields: ["isOptional"], customFields: false });
  }

  protected toNew(dto: CreateHolidayDto): NewDoc<HolidayDoc> {
    return { date: dto.date.slice(0, 10), name: dto.name, isOptional: dto.isOptional ?? false, notes: orNull(dto.notes) };
  }

  /** Every holiday's date, for excluding them from a leave request's day count. */
  async allDates(ctx: RequestContext): Promise<Set<string>> {
    const all = await this.loadAll(ctx);
    return new Set(all.map((h) => h.date));
  }

  protected searchEntry(doc: HolidayDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.date };
  }
}

// ─── Balances: current state, not a transaction log ────────────────────────

@Injectable()
export class LeaveBalanceService {
  constructor(private readonly firestore: FirestoreService) {}

  private id(employeeId: string, policyId: string) {
    return `${employeeId}_${policyId}`;
  }

  private ref(employeeId: string, policyId: string) {
    return this.firestore.collection<LeaveBalanceDoc>(LEAVE_COLLECTIONS.balances).doc(this.id(employeeId, policyId));
  }

  private blank(scope: Scope, employeeId: string, policyId: string, policy: LeavePolicyDoc): LeaveBalanceDoc {
    return {
      companyId: scope.companyId, tenantId: scope.tenantId, employeeId, policyId, year: new Date().getUTCFullYear(),
      entitlementDays: policy.annualEntitlementDays, carriedForwardDays: 0, usedDays: 0, remainingDays: policy.annualEntitlementDays, updatedAt: new Date(0).toISOString(),
    };
  }

  async get(ctx: RequestContext, employeeId: string, policyId: string, policy: LeavePolicyDoc): Promise<LeaveBalanceDoc> {
    const snap = await this.ref(employeeId, policyId).get();
    return snap.data() ?? this.blank(ctx, employeeId, policyId, policy);
  }

  /** Reads the balance within a transaction, creating a blank one on demand; must be called before any write in that transaction. */
  async getForWrite(ctx: RequestContext, tx: Transaction, employeeId: string, policyId: string, policy: LeavePolicyDoc): Promise<LeaveBalanceDoc> {
    const snap = await tx.get(this.ref(employeeId, policyId));
    return snap.data() ?? this.blank(ctx, employeeId, policyId, policy);
  }

  applyUsage(tx: Transaction, balance: LeaveBalanceDoc, days: number): void {
    const usedDays = balance.usedDays + days;
    tx.set(this.ref(balance.employeeId, balance.policyId), { ...balance, usedDays, remainingDays: balance.entitlementDays + balance.carriedForwardDays - usedDays, updatedAt: new Date().toISOString() });
  }

  releaseUsage(tx: Transaction, balance: LeaveBalanceDoc, days: number): void {
    const usedDays = Math.max(0, balance.usedDays - days);
    tx.set(this.ref(balance.employeeId, balance.policyId), { ...balance, usedDays, remainingDays: balance.entitlementDays + balance.carriedForwardDays - usedDays, updatedAt: new Date().toISOString() });
  }

  /** Resets every employee's balance for every policy into `year`, carrying forward up to each policy's cap. Not atomic across employees — the same "run" shape as the depreciation run. */
  async rollover(ctx: RequestContext, year: number, employees: { id: string }[], policies: LeavePolicyDoc[]): Promise<number> {
    let updated = 0;
    for (const employee of employees) {
      for (const policy of policies) {
        const ref = this.ref(employee.id, policy.id);
        const existing = (await ref.get()).data() ?? null;
        if (existing && existing.year === year) continue;
        const carriedForwardDays = existing ? Math.max(0, Math.min(existing.remainingDays, policy.carryForwardMaxDays)) : 0;
        const entitlementDays = policy.annualEntitlementDays;
        await ref.set({
          companyId: ctx.companyId, tenantId: ctx.tenantId, employeeId: employee.id, policyId: policy.id, year,
          entitlementDays, carriedForwardDays, usedDays: 0, remainingDays: entitlementDays + carriedForwardDays, updatedAt: new Date().toISOString(),
        });
        updated++;
      }
    }
    return updated;
  }
}

// ─── Leave requests ──────────────────────────────────────────────────────────

type RequestInput = CreateLeaveRequestDto & { built?: { days: number } };

@Injectable()
export class LeaveRequestService extends MasterDataService<LeaveRequestDoc, RequestInput, UpdateLeaveRequestDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly policies: LeavePolicyService,
    private readonly holidays: HolidayService,
    private readonly balances: LeaveBalanceService,
  ) {
    super(fs, audit, unique, {
      module: "hr", entity: "leaveRequest", label: "Leave request", collection: LEAVE_COLLECTIONS.requests, route: "/hr/leave-requests",
      filterFields: LEAVE_LISTS.requests.filters, large: LEAVE_LISTS.requests,
      references: [{ field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" }, { field: "policyId", collection: LEAVE_COLLECTIONS.policies, label: "Leave policy" }],
      customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: CreateLeaveRequestDto): Promise<LeaveRequestDoc> {
    const policy = await this.policies.get(ctx, dto.policyId);
    const holidayDates = await this.holidays.allDates(ctx);
    const days = countBusinessDays(dto.startDate.slice(0, 10), dto.endDate.slice(0, 10), holidayDates);
    if (days <= 0) throw new BadRequestException("The selected range has no working days");
    const created = await super.create(ctx, { ...dto, built: { days } });
    return policy.requiresApproval ? created : this.decide(ctx, created.id, true, "Auto-approved: this policy does not require approval");
  }

  protected toNew(dto: RequestInput): NewDoc<LeaveRequestDoc> {
    return {
      employeeId: dto.employeeId, policyId: dto.policyId, startDate: dto.startDate.slice(0, 10), endDate: dto.endDate.slice(0, 10), days: dto.built!.days,
      reason: orNull(dto.reason), status: "pending", requestedAt: new Date().toISOString(), decidedBy: null, decidedAt: null, decisionNote: null, cancelledAt: null, cancelReason: null,
    };
  }

  protected toPatch(dto: UpdateLeaveRequestDto): Patch<LeaveRequestDoc> {
    const { employeeId: _e, policyId: _p, startDate: _s, endDate: _en, ...rest } = dto;
    return rest as Patch<LeaveRequestDoc>;
  }

  async decide(ctx: RequestContext, id: string, approve: boolean, note: string | undefined): Promise<LeaveRequestDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (before.status !== "pending") throw new BadRequestException("This request is not pending");
      const policy = await this.policies.repo.get(ctx, before.policyId, tx);
      const balance = approve && policy.isPaid ? await this.balances.getForWrite(ctx, tx, before.employeeId, before.policyId, policy) : null;
      if (balance && balance.remainingDays < before.days) throw new BadRequestException("Not enough leave balance remaining");
      if (balance) this.balances.applyUsage(tx, balance, before.days);
      return this.repo.applyUpdate(ctx, tx, before, {
        status: approve ? "approved" : "rejected", decidedBy: ctx.userId, decidedAt: new Date().toISOString(), decisionNote: orNull(note),
      } as Patch<LeaveRequestDoc>).after;
    });
  }

  /** `employeeId` set means self-service: only a pending request of your own. `null` means an HR admin, who may also withdraw an approved one (releasing its balance). */
  async cancel(ctx: RequestContext, id: string, employeeId: string | null, reason: string | undefined): Promise<LeaveRequestDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      if (employeeId && before.employeeId !== employeeId) throw new ForbiddenException("This is not your leave request");
      if (before.status === "cancelled") throw new BadRequestException("This request is already cancelled");
      if (employeeId && before.status !== "pending") throw new BadRequestException("Only a pending request can be cancelled yourself; ask HR to cancel an approved one");
      let balance: LeaveBalanceDoc | null = null;
      if (before.status === "approved") {
        const policy = await this.policies.repo.get(ctx, before.policyId, tx);
        if (policy.isPaid) balance = await this.balances.getForWrite(ctx, tx, before.employeeId, before.policyId, policy);
      }
      if (balance) this.balances.releaseUsage(tx, balance, before.days);
      return this.repo.applyUpdate(ctx, tx, before, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelReason: orNull(reason) } as Patch<LeaveRequestDoc>).after;
    });
  }

  /** Approved leave starting in the range — the "who's on leave" calendar. A multi-day request that started earlier but continues into the range won't appear. */
  async calendar(ctx: RequestContext, from: string, to: string): Promise<LeaveRequestDoc[]> {
    const snap = await this.repo.collection
      .where("companyId", "==", ctx.companyId).where("archived", "==", false).where("startDate", ">=", from).where("startDate", "<=", to).orderBy("startDate", "desc").get();
    return snap.docs.map((d) => d.data()).filter((r) => r.status === "approved").reverse();
  }

  protected searchEntry(doc: LeaveRequestDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.startDate, subtitle: doc.status };
  }
}
