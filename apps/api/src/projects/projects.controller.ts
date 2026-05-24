import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanyId } from '../common/decorators/company.decorator';
import { CreateProjectDto, UpdateProjectStatusDto, CreateTaskDto, UpdateTaskDto, CreateTimesheetDto, ApproveTimesheetDto, CreateBillingDto } from './dto/create-projects.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.projects.getDashboard(tenantId, companyId);
  }

  // Projects
  @Get()
  listProjects(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.projects.getProjects(tenantId, companyId, { status, page, limit });
  }

  @Get(':id')
  getProject(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.projects.getProject(tenantId, companyId, id);
  }

  @Post()
  createProject(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateProjectDto) {
    return this.projects.createProject(tenantId, companyId, dto);
  }

  @Post(':id/status')
  updateStatus(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: UpdateProjectStatusDto) {
    return this.projects.updateProjectStatus(tenantId, companyId, id, dto);
  }

  // Tasks
  @Get('tasks/list')
  listTasks(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.projects.getTasks(tenantId, companyId, { projectId, status, assigneeId, page, limit });
  }

  @Post('tasks')
  createTask(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateTaskDto) {
    return this.projects.createTask(tenantId, companyId, dto);
  }

  @Put('tasks/:id')
  updateTask(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.projects.updateTask(tenantId, companyId, id, dto);
  }

  // Timesheets
  @Get('timesheets/list')
  listTimesheets(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query('projectId') projectId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.projects.getTimesheets(tenantId, companyId, { projectId, employeeId, status, page, limit });
  }

  @Post('timesheets')
  createTimesheet(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateTimesheetDto) {
    return this.projects.createTimesheet(tenantId, companyId, dto);
  }

  @Post('timesheets/:id/approve')
  approveTimesheet(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: ApproveTimesheetDto) {
    return this.projects.approveTimesheet(tenantId, companyId, id, dto);
  }

  // Billing
  @Get('billing/list')
  listBillings(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.projects.getBillings(tenantId, companyId, projectId);
  }

  @Post('billing')
  createBilling(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateBillingDto) {
    return this.projects.createBilling(tenantId, companyId, dto);
  }

  @Post('billing/:id/invoice')
  markInvoiced(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.projects.markBillingInvoiced(tenantId, companyId, id);
  }
}
