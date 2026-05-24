import { Controller, Get, Post, Param, Body, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { QualityService } from './quality.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanyId } from '../common/decorators/company.decorator';
import {
  CreateInspectionTemplateDto,
  CreateInspectionDto,
  CompleteInspectionDto,
  CreateNCRDto,
  CreateNCRActionDto,
  CloseNCRDto,
  CreateAuditDto,
  CompleteAuditDto,
} from './dto/create-quality.dto';

@UseGuards(JwtAuthGuard)
@Controller('quality')
export class QualityController {
  constructor(private readonly quality: QualityService) {}

  @Get('dashboard')
  dashboard(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.quality.getDashboard(tenantId, companyId);
  }

  // Templates
  @Get('templates')
  listTemplates(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.quality.getTemplates(tenantId, companyId);
  }

  @Post('templates')
  createTemplate(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateInspectionTemplateDto) {
    return this.quality.createTemplate(tenantId, companyId, dto);
  }

  // Inspections
  @Get('inspections')
  listInspections(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.quality.getInspections(tenantId, companyId, { status, page, limit });
  }

  @Get('inspections/:id')
  getInspection(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.quality.getInspection(tenantId, companyId, id);
  }

  @Post('inspections')
  createInspection(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateInspectionDto) {
    return this.quality.createInspection(tenantId, companyId, dto);
  }

  @Post('inspections/:id/complete')
  completeInspection(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: CompleteInspectionDto) {
    return this.quality.completeInspection(tenantId, companyId, id, dto);
  }

  // NCRs
  @Get('ncr')
  listNCRs(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.quality.getNCRs(tenantId, companyId, { status, severity, page, limit });
  }

  @Post('ncr')
  createNCR(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateNCRDto) {
    return this.quality.createNCR(tenantId, companyId, dto);
  }

  @Post('ncr/:id/actions')
  addAction(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateNCRActionDto) {
    return this.quality.addNCRAction(id, tenantId, companyId, dto);
  }

  @Post('ncr/:id/close')
  closeNCR(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CloseNCRDto) {
    return this.quality.closeNCR(id, tenantId, companyId, dto);
  }

  // Audits
  @Get('audits')
  listAudits(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.quality.getAudits(tenantId, companyId, { status, page, limit });
  }

  @Post('audits')
  createAudit(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateAuditDto) {
    return this.quality.createAudit(tenantId, companyId, dto);
  }

  @Post('audits/:id/start')
  startAudit(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.quality.startAudit(tenantId, companyId, id);
  }

  @Post('audits/:id/complete')
  completeAudit(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: CompleteAuditDto) {
    return this.quality.completeAudit(tenantId, companyId, id, dto);
  }
}
