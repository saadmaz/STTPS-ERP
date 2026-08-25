import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDepartmentDto,
  CreatePositionDto,
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreateLeaveTypeDto,
  CreateLeaveRequestDto,
  ApproveLeaveDto,
  CreatePayrollRunDto,
  CreateJobPostingDto,
  CreateJobApplicationDto,
  UpdateApplicationStageDto,
} from './dto/create-hr.dto';

// Simple flat-rate tax table by country code
const TAX_RATES: Record<string, number> = {
  US: 0.22,
  GB: 0.20,
  DE: 0.19,
  AU: 0.19,
  AE: 0.00,
  DEFAULT: 0.15,
};

function getTaxRate(nationality?: string | null): number {
  if (!nationality) return TAX_RATES.DEFAULT;
  return TAX_RATES[nationality.toUpperCase()] ?? TAX_RATES.DEFAULT;
}

@Injectable()
export class HrService {
  constructor(private prisma: PrismaService) {}

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, companyId: string) {
    const [totalEmployees, activeEmployees, openLeave, openJobPostings, pendingLeave] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId, companyId } }),
      this.prisma.employee.count({ where: { tenantId, companyId, status: 'ACTIVE' } }),
      this.prisma.leaveRequest.count({ where: { tenantId, companyId, status: 'PENDING' } }),
      this.prisma.jobPosting.count({ where: { tenantId, companyId, status: 'OPEN' } }),
      this.prisma.leaveRequest.findMany({
        where: { tenantId, companyId, status: 'PENDING' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { employee: { select: { firstName: true, lastName: true } }, leaveType: { select: { name: true } } },
      }),
    ]);

    const byDepartment = await this.prisma.employee.groupBy({
      by: ['departmentId'],
      where: { tenantId, companyId, status: 'ACTIVE' },
      _count: { _all: true },
    });

    return { totalEmployees, activeEmployees, openLeave, openJobPostings, pendingLeave, byDepartment };
  }

  // ─── Departments ────────────────────────────────────────────────────────────

  async getDepartments(tenantId: string, companyId: string) {
    return this.prisma.department.findMany({
      where: { tenantId, companyId },
      include: { _count: { select: { employees: true, positions: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createDepartment(tenantId: string, companyId: string, dto: CreateDepartmentDto) {
    return this.prisma.department.create({
      data: { tenantId, companyId, ...dto },
    });
  }

  // ─── Positions ──────────────────────────────────────────────────────────────

  async getPositions(tenantId: string, companyId: string) {
    return this.prisma.position.findMany({
      where: { tenantId, companyId },
      include: {
        department: { select: { name: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { title: 'asc' },
    });
  }

  async createPosition(tenantId: string, companyId: string, dto: CreatePositionDto) {
    return this.prisma.position.create({
      data: { tenantId, companyId, ...dto },
    });
  }

  // ─── Employees ──────────────────────────────────────────────────────────────

  async getEmployees(tenantId: string, companyId: string, params: { status?: string; departmentId?: string; page: number; limit: number }) {
    const { status, departmentId, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: {
          department: { select: { name: true } },
          position: { select: { title: true } },
          manager: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getEmployee(tenantId: string, companyId: string, id: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id, tenantId, companyId },
      include: {
        department: true,
        position: true,
        manager: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        subordinates: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        leaveRequests: { take: 5, orderBy: { createdAt: 'desc' }, include: { leaveType: { select: { name: true } } } },
      },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  async createEmployee(tenantId: string, companyId: string, dto: CreateEmployeeDto) {
    const { hireDate, dateOfBirth, salary, ...rest } = dto;
    return this.prisma.employee.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        hireDate: new Date(hireDate),
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        salary: salary ? salary : undefined,
      },
    });
  }

  async updateEmployee(tenantId: string, companyId: string, id: string, dto: UpdateEmployeeDto) {
    await this.getEmployee(tenantId, companyId, id);
    const { terminationDate, salary, ...rest } = dto;
    return this.prisma.employee.update({
      where: { id },
      data: {
        ...rest,
        salary: salary !== undefined ? salary : undefined,
        terminationDate: terminationDate ? new Date(terminationDate) : undefined,
      },
    });
  }

  // ─── Leave Types ────────────────────────────────────────────────────────────

  async getLeaveTypes(tenantId: string, companyId: string) {
    return this.prisma.leaveType.findMany({ where: { tenantId, companyId }, orderBy: { name: 'asc' } });
  }

  async createLeaveType(tenantId: string, companyId: string, dto: CreateLeaveTypeDto) {
    return this.prisma.leaveType.create({ data: { tenantId, companyId, ...dto } });
  }

  // ─── Leave Requests ─────────────────────────────────────────────────────────

  async getLeaveRequests(tenantId: string, companyId: string, params: { status?: string; employeeId?: string; page: number; limit: number }) {
    const { status, employeeId, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: {
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
          leaveType: { select: { name: true, isPaid: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createLeaveRequest(tenantId: string, companyId: string, dto: CreateLeaveRequestDto) {
    const { startDate, endDate, days, ...rest } = dto;
    return this.prisma.leaveRequest.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        days,
      },
    });
  }

  async processLeaveRequest(tenantId: string, companyId: string, userId: string, id: string, dto: ApproveLeaveDto) {
    const req = await this.prisma.leaveRequest.findFirst({ where: { id, tenantId, companyId } });
    if (!req) throw new NotFoundException('Leave request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('Leave request is not pending');

    const status = dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status, approvedBy: userId, approvedAt: new Date(), notes: dto.notes },
    });
  }

  // ─── Payroll ────────────────────────────────────────────────────────────────

  async getPayrollRuns(tenantId: string, companyId: string) {
    return this.prisma.payrollRun.findMany({
      where: { tenantId, companyId },
      include: { _count: { select: { payslips: true } } },
      orderBy: { periodStart: 'desc' },
    });
  }

  async getPayrollRun(tenantId: string, companyId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, tenantId, companyId },
      include: {
        payslips: {
          include: {
            employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
            lines: { orderBy: { sequence: 'asc' } },
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  async createPayrollRun(tenantId: string, companyId: string, userId: string, dto: CreatePayrollRunDto) {
    const { periodStart, periodEnd, payDate, ...rest } = dto;

    // Fetch all active employees with a salary
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, companyId, status: 'ACTIVE', salary: { not: null } },
    });

    if (employees.length === 0) throw new BadRequestException('No active employees with salary found');

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: {
          tenantId,
          companyId,
          ...rest,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          payDate: new Date(payDate),
          createdBy: userId,
        },
      });

      let totalGross = 0;
      let totalTax = 0;
      let totalNet = 0;

      for (const emp of employees) {
        // Monthly gross = salary / 12 for annual, or full amount for monthly
        const monthlySalary = Number(emp.salary);
        const grossPay = emp.payFrequency === 'MONTHLY' ? monthlySalary : monthlySalary / 12;
        const taxRate = getTaxRate(emp.nationality);
        const taxAmount = grossPay * taxRate;
        const socialSecurity = grossPay * 0.065; // 6.5% SS deduction
        const totalDeductions = taxAmount + socialSecurity;
        const netPay = grossPay - totalDeductions;

        totalGross += grossPay;
        totalTax += taxAmount;
        totalNet += netPay;

        await tx.payslip.create({
          data: {
            tenantId,
            companyId,
            payrollRunId: run.id,
            employeeId: emp.id,
            grossPay,
            taxAmount,
            totalDeductions,
            netPay,
            lines: {
              create: [
                { type: 'EARNING', code: 'BASE_SALARY', description: 'Base Salary', amount: grossPay, sequence: 1 },
                { type: 'TAX', code: 'INCOME_TAX', description: `Income Tax (${(taxRate * 100).toFixed(0)}%)`, amount: -taxAmount, sequence: 2 },
                { type: 'DEDUCTION', code: 'SS', description: 'Social Security (6.5%)', amount: -socialSecurity, sequence: 3 },
              ],
            },
          },
        });
      }

      return tx.payrollRun.update({
        where: { id: run.id },
        data: { totalGross, totalTax, totalNet },
      });
    });
  }

  async approvePayrollRun(tenantId: string, companyId: string, userId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'DRAFT') throw new BadRequestException('Only draft payroll runs can be approved');

    return this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: userId, approvedAt: new Date() },
    });
  }

  // ─── Recruitment ────────────────────────────────────────────────────────────

  async getJobPostings(tenantId: string, companyId: string, params: { status?: string; page: number; limit: number }) {
    const { status, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.jobPosting.findMany({
        where,
        include: { _count: { select: { applications: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.jobPosting.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createJobPosting(tenantId: string, companyId: string, dto: CreateJobPostingDto) {
    const { closingDate, salaryMin, salaryMax, ...rest } = dto;
    return this.prisma.jobPosting.create({
      data: {
        tenantId,
        companyId,
        ...rest,
        salaryMin: salaryMin ?? undefined,
        salaryMax: salaryMax ?? undefined,
        closingDate: closingDate ? new Date(closingDate) : undefined,
      },
    });
  }

  async publishJobPosting(tenantId: string, companyId: string, id: string) {
    const posting = await this.prisma.jobPosting.findFirst({ where: { id, tenantId, companyId } });
    if (!posting) throw new NotFoundException('Job posting not found');
    return this.prisma.jobPosting.update({
      where: { id },
      data: { status: 'OPEN', postedAt: new Date() },
    });
  }

  async getApplications(tenantId: string, companyId: string, params: { jobPostingId?: string; stage?: string; page: number; limit: number }) {
    const { jobPostingId, stage, page, limit } = params;
    const where: any = { tenantId, companyId };
    if (jobPostingId) where.jobPostingId = jobPostingId;
    if (stage) where.stage = stage;

    const [data, total] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where,
        include: { jobPosting: { select: { title: true } } },
        orderBy: { appliedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.jobApplication.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createApplication(tenantId: string, companyId: string, dto: CreateJobApplicationDto) {
    return this.prisma.jobApplication.create({ data: { tenantId, companyId, ...dto } });
  }

  async updateApplicationStage(tenantId: string, companyId: string, id: string, dto: UpdateApplicationStageDto) {
    const app = await this.prisma.jobApplication.findFirst({ where: { id, tenantId, companyId } });
    if (!app) throw new NotFoundException('Application not found');
    return this.prisma.jobApplication.update({ where: { id }, data: dto });
  }
}
