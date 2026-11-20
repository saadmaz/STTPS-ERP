import { BadRequestException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { applyRate, toMinor } from "../platform/data/money.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { GeneralLedger, LineInput } from "../finance/ledger.service.js";
import { HR_COLLECTIONS } from "./hr.models.js";
import { EmployeeService } from "./hr.services.js";
import { AttendanceService } from "./hr-attendance.services.js";
import { HolidayService, LeaveRequestService } from "./hr-leave.services.js";
import {
  CreateApitBracketDto,
  CreateLoanDto,
  CreatePayrollRunDto,
  CreateSalaryComponentDto,
  CreateSalaryStructureDto,
  CreateStatutoryRateDto,
  UpdateApitBracketDto,
  UpdateLoanDto,
  UpdatePayrollRunDto,
  UpdateSalaryComponentDto,
  UpdateSalaryStructureDto,
  UpdateStatutoryRateDto,
} from "./hr-payroll.dto.js";
import {
  ApitBracketDoc,
  LoanDoc,
  PAYROLL_COLLECTIONS,
  PAYROLL_LISTS,
  PayrollRunDoc,
  PayslipDeduction,
  PayslipDoc,
  PayslipEarning,
  SalaryComponentDoc,
  SalaryStructureDoc,
  StatutoryRateDoc,
} from "./hr-payroll.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

function periodRange(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return { start: `${period}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

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

// ─── Statutory configuration ─────────────────────────────────────────────────

@Injectable()
export class StatutoryRateService extends MasterDataService<StatutoryRateDoc, CreateStatutoryRateDto, UpdateStatutoryRateDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, { module: "hr", entity: "statutoryRate", label: "Statutory rate", collection: PAYROLL_COLLECTIONS.statutoryRates, route: "/hr/statutory-rates", filterFields: ["code"], customFields: false });
  }

  protected toNew(dto: CreateStatutoryRateDto): NewDoc<StatutoryRateDoc> {
    return { code: dto.code, rate: dto.rate, effectiveFrom: dto.effectiveFrom.slice(0, 10), effectiveTo: dto.effectiveTo?.slice(0, 10) ?? null, notes: orNull(dto.notes) };
  }

  /** The rate in effect on `date`; throws if none is configured, the same "set it up first" pattern as `GeneralLedger.account`. */
  async rateOn(ctx: RequestContext, code: StatutoryRateDoc["code"], date: string): Promise<number> {
    const all = await this.loadAll(ctx);
    const matches = all.filter((r) => r.code === code && r.effectiveFrom <= date && (!r.effectiveTo || r.effectiveTo >= date));
    matches.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
    if (!matches[0]) throw new BadRequestException(`No ${code} rate is configured for ${date}; add one under Statutory rates`);
    return matches[0].rate;
  }

  protected searchEntry(doc: StatutoryRateDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.code, subtitle: `${(doc.rate / 100).toFixed(2)}%` };
  }
}

@Injectable()
export class ApitBracketService extends MasterDataService<ApitBracketDoc, CreateApitBracketDto, UpdateApitBracketDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, { module: "hr", entity: "apitBracket", label: "APIT bracket", collection: PAYROLL_COLLECTIONS.apitBrackets, route: "/hr/apit-brackets", customFields: false });
  }

  protected toNew(dto: CreateApitBracketDto): NewDoc<ApitBracketDoc> {
    return {
      effectiveFrom: dto.effectiveFrom.slice(0, 10), effectiveTo: dto.effectiveTo?.slice(0, 10) ?? null,
      lowerBound: toMinor(dto.lowerBound, "LKR"), rate: dto.rate, subtractAmount: toMinor(dto.subtractAmount, "LKR"), notes: orNull(dto.notes),
    };
  }

  /** `tax = income x rate - subtractAmount` for the band active on `date` whose `lowerBound` the income falls in. 0 below the lowest band. */
  async taxOn(ctx: RequestContext, taxableIncomeMinor: number, date: string): Promise<number> {
    const all = await this.loadAll(ctx);
    const active = all.filter((b) => b.effectiveFrom <= date && (!b.effectiveTo || b.effectiveTo >= date) && b.lowerBound <= taxableIncomeMinor);
    if (active.length === 0) return 0;
    active.sort((a, b) => b.lowerBound - a.lowerBound);
    const band = active[0]!;
    return Math.max(0, applyRate(taxableIncomeMinor, band.rate) - band.subtractAmount);
  }

  protected searchEntry(doc: ApitBracketDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `From ${doc.lowerBound}`, subtitle: `${(doc.rate / 100).toFixed(2)}%` };
  }
}

// ─── Salary components and structures ───────────────────────────────────────

@Injectable()
export class SalaryComponentService extends MasterDataService<SalaryComponentDoc, CreateSalaryComponentDto, UpdateSalaryComponentDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, { module: "hr", entity: "salaryComponent", label: "Salary component", collection: PAYROLL_COLLECTIONS.components, route: "/hr/salary-components", uniqueFields: ["code"], customFields: false });
  }

  protected toNew(dto: CreateSalaryComponentDto): NewDoc<SalaryComponentDoc> {
    return { code: dto.code, name: dto.name, type: dto.type, category: dto.category, calculationType: dto.calculationType ?? "fixed", isTaxable: dto.isTaxable ?? dto.type === "earning", notes: orNull(dto.notes) };
  }

  async listActive(ctx: RequestContext): Promise<SalaryComponentDoc[]> {
    return this.loadAll(ctx);
  }

  protected searchEntry(doc: SalaryComponentDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code };
  }
}

@Injectable()
export class SalaryStructureService extends MasterDataService<SalaryStructureDoc, CreateSalaryStructureDto, UpdateSalaryStructureDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "hr", entity: "salaryStructure", label: "Salary structure", collection: PAYROLL_COLLECTIONS.structures, route: "/hr/salary-structures",
      filterFields: ["employeeId"], references: [{ field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" }], customFields: false,
    });
  }

  protected toNew(dto: CreateSalaryStructureDto): NewDoc<SalaryStructureDoc> {
    const currency = dto.currency ?? "LKR";
    return {
      employeeId: dto.employeeId, effectiveFrom: dto.effectiveFrom.slice(0, 10), currency, basicSalary: toMinor(dto.basicSalary, currency),
      lines: (dto.lines ?? []).map((l) => ({ componentId: l.componentId, amount: toMinor(l.amount, currency) })), notes: orNull(dto.notes),
    };
  }

  /** The structure effective on `date` (the most recent `effectiveFrom` on or before it), for the payroll calculation. */
  async latestFor(ctx: RequestContext, employeeId: string, date: string): Promise<SalaryStructureDoc | null> {
    const page = await this.list(ctx, { where: `employeeId:${employeeId}`, limit: 200 });
    const eligible = page.items.filter((s) => s.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
    return eligible[0] ?? null;
  }

  protected searchEntry(doc: SalaryStructureDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `From ${doc.effectiveFrom}`, subtitle: doc.currency };
  }
}

// ─── Loans and advances ──────────────────────────────────────────────────────

@Injectable()
export class LoanService extends MasterDataService<LoanDoc, CreateLoanDto, UpdateLoanDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly ledger: GeneralLedger, private readonly employees: EmployeeService) {
    super(fs, audit, unique, {
      module: "hr", entity: "loan", label: "Loan or advance", collection: PAYROLL_COLLECTIONS.loans, route: "/hr/loans",
      filterFields: ["employeeId", "status"], references: [{ field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" }], customFields: false,
    });
  }

  /** Disburses the loan: Dr employee loans (asset) / Cr bank, so a later payroll deduction can recover it correctly. */
  async create(ctx: RequestContext, dto: CreateLoanDto): Promise<LoanDoc> {
    await this.employees.get(ctx, dto.employeeId);
    const principal = toMinor(dto.principal, "LKR");
    return this.firestore.runTransaction(async (tx) => {
      const settings = await this.ledger.settings(ctx, tx);
      const plan = await this.ledger.prepare(tx, ctx, {
        date: dto.grantedOn.slice(0, 10), source: "system", memo: `${dto.type === "loan" ? "Loan" : "Advance"} to employee`,
        lines: [
          { accountId: this.ledger.account(settings, "employeeLoans"), debit: principal, partyType: "employee", partyId: dto.employeeId },
          { accountId: this.ledger.account(settings, "bank"), credit: principal },
        ],
      }, { withNumber: true });
      const journal = plan.commitNew();
      const doc = this.repo.build(ctx, {
        employeeId: dto.employeeId, type: dto.type, principal, installmentAmount: toMinor(dto.installmentAmount, "LKR"), remainingBalance: principal,
        grantedOn: dto.grantedOn.slice(0, 10), journalId: journal.id, status: "active", notes: orNull(dto.notes),
      } as NewDoc<LoanDoc>);
      tx.create(this.repo.ref(doc.id), doc);
      this.audit.record(ctx, { module: "hr", action: "created", entity: this.entityType, entityId: doc.id }, tx);
      return doc;
    });
  }

  async activeForEmployee(ctx: RequestContext, employeeId: string): Promise<LoanDoc[]> {
    const page = await this.list(ctx, { where: `employeeId:${employeeId},status:active`, limit: 50 });
    return page.items;
  }

  /** Recovers an installment from an active loan, capped at what remains; marks it completed once paid off. */
  async recover(ctx: RequestContext, loanId: string, amount: number): Promise<void> {
    const before = await this.repo.get(ctx, loanId);
    const remainingBalance = before.remainingBalance - amount;
    await this.repo.update(ctx, loanId, { remainingBalance, status: remainingBalance <= 0 ? "completed" : "active" } as Patch<LoanDoc>);
  }

  async cancel(ctx: RequestContext, id: string): Promise<LoanDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status !== "active") throw new BadRequestException("Only an active loan can be cancelled");
    return (await this.repo.update(ctx, id, { status: "cancelled" } as Patch<LoanDoc>)).after;
  }

  protected searchEntry(doc: LoanDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.type, subtitle: doc.status };
  }
}

// ─── Payslips ────────────────────────────────────────────────────────────────

@Injectable()
export class PayslipService extends MasterDataService<PayslipDoc, Omit<PayslipDoc, keyof import("../platform/data/repository.js").BaseDoc>, never> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "hr", entity: "payslip", label: "Payslip", collection: PAYROLL_COLLECTIONS.payslips, route: "/hr/payslips",
      filterFields: [...PAYROLL_LISTS.payslips.filters, "runId"], large: PAYROLL_LISTS.payslips,
      references: [{ field: "employeeId", collection: HR_COLLECTIONS.employees, label: "Employee" }], customFields: false,
    });
  }

  protected toNew(dto: Omit<PayslipDoc, keyof import("../platform/data/repository.js").BaseDoc>): NewDoc<PayslipDoc> {
    return { ...dto };
  }

  async forRun(ctx: RequestContext, runId: string): Promise<PayslipDoc[]> {
    const page = await this.list(ctx, { where: `runId:${runId}`, limit: 200 });
    return page.items;
  }

  async forEmployee(ctx: RequestContext, employeeId: string): Promise<PayslipDoc[]> {
    const page = await this.list(ctx, { where: `employeeId:${employeeId}`, limit: 100 });
    return page.items;
  }

  protected searchEntry(doc: PayslipDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.period, subtitle: doc.status };
  }
}

// ─── Payroll runs: the processing pipeline ──────────────────────────────────

@Injectable()
export class PayrollRunService extends MasterDataService<PayrollRunDoc, CreatePayrollRunDto, UpdatePayrollRunDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly ledger: GeneralLedger,
    private readonly employees: EmployeeService,
    private readonly components: SalaryComponentService,
    private readonly structures: SalaryStructureService,
    private readonly statutoryRates: StatutoryRateService,
    private readonly apitBrackets: ApitBracketService,
    private readonly loans: LoanService,
    private readonly leaveRequests: LeaveRequestService,
    private readonly holidays: HolidayService,
    private readonly attendance: AttendanceService,
    private readonly payslips: PayslipService,
  ) {
    super(fs, audit, unique, { module: "hr", entity: "payrollRun", label: "Payroll run", collection: PAYROLL_COLLECTIONS.runs, route: "/hr/payroll-runs", uniqueFields: ["period"], customFields: false });
  }

  protected toNew(dto: CreatePayrollRunDto): NewDoc<PayrollRunDoc> {
    return {
      period: dto.period, payDate: dto.payDate?.slice(0, 10) ?? null, status: "draft", employeeCount: 0, totalGross: 0, totalDeductions: 0, totalNet: 0,
      totalEmployerCost: 0, journalId: null, approvedBy: null, approvedAt: null, lockedAt: null, notes: orNull(dto.notes),
    };
  }

  /** Builds (or rebuilds) every employee's payslip for the run from their current structure, leave, attendance and loans. */
  async calculate(ctx: RequestContext, id: string): Promise<PayrollRunDoc> {
    const run = await this.repo.get(ctx, id);
    if (run.status === "locked" || run.status === "cancelled") throw new BadRequestException(`A ${run.status} run cannot be calculated`);
    const { start, end } = periodRange(run.period);

    for (const old of await this.payslips.forRun(ctx, id)) await this.payslips.archive(ctx, old.id);

    const [employees, components, epfEmployeeRate, epfEmployerRate, etfEmployerRate, holidayDates] = await Promise.all([
      this.employees.listActive(ctx), this.components.listActive(ctx),
      this.statutoryRates.rateOn(ctx, "epf_employee", end), this.statutoryRates.rateOn(ctx, "epf_employer", end), this.statutoryRates.rateOn(ctx, "etf_employer", end),
      this.holidays.allDates(ctx),
    ]);
    const componentById = new Map(components.map((c) => [c.id, c]));
    const workingDays = countBusinessDays(start, end, holidayDates);

    let employeeCount = 0, totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployerCost = 0;
    for (const employee of employees) {
      const structure = await this.structures.latestFor(ctx, employee.id, end);
      if (!structure) continue;

      const earnings: PayslipEarning[] = [{ componentId: null, label: "Basic salary", amount: structure.basicSalary }];
      let grossPay = structure.basicSalary;
      let taxableGross = structure.basicSalary;
      const deductions: PayslipDeduction[] = [];
      for (const line of structure.lines) {
        const component = componentById.get(line.componentId);
        if (!component) continue;
        const amount = component.calculationType === "percentage_of_basic" ? applyRate(structure.basicSalary, line.amount) : line.amount;
        if (component.type === "earning") {
          earnings.push({ componentId: component.id, label: component.name, amount });
          grossPay += amount;
          if (component.isTaxable) taxableGross += amount;
        } else {
          deductions.push({ componentId: component.id, label: component.name, amount });
        }
      }

      const unpaidLeaveDays = await this.leaveRequests.approvedUnpaidDaysInPeriod(ctx, employee.id, start, end);
      const unpaidLeaveDeduction = workingDays > 0 && unpaidLeaveDays > 0 ? Math.round((structure.basicSalary * unpaidLeaveDays) / workingDays) : 0;
      if (unpaidLeaveDeduction > 0) deductions.push({ componentId: null, label: "Unpaid leave", amount: unpaidLeaveDeduction });

      const epfEmployee = applyRate(structure.basicSalary, epfEmployeeRate);
      const epfEmployer = applyRate(structure.basicSalary, epfEmployerRate);
      const etfEmployer = applyRate(structure.basicSalary, etfEmployerRate);
      deductions.push({ componentId: null, label: "EPF (employee)", amount: epfEmployee });

      const taxableIncome = Math.max(0, taxableGross - epfEmployee);
      const apit = await this.apitBrackets.taxOn(ctx, taxableIncome, end);
      if (apit > 0) deductions.push({ componentId: null, label: "APIT", amount: apit });

      const overtimeMinutes = (await this.attendance.timesheet(ctx, employee.id, start, end)).totals.overtimeMinutes;

      let loanDeductions = 0;
      for (const loan of await this.loans.activeForEmployee(ctx, employee.id)) {
        const amount = Math.min(loan.installmentAmount, loan.remainingBalance);
        if (amount <= 0) continue;
        loanDeductions += amount;
        await this.loans.recover(ctx, loan.id, amount);
      }
      if (loanDeductions > 0) deductions.push({ componentId: null, label: "Loan/advance repayment", amount: loanDeductions });

      const employeeTotalDeductions = deductions.reduce((a, d) => a + d.amount, 0);
      const netPay = grossPay - employeeTotalDeductions;

      await this.payslips.create(ctx, {
        runId: id, employeeId: employee.id, period: run.period, currency: structure.currency, earnings, deductions, grossPay, epfEmployee, epfEmployer, etfEmployer,
        apit, loanDeductions, unpaidLeaveDays, unpaidLeaveDeduction, overtimeMinutes, totalDeductions: employeeTotalDeductions, netPay,
        status: netPay < 0 ? "error" : "ok", statusReason: netPay < 0 ? "Net pay is negative" : null,
      });

      employeeCount++;
      totalGross += grossPay;
      totalDeductions += employeeTotalDeductions;
      totalNet += netPay;
      totalEmployerCost += grossPay + epfEmployer + etfEmployer;
    }

    return (await this.repo.update(ctx, id, { status: "calculated", employeeCount, totalGross, totalDeductions, totalNet, totalEmployerCost } as Patch<PayrollRunDoc>)).after;
  }

  async approve(ctx: RequestContext, id: string, notes: string | undefined): Promise<PayrollRunDoc> {
    const run = await this.repo.get(ctx, id);
    if (run.status !== "calculated") throw new BadRequestException("Only a calculated run can be approved");
    const payslips = await this.payslips.forRun(ctx, id);
    if (payslips.some((p) => p.status === "error")) throw new BadRequestException("Fix the payslips with a negative net pay before approving");
    const patch: Patch<PayrollRunDoc> = { status: "approved", approvedBy: ctx.userId, approvedAt: new Date().toISOString() };
    if (notes !== undefined) Object.assign(patch, { notes });
    return (await this.repo.update(ctx, id, patch)).after;
  }

  /** Posts one journal for the whole run and locks it against further changes. */
  async lock(ctx: RequestContext, id: string): Promise<PayrollRunDoc> {
    const run = await this.repo.get(ctx, id);
    if (run.status !== "approved") throw new BadRequestException("Only an approved run can be locked");
    const payslips = await this.payslips.forRun(ctx, id);
    const { end } = periodRange(run.period);
    return this.firestore.runTransaction(async (tx) => {
      const settings = await this.ledger.settings(ctx, tx);
      const allLines: LineInput[] = [
        { accountId: this.ledger.account(settings, "salaryExpense"), debit: run.totalGross, description: `Payroll ${run.period}` },
        { accountId: this.ledger.account(settings, "employerStatutoryExpense"), debit: run.totalEmployerCost - run.totalGross, description: `Employer EPF/ETF ${run.period}` },
        ...payslips.map((p) => ({ accountId: this.ledger.account(settings, "payrollLiability"), credit: p.netPay, partyType: "employee" as const, partyId: p.employeeId, description: `Net pay ${p.period}` })),
        { accountId: this.ledger.account(settings, "statutoryPayable"), credit: payslips.reduce((a, p) => a + p.epfEmployee + p.epfEmployer + p.etfEmployer, 0), description: `EPF/ETF ${run.period}` },
        { accountId: this.ledger.account(settings, "payrollTaxPayable"), credit: payslips.reduce((a, p) => a + p.apit, 0), description: `APIT ${run.period}` },
        { accountId: this.ledger.account(settings, "employeeLoans"), credit: payslips.reduce((a, p) => a + p.loanDeductions, 0), description: `Loan recoveries ${run.period}` },
      ];
      const lines = allLines.filter((l) => l.debit || l.credit);
      const plan = await this.ledger.prepare(tx, ctx, { date: end, source: "system", memo: `Payroll ${run.period}`, lines, reference: { entityType: this.entityType, entityId: run.id, label: run.period } }, { withNumber: true });
      const journal = plan.commitNew();
      return this.repo.applyUpdate(ctx, tx, run, { status: "locked", lockedAt: new Date().toISOString(), journalId: journal.id } as Patch<PayrollRunDoc>).after;
    });
  }

  async cancel(ctx: RequestContext, id: string): Promise<PayrollRunDoc> {
    const run = await this.repo.get(ctx, id);
    if (run.status === "locked") throw new BadRequestException("A locked run cannot be cancelled");
    return (await this.repo.update(ctx, id, { status: "cancelled" } as Patch<PayrollRunDoc>)).after;
  }

  /** A simple CSV for the bank transfer: one line per employee with a positive net pay. */
  async bankFileCsv(ctx: RequestContext, id: string): Promise<string> {
    const payslips = (await this.payslips.forRun(ctx, id)).filter((p) => p.netPay > 0);
    const employees = await this.employees.listActive(ctx);
    const byId = new Map(employees.map((e) => [e.id, e]));
    const rows = payslips.map((p) => {
      const emp = byId.get(p.employeeId);
      return [emp?.employeeNumber ?? p.employeeId, `${emp?.firstName ?? ""} ${emp?.lastName ?? ""}`.trim(), emp?.bankDetails?.accountNumber ?? "", (p.netPay / 100).toFixed(2)].join(",");
    });
    return ["Employee number,Name,Account number,Net pay", ...rows].join("\n");
  }

  protected searchEntry(doc: PayrollRunDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.period, subtitle: doc.status };
  }
}
