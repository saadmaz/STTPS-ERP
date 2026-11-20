import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { hasPermission, RequestContext, Scope } from "../platform/context/request-context.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import {
  BranchDoc,
  BusinessUnitDoc,
  CostCentreDoc,
  DepartmentDoc,
  ExchangeRateDoc,
  FiscalPeriod,
  FiscalYearDoc,
  ORG_COLLECTIONS,
  PeriodStatus,
  TeamDoc,
} from "./org.models.js";
import {
  CreateBranchDto,
  CreateBusinessUnitDto,
  CreateCostCentreDto,
  CreateDepartmentDto,
  CreateExchangeRateDto,
  CreateFiscalYearDto,
  CreateTeamDto,
  UpdateBranchDto,
  UpdateBusinessUnitDto,
  UpdateCostCentreDto,
  UpdateDepartmentDto,
  UpdateExchangeRateDto,
  UpdateFiscalYearDto,
  UpdateTeamDto,
} from "./dto/org.dto.js";

const MASTER_SORT = ["code", "name", "createdAt", "updatedAt"];

@Injectable()
export class BranchService extends MasterDataService<BranchDoc, CreateBranchDto, UpdateBranchDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "org",
      entity: "branch",
      label: "Branch",
      collection: ORG_COLLECTIONS.branches,
      route: "/org/branches",
      uniqueFields: ["code"],
      filterFields: ["type", "isActive"],
      sortFields: MASTER_SORT,
    });
  }

  protected toNew(dto: CreateBranchDto): NewDoc<BranchDoc> {
    return {
      code: dto.code,
      name: dto.name,
      type: dto.type ?? "branch",
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      managerUserId: dto.managerUserId ?? null,
      timezone: dto.timezone ?? null,
      isActive: dto.isActive ?? true,
    };
  }
}

@Injectable()
export class CostCentreService extends MasterDataService<CostCentreDoc, CreateCostCentreDto, UpdateCostCentreDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "org",
      entity: "costCentre",
      label: "Cost centre",
      collection: ORG_COLLECTIONS.costCentres,
      route: "/org/cost-centres",
      uniqueFields: ["code"],
      parentField: "parentId",
      filterFields: ["parentId", "isActive"],
      sortFields: MASTER_SORT,
    });
  }

  protected toNew(dto: CreateCostCentreDto): NewDoc<CostCentreDoc> {
    return {
      code: dto.code,
      name: dto.name,
      parentId: dto.parentId ?? null,
      ownerUserId: dto.ownerUserId ?? null,
      isActive: dto.isActive ?? true,
    };
  }
}

@Injectable()
export class DepartmentService extends MasterDataService<DepartmentDoc, CreateDepartmentDto, UpdateDepartmentDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "org",
      entity: "department",
      label: "Department",
      collection: ORG_COLLECTIONS.departments,
      route: "/org/departments",
      uniqueFields: ["code"],
      parentField: "parentId",
      references: [
        { field: "branchId", collection: ORG_COLLECTIONS.branches, label: "Branch" },
        { field: "costCentreId", collection: ORG_COLLECTIONS.costCentres, label: "Cost centre" },
      ],
      filterFields: ["parentId", "branchId", "isActive"],
      sortFields: MASTER_SORT,
    });
  }

  protected toNew(dto: CreateDepartmentDto): NewDoc<DepartmentDoc> {
    return {
      code: dto.code,
      name: dto.name,
      parentId: dto.parentId ?? null,
      branchId: dto.branchId ?? null,
      costCentreId: dto.costCentreId ?? null,
      managerUserId: dto.managerUserId ?? null,
      isActive: dto.isActive ?? true,
    };
  }
}

@Injectable()
export class TeamService extends MasterDataService<TeamDoc, CreateTeamDto, UpdateTeamDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "org",
      entity: "team",
      label: "Team",
      collection: ORG_COLLECTIONS.teams,
      route: "/org/teams",
      uniqueFields: ["code"],
      references: [{ field: "departmentId", collection: ORG_COLLECTIONS.departments, label: "Department" }],
      filterFields: ["departmentId", "isActive"],
      sortFields: MASTER_SORT,
    });
  }

  protected toNew(dto: CreateTeamDto): NewDoc<TeamDoc> {
    return {
      code: dto.code,
      name: dto.name,
      departmentId: dto.departmentId ?? null,
      leadUserId: dto.leadUserId ?? null,
      memberUserIds: [...new Set(dto.memberUserIds ?? [])],
      isActive: dto.isActive ?? true,
    };
  }

  protected toPatch(dto: UpdateTeamDto): Patch<TeamDoc> {
    return dto.memberUserIds ? { ...dto, memberUserIds: [...new Set(dto.memberUserIds)] } : { ...dto };
  }
}

@Injectable()
export class BusinessUnitService extends MasterDataService<BusinessUnitDoc, CreateBusinessUnitDto, UpdateBusinessUnitDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "org",
      entity: "businessUnit",
      label: "Business unit",
      collection: ORG_COLLECTIONS.businessUnits,
      route: "/org/business-units",
      uniqueFields: ["code"],
      filterFields: ["isActive"],
      sortFields: MASTER_SORT,
    });
  }

  protected toNew(dto: CreateBusinessUnitDto): NewDoc<BusinessUnitDoc> {
    return { code: dto.code, name: dto.name, managerUserId: dto.managerUserId ?? null, isActive: dto.isActive ?? true };
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Builds consecutive calendar-month periods starting on `startDate` (YYYY-MM-01). */
export function buildPeriods(startDate: string, months: number): FiscalPeriod[] {
  const [y, m] = startDate.split("-").map(Number) as [number, number];
  return Array.from({ length: months }, (_, i) => {
    const year = y + Math.floor((m - 1 + i) / 12);
    const month = ((m - 1 + i) % 12) + 1;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const mm = String(month).padStart(2, "0");
    return {
      number: i + 1,
      name: `${MONTHS[month - 1]} ${year}`,
      startDate: `${year}-${mm}-01`,
      endDate: `${year}-${mm}-${String(last).padStart(2, "0")}`,
      status: "open" as PeriodStatus,
    };
  });
}

@Injectable()
export class FiscalYearService extends MasterDataService<FiscalYearDoc, CreateFiscalYearDto, UpdateFiscalYearDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "org",
      entity: "fiscalYear",
      label: "Fiscal year",
      collection: ORG_COLLECTIONS.fiscalYears,
      route: "/org/fiscal-years",
      customFields: false,
      uniqueFields: ["code"],
      filterFields: ["status"],
      sortFields: ["startDate", "code", "createdAt"],
    });
  }

  protected toNew(dto: CreateFiscalYearDto): NewDoc<FiscalYearDoc> {
    const months = dto.months ?? 12;
    if (!Number.isInteger(months) || months < 1 || months > 24) throw new BadRequestException("months must be between 1 and 24");
    const periods = buildPeriods(dto.startDate, months);
    return {
      code: dto.code,
      name: dto.name ?? dto.code,
      startDate: periods[0]!.startDate,
      endDate: periods[periods.length - 1]!.endDate,
      status: "open",
      periods,
    };
  }

  protected toPatch(dto: UpdateFiscalYearDto): Patch<FiscalYearDoc> {
    return { name: dto.name };
  }

  protected async validate(tx: Transaction, ctx: RequestContext, next: FiscalYearDoc, before: FiscalYearDoc | null): Promise<void> {
    if (before) return;
    const others = await this.loadAll(ctx, tx);
    const clash = others.find((y) => y.startDate <= next.endDate && next.startDate <= y.endDate);
    if (clash) throw new BadRequestException(`Overlaps fiscal year ${clash.code} (${clash.startDate} to ${clash.endDate})`);
  }

  /** Opens, soft-closes or locks one period. Reopening a locked period needs the close permission too. */
  async setPeriodStatus(ctx: RequestContext, id: string, number: number, status: PeriodStatus): Promise<FiscalYearDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const index = before.periods.findIndex((p) => p.number === number);
      if (index < 0) throw new BadRequestException(`Period ${number} not found`);
      const periods = before.periods.map((p, i) => (i === index ? { ...p, status } : p));
      const allLocked = periods.every((p) => p.status === "locked");
      const { after } = this.repo.applyUpdate(ctx, tx, before, { periods, status: allLocked ? "closed" : "open" });
      this.audit.record(ctx, {
        module: "org",
        action: `period_${status}`,
        entity: "fiscalYear",
        entityId: id,
        before: { period: number, status: before.periods[index]!.status },
        after: { period: number, status },
      }, tx);
      return after;
    });
  }

  /** The period containing `date` (YYYY-MM-DD), or null when no fiscal year covers it. */
  async periodFor(scope: Scope, date: string, tx?: Transaction): Promise<{ year: FiscalYearDoc; period: FiscalPeriod } | null> {
    const day = date.slice(0, 10);
    const years = await this.loadAll(scope, tx);
    for (const year of years) {
      if (year.startDate > day || year.endDate < day) continue;
      const period = year.periods.find((p) => p.startDate <= day && day <= p.endDate);
      if (period) return { year, period };
    }
    return null;
  }

  /**
   * Throws unless a posting dated `date` is allowed: the period must exist and
   * be open, or soft-closed and the user holds `org.fiscalYear.close`.
   */
  async assertPostable(ctx: RequestContext, date: string, tx?: Transaction): Promise<FiscalPeriod> {
    const found = await this.periodFor(ctx, date, tx);
    if (!found) throw new BadRequestException(`No fiscal period covers ${date.slice(0, 10)}; set up the fiscal year first`);
    const { period } = found;
    if (period.status === "locked") throw new ForbiddenException(`Period ${period.name} is locked`);
    if (period.status === "soft_closed" && !hasPermission(ctx, "org.fiscalYear.close")) {
      throw new ForbiddenException(`Period ${period.name} is closed`);
    }
    return period;
  }
}

const RATE_RE = /^(\d+)(?:\.(\d+))?$/;

@Injectable()
export class ExchangeRateService extends MasterDataService<ExchangeRateDoc, CreateExchangeRateDto, UpdateExchangeRateDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "org",
      entity: "exchangeRate",
      label: "Exchange rate",
      collection: ORG_COLLECTIONS.exchangeRates,
      route: "/org/exchange-rates",
      customFields: false,
      searchable: false,
      filterFields: ["fromCurrency", "toCurrency"],
      sortFields: ["effectiveDate", "createdAt"],
      searchFields: ["fromCurrency", "toCurrency"],
    });
  }

  protected toNew(dto: CreateExchangeRateDto): NewDoc<ExchangeRateDoc> {
    if (dto.fromCurrency === dto.toCurrency) throw new BadRequestException("Currencies must differ");
    if (!/[1-9]/.test(dto.rate)) throw new BadRequestException("rate must be greater than zero");
    return {
      fromCurrency: dto.fromCurrency,
      toCurrency: dto.toCurrency,
      rate: dto.rate,
      effectiveDate: dto.effectiveDate.slice(0, 10),
      source: dto.source ?? null,
    };
  }

  /**
   * The rate to convert `from` into `to` on `date`: the latest rate effective
   * on or before that date, using the inverse pair when only that exists.
   * Returns "1" for the same currency, null when nothing is on record.
   */
  async rateOn(scope: Scope, from: string, to: string, date: string): Promise<string | null> {
    if (from === to) return "1";
    const day = date.slice(0, 10);
    const latest = async (a: string, b: string) => {
      const items = await this.repo
        .query(scope, {
          where: [["fromCurrency", "==", a], ["toCurrency", "==", b], ["effectiveDate", "<=", day]],
          orderBy: [{ field: "effectiveDate", direction: "desc" }],
        })
        .limit(1)
        .get();
      return items.docs[0]?.data() ?? null;
    };
    const direct = await latest(from, to);
    if (direct) return direct.rate;
    const inverse = await latest(to, from);
    return inverse ? invertRate(inverse.rate) : null;
  }
}

/** 1 / rate to 10 decimal places, without floating point. */
export function invertRate(rate: string): string {
  const match = RATE_RE.exec(rate);
  if (!match) throw new BadRequestException(`Invalid rate ${rate}`);
  const fraction = match[2] ?? "";
  const denominator = BigInt(match[1] + fraction);
  if (denominator === 0n) throw new BadRequestException("Cannot invert a zero rate");
  const scale = 10n ** 10n;
  const numerator = 10n ** BigInt(fraction.length) * scale;
  let q = numerator / denominator;
  if ((numerator % denominator) * 2n >= denominator) q += 1n;
  const digits = q.toString().padStart(11, "0");
  return `${digits.slice(0, -10)}.${digits.slice(-10)}`.replace(/\.?0+$/, "");
}
