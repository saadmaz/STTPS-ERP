import { Controller, Get, Post, Put, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyGuard } from '../auth/guards/company.guard';
import { ProcurementService } from './procurement.service';
import { CreatePRDto, CreatePODto, CreateGRNDto } from './dto/create-pr.dto';

@Controller('procurement')
@UseGuards(JwtAuthGuard, CompanyGuard)
export class ProcurementController {
  constructor(private service: ProcurementService) {}

  @Get('dashboard')
  dashboard(@Req() req: any) {
    return this.service.getDashboard(req.tenantId, req.companyId);
  }

  @Get('vendors')
  getVendors(@Req() req: any, @Query() q: any) {
    return this.service.getVendors(req.tenantId, req.companyId, {
      search: q.search,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  // Purchase Requisitions
  @Get('requisitions')
  getPRs(@Req() req: any, @Query() q: any) {
    return this.service.getPRs(req.tenantId, req.companyId, {
      status: q.status,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Get('requisitions/:id')
  getPR(@Req() req: any, @Param('id') id: string) {
    return this.service.getPR(req.tenantId, req.companyId, id);
  }

  @Post('requisitions')
  createPR(@Req() req: any, @Body() dto: CreatePRDto) {
    return this.service.createPR(req.tenantId, req.companyId, req.user.id, dto);
  }

  @Post('requisitions/:id/approve')
  approvePR(@Req() req: any, @Param('id') id: string) {
    return this.service.approvePR(req.tenantId, req.companyId, req.user.id, id);
  }

  // Purchase Orders
  @Get('orders')
  getPOs(@Req() req: any, @Query() q: any) {
    return this.service.getPOs(req.tenantId, req.companyId, {
      status: q.status,
      vendorId: q.vendorId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Get('orders/:id')
  getPO(@Req() req: any, @Param('id') id: string) {
    return this.service.getPO(req.tenantId, req.companyId, id);
  }

  @Post('orders')
  createPO(@Req() req: any, @Body() dto: CreatePODto) {
    return this.service.createPO(req.tenantId, req.companyId, req.user.id, dto);
  }

  @Post('orders/:id/approve')
  approvePO(@Req() req: any, @Param('id') id: string) {
    return this.service.approvePO(req.tenantId, req.companyId, req.user.id, id);
  }

  // Goods Receipts
  @Get('receipts')
  getGRNs(@Req() req: any, @Query() q: any) {
    return this.service.getGRNs(req.tenantId, req.companyId, {
      poId: q.poId,
      status: q.status,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Get('receipts/:id')
  getGRN(@Req() req: any, @Param('id') id: string) {
    return this.service.getGRN(req.tenantId, req.companyId, id);
  }

  @Post('receipts')
  createGRN(@Req() req: any, @Body() dto: CreateGRNDto) {
    return this.service.createGRN(req.tenantId, req.companyId, req.user.id, dto);
  }

  @Post('receipts/:id/post')
  postGRN(@Req() req: any, @Param('id') id: string) {
    return this.service.postGRN(req.tenantId, req.companyId, req.user.id, id);
  }
}
