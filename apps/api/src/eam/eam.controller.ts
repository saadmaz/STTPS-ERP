import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanyId } from '../common/decorators/company.decorator';
import { EamService } from './eam.service';
import {
  CreateAssetCategoryDto,
  CreateAssetDto,
  CreateMaintenancePlanDto,
  CreateWorkOrderDto,
  CompleteWorkOrderDto,
  RegisterIoTDeviceDto,
  RecordIoTReadingDto,
} from './dto/create-eam.dto';

@ApiTags('EAM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('eam')
export class EamController {
  constructor(private service: EamService) {}

  @Get('dashboard')
  dashboard(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getDashboard(tenantId, companyId);
  }

  // Asset Categories
  @Get('categories')
  getCategories(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getCategories(tenantId, companyId);
  }

  @Post('categories')
  createCategory(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateAssetCategoryDto,
  ) {
    return this.service.createCategory(tenantId, companyId, dto);
  }

  // Assets
  @Get('assets')
  getAssets(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query() q: any,
  ) {
    return this.service.getAssets(tenantId, companyId, {
      status: q.status,
      categoryId: q.categoryId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Get('assets/:id')
  getAsset(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.getAsset(tenantId, companyId, id);
  }

  @Post('assets')
  createAsset(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateAssetDto,
  ) {
    return this.service.createAsset(tenantId, companyId, dto);
  }

  // Maintenance Plans
  @Get('plans')
  getMaintenancePlans(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query() q: any,
  ) {
    return this.service.getMaintenancePlans(tenantId, companyId, {
      assetId: q.assetId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Post('plans')
  createMaintenancePlan(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateMaintenancePlanDto,
  ) {
    return this.service.createMaintenancePlan(tenantId, companyId, dto);
  }

  @Post('plans/:id/trigger')
  triggerMaintenancePlan(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.service.triggerMaintenancePlan(tenantId, companyId, userId, id);
  }

  // Work Orders
  @Get('work-orders')
  getWorkOrders(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query() q: any,
  ) {
    return this.service.getWorkOrders(tenantId, companyId, {
      status: q.status,
      assetId: q.assetId,
      type: q.type,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Post('work-orders')
  createWorkOrder(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateWorkOrderDto,
  ) {
    return this.service.createWorkOrder(tenantId, companyId, dto);
  }

  @Post('work-orders/:id/start')
  startWorkOrder(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.startWorkOrder(tenantId, companyId, id);
  }

  @Post('work-orders/:id/complete')
  completeWorkOrder(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: CompleteWorkOrderDto,
  ) {
    return this.service.completeWorkOrder(tenantId, companyId, id, dto);
  }

  // IoT Devices
  @Get('iot/devices')
  getIoTDevices(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getIoTDevices(tenantId, companyId);
  }

  @Post('iot/devices')
  registerDevice(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: RegisterIoTDeviceDto,
  ) {
    return this.service.registerDevice(tenantId, companyId, dto);
  }

  @Post('iot/devices/:id/readings')
  recordReading(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: RecordIoTReadingDto,
  ) {
    return this.service.recordReading(tenantId, id, dto);
  }

  @Get('iot/devices/:id/readings')
  getDeviceReadings(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Query() q: any,
  ) {
    return this.service.getDeviceReadings(tenantId, id, { metric: q.metric, limit: Number(q.limit) || 100 });
  }
}
