import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanyId } from '../common/decorators/company.decorator';
import { ProcurementService } from './procurement.service';
import { CreatePRDto, CreatePODto, CreateGRNDto } from './dto/create-pr.dto';

@ApiTags('Procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('procurement')
export class ProcurementController {
  constructor(private service: ProcurementService) {}

  @Get('dashboard')
  dashboard(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getDashboard(tenantId, companyId);
  }

  @Get('vendors')
  getVendors(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getVendors(tenantId, companyId, {
      search: q.search,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  // Purchase Requisitions
  @Get('requisitions')
  getPRs(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getPRs(tenantId, companyId, {
      status: q.status,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Get('requisitions/:id')
  getPR(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getPR(tenantId, companyId, id);
  }

  @Post('requisitions')
  createPR(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreatePRDto) {
    return this.service.createPR(tenantId, companyId, userId, dto);
  }

  @Post('requisitions/:id/approve')
  approvePR(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.approvePR(tenantId, companyId, userId, id);
  }

  // Purchase Orders
  @Get('orders')
  getPOs(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getPOs(tenantId, companyId, {
      status: q.status,
      vendorId: q.vendorId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Get('orders/:id')
  getPO(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getPO(tenantId, companyId, id);
  }

  @Post('orders')
  createPO(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreatePODto) {
    return this.service.createPO(tenantId, companyId, userId, dto);
  }

  @Post('orders/:id/approve')
  approvePO(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.approvePO(tenantId, companyId, userId, id);
  }

  // Goods Receipts
  @Get('receipts')
  getGRNs(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getGRNs(tenantId, companyId, {
      poId: q.poId,
      status: q.status,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Get('receipts/:id')
  getGRN(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getGRN(tenantId, companyId, id);
  }

  @Post('receipts')
  createGRN(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateGRNDto) {
    return this.service.createGRN(tenantId, companyId, userId, dto);
  }

  @Post('receipts/:id/post')
  postGRN(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.postGRN(tenantId, companyId, userId, id);
  }
}
