import { Controller, Get, Post, Param, Body, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { EhsService } from './ehs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanyId } from '../common/decorators/company.decorator';
import { CreateIncidentDto, InvestigateIncidentDto, CreateRiskAssessmentDto, CreatePermitDto, ApprovePermitDto } from './dto/create-ehs.dto';

@UseGuards(JwtAuthGuard)
@Controller('ehs')
export class EhsController {
  constructor(private readonly ehs: EhsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.ehs.getDashboard(tenantId, companyId);
  }

  // Incidents
  @Get('incidents')
  listIncidents(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.ehs.getIncidents(tenantId, companyId, { status, type, page, limit });
  }

  @Post('incidents')
  createIncident(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateIncidentDto) {
    return this.ehs.createIncident(tenantId, companyId, dto);
  }

  @Post('incidents/:id/investigate')
  investigate(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: InvestigateIncidentDto) {
    return this.ehs.investigateIncident(tenantId, companyId, id, dto);
  }

  @Post('incidents/:id/close')
  closeIncident(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.ehs.closeIncident(tenantId, companyId, id);
  }

  // Risk Assessments
  @Get('risks')
  listRisks(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.ehs.getRisks(tenantId, companyId, { status, page, limit });
  }

  @Post('risks')
  createRisk(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateRiskAssessmentDto) {
    return this.ehs.createRisk(tenantId, companyId, dto);
  }

  @Post('risks/:id/activate')
  activateRisk(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.ehs.activateRisk(tenantId, companyId, id);
  }

  // Permits to Work
  @Get('permits')
  listPermits(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.ehs.getPermits(tenantId, companyId, { status, page, limit });
  }

  @Post('permits')
  createPermit(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreatePermitDto) {
    return this.ehs.createPermit(tenantId, companyId, dto);
  }

  @Post('permits/:id/approve')
  approvePermit(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: ApprovePermitDto) {
    return this.ehs.approvePermit(tenantId, companyId, id, dto);
  }

  @Post('permits/:id/close')
  closePermit(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.ehs.closePermit(tenantId, companyId, id);
  }
}
