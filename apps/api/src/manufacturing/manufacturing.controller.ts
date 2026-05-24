import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanyId } from '../common/decorators/company.decorator';
import { ManufacturingService } from './manufacturing.service';
import {
  CreateBOMDto,
  CreateWorkCenterDto,
  CreateRoutingDto,
  CreateProductionOrderDto,
  RecordProductionDto,
  RunMRPDto,
} from './dto/create-manufacturing.dto';

@ApiTags('Manufacturing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('manufacturing')
export class ManufacturingController {
  constructor(private service: ManufacturingService) {}

  @Get('dashboard')
  dashboard(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getDashboard(tenantId, companyId);
  }

  // BOM
  @Get('bom')
  getBOMs(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getBOMs(tenantId, companyId, {
      itemId: q.itemId, status: q.status, page: Number(q.page) || 1, limit: Number(q.limit) || 25,
    });
  }

  @Get('bom/:id')
  getBOM(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getBOM(tenantId, companyId, id);
  }

  @Post('bom')
  createBOM(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateBOMDto) {
    return this.service.createBOM(tenantId, companyId, dto);
  }

  @Post('bom/:id/activate')
  activateBOM(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.activateBOM(tenantId, companyId, id);
  }

  // Work Centers
  @Get('work-centers')
  getWorkCenters(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getWorkCenters(tenantId, companyId);
  }

  @Post('work-centers')
  createWorkCenter(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateWorkCenterDto) {
    return this.service.createWorkCenter(tenantId, companyId, dto);
  }

  // Routings
  @Get('routings')
  getRoutings(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getRoutings(tenantId, companyId);
  }

  @Get('routings/:id')
  getRouting(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getRouting(tenantId, companyId, id);
  }

  @Post('routings')
  createRouting(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateRoutingDto) {
    return this.service.createRouting(tenantId, companyId, dto);
  }

  // Production Orders
  @Get('orders')
  getOrders(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getOrders(tenantId, companyId, {
      status: q.status, itemId: q.itemId, page: Number(q.page) || 1, limit: Number(q.limit) || 25,
    });
  }

  @Get('orders/:id')
  getOrder(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getOrder(tenantId, companyId, id);
  }

  @Post('orders')
  createOrder(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateProductionOrderDto) {
    return this.service.createOrder(tenantId, companyId, userId, dto);
  }

  @Post('orders/:id/release')
  releaseOrder(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.releaseOrder(tenantId, companyId, userId, id);
  }

  @Post('orders/:id/produce')
  recordProduction(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: RecordProductionDto) {
    return this.service.recordProduction(tenantId, companyId, userId, id, dto);
  }

  // MRP
  @Get('mrp')
  getMRPPlans(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getMRPPlans(tenantId, companyId);
  }

  @Get('mrp/:id')
  getMRPPlan(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getMRPPlan(tenantId, companyId, id);
  }

  @Post('mrp/run')
  runMRP(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: RunMRPDto) {
    return this.service.runMRP(tenantId, companyId, userId, dto);
  }
}
