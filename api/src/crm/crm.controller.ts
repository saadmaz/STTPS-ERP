import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanyId } from '../common/decorators/company.decorator';
import { CrmService } from './crm.service';
import {
  CreateLeadDto,
  CreateCrmAccountDto,
  CreateCrmContactDto,
  CreateOpportunityDto,
  CreateActivityDto,
} from './dto/create-crm.dto';

@ApiTags('CRM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('crm')
export class CrmController {
  constructor(private service: CrmService) {}

  @Get('dashboard')
  dashboard(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getDashboard(tenantId, companyId);
  }

  // Leads
  @Get('leads')
  getLeads(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getLeads(tenantId, companyId, {
      status: q.status, search: q.search, page: Number(q.page) || 1, limit: Number(q.limit) || 25,
    });
  }

  @Get('leads/:id')
  getLead(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getLead(tenantId, companyId, id);
  }

  @Post('leads')
  createLead(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateLeadDto) {
    return this.service.createLead(tenantId, companyId, userId, dto);
  }

  @Put('leads/:id')
  updateLead(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: CreateLeadDto) {
    return this.service.updateLead(tenantId, companyId, id, dto);
  }

  // Accounts
  @Get('accounts')
  getAccounts(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getAccounts(tenantId, companyId, {
      search: q.search, page: Number(q.page) || 1, limit: Number(q.limit) || 25,
    });
  }

  @Get('accounts/:id')
  getAccount(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getAccount(tenantId, companyId, id);
  }

  @Post('accounts')
  createAccount(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateCrmAccountDto) {
    return this.service.createAccount(tenantId, companyId, userId, dto);
  }

  @Put('accounts/:id')
  updateAccount(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: CreateCrmAccountDto) {
    return this.service.updateAccount(tenantId, companyId, id, dto);
  }

  // Contacts
  @Get('contacts')
  getContacts(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getContacts(tenantId, companyId, {
      accountId: q.accountId, search: q.search, page: Number(q.page) || 1, limit: Number(q.limit) || 25,
    });
  }

  @Get('contacts/:id')
  getContact(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getContact(tenantId, companyId, id);
  }

  @Post('contacts')
  createContact(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateCrmContactDto) {
    return this.service.createContact(tenantId, companyId, userId, dto);
  }

  @Put('contacts/:id')
  updateContact(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: CreateCrmContactDto) {
    return this.service.updateContact(tenantId, companyId, id, dto);
  }

  // Opportunities
  @Get('opportunities')
  getOpportunities(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getOpportunities(tenantId, companyId, {
      stage: q.stage, status: q.status, accountId: q.accountId, page: Number(q.page) || 1, limit: Number(q.limit) || 25,
    });
  }

  @Get('opportunities/:id')
  getOpportunity(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getOpportunity(tenantId, companyId, id);
  }

  @Post('opportunities')
  createOpportunity(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateOpportunityDto) {
    return this.service.createOpportunity(tenantId, companyId, userId, dto);
  }

  @Put('opportunities/:id')
  updateOpportunity(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: CreateOpportunityDto) {
    return this.service.updateOpportunity(tenantId, companyId, id, dto);
  }

  // Activities
  @Get('activities')
  getActivities(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getActivities(tenantId, companyId, {
      status: q.status, type: q.type, page: Number(q.page) || 1, limit: Number(q.limit) || 25,
    });
  }

  @Post('activities')
  createActivity(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateActivityDto) {
    return this.service.createActivity(tenantId, companyId, userId, dto);
  }

  @Post('activities/:id/complete')
  completeActivity(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.completeActivity(tenantId, companyId, userId, id);
  }
}
