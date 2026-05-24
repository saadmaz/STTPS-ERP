import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanyId } from '../common/decorators/company.decorator';
import { HrService } from './hr.service';
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

@ApiTags('HR')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('hr')
export class HrController {
  constructor(private service: HrService) {}

  @Get('dashboard')
  dashboard(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getDashboard(tenantId, companyId);
  }

  // ─── Departments ─────────────────────────────────────────────────────────

  @Get('departments')
  getDepartments(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getDepartments(tenantId, companyId);
  }

  @Post('departments')
  createDepartment(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.service.createDepartment(tenantId, companyId, dto);
  }

  // ─── Positions ───────────────────────────────────────────────────────────

  @Get('positions')
  getPositions(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getPositions(tenantId, companyId);
  }

  @Post('positions')
  createPosition(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreatePositionDto,
  ) {
    return this.service.createPosition(tenantId, companyId, dto);
  }

  // ─── Employees ───────────────────────────────────────────────────────────

  @Get('employees')
  getEmployees(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query() q: any,
  ) {
    return this.service.getEmployees(tenantId, companyId, {
      status: q.status,
      departmentId: q.departmentId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Get('employees/:id')
  getEmployee(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.getEmployee(tenantId, companyId, id);
  }

  @Post('employees')
  createEmployee(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.service.createEmployee(tenantId, companyId, dto);
  }

  @Put('employees/:id')
  updateEmployee(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.service.updateEmployee(tenantId, companyId, id, dto);
  }

  // ─── Leave Types ─────────────────────────────────────────────────────────

  @Get('leave-types')
  getLeaveTypes(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getLeaveTypes(tenantId, companyId);
  }

  @Post('leave-types')
  createLeaveType(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateLeaveTypeDto,
  ) {
    return this.service.createLeaveType(tenantId, companyId, dto);
  }

  // ─── Leave Requests ──────────────────────────────────────────────────────

  @Get('leave')
  getLeaveRequests(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query() q: any,
  ) {
    return this.service.getLeaveRequests(tenantId, companyId, {
      status: q.status,
      employeeId: q.employeeId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Post('leave')
  createLeaveRequest(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.service.createLeaveRequest(tenantId, companyId, dto);
  }

  @Post('leave/:id/process')
  processLeaveRequest(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ApproveLeaveDto,
  ) {
    return this.service.processLeaveRequest(tenantId, companyId, userId, id, dto);
  }

  // ─── Payroll ─────────────────────────────────────────────────────────────

  @Get('payroll')
  getPayrollRuns(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getPayrollRuns(tenantId, companyId);
  }

  @Get('payroll/:id')
  getPayrollRun(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.getPayrollRun(tenantId, companyId, id);
  }

  @Post('payroll')
  createPayrollRun(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePayrollRunDto,
  ) {
    return this.service.createPayrollRun(tenantId, companyId, userId, dto);
  }

  @Post('payroll/:id/approve')
  approvePayrollRun(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.service.approvePayrollRun(tenantId, companyId, userId, id);
  }

  // ─── Recruitment ─────────────────────────────────────────────────────────

  @Get('recruitment/postings')
  getJobPostings(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query() q: any,
  ) {
    return this.service.getJobPostings(tenantId, companyId, {
      status: q.status,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Post('recruitment/postings')
  createJobPosting(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateJobPostingDto,
  ) {
    return this.service.createJobPosting(tenantId, companyId, dto);
  }

  @Post('recruitment/postings/:id/publish')
  publishJobPosting(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.publishJobPosting(tenantId, companyId, id);
  }

  @Get('recruitment/applications')
  getApplications(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query() q: any,
  ) {
    return this.service.getApplications(tenantId, companyId, {
      jobPostingId: q.jobPostingId,
      stage: q.stage,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Post('recruitment/applications')
  createApplication(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateJobApplicationDto,
  ) {
    return this.service.createApplication(tenantId, companyId, dto);
  }

  @Put('recruitment/applications/:id/stage')
  updateApplicationStage(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStageDto,
  ) {
    return this.service.updateApplicationStage(tenantId, companyId, id, dto);
  }
}
