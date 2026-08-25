import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanyId } from '../common/decorators/company.decorator';
import { InventoryService } from './inventory.service';
import {
  CreateItemDto,
  CreateItemCategoryDto,
  CreateWarehouseDto,
  CreateStorageLocationDto,
  CreateStockMovementDto,
  CreateStockCountDto,
} from './dto/create-item.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private service: InventoryService) {}

  @Get('summary')
  summary(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getSummary(tenantId, companyId);
  }

  // Categories
  @Get('categories')
  getCategories(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getCategories(tenantId, companyId);
  }

  @Post('categories')
  createCategory(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateItemCategoryDto) {
    return this.service.createCategory(tenantId, companyId, userId, dto);
  }

  // Items
  @Get('items')
  getItems(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getItems(tenantId, companyId, {
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
      search: q.search,
      categoryId: q.categoryId,
    });
  }

  @Get('items/:id')
  getItem(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getItem(tenantId, companyId, id);
  }

  @Post('items')
  createItem(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateItemDto) {
    return this.service.createItem(tenantId, companyId, userId, dto);
  }

  @Put('items/:id')
  updateItem(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string, @Body() dto: Partial<CreateItemDto>) {
    return this.service.updateItem(tenantId, companyId, id, dto);
  }

  // Warehouses
  @Get('warehouses')
  getWarehouses(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getWarehouses(tenantId, companyId);
  }

  @Post('warehouses')
  createWarehouse(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreateWarehouseDto) {
    return this.service.createWarehouse(tenantId, companyId, dto);
  }

  @Post('warehouses/locations')
  createLocation(@Body() dto: CreateStorageLocationDto) {
    return this.service.createLocation(dto);
  }

  // Stock levels
  @Get('stock-levels')
  getStockLevels(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getStockLevels(tenantId, companyId, {
      warehouseId: q.warehouseId,
      itemId: q.itemId,
    });
  }

  // Stock movements
  @Get('movements')
  getMovements(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getMovements(tenantId, companyId, {
      itemId: q.itemId,
      warehouseId: q.warehouseId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 50,
    });
  }

  @Post('movements')
  createMovement(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateStockMovementDto) {
    return this.service.createMovement(tenantId, companyId, userId, dto);
  }

  // Stock counts
  @Get('counts')
  getStockCounts(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getStockCounts(tenantId, companyId);
  }

  @Get('counts/:id')
  getStockCount(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getStockCount(tenantId, companyId, id);
  }

  @Post('counts')
  createStockCount(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateStockCountDto) {
    return this.service.createStockCount(tenantId, companyId, userId, dto);
  }

  @Post('counts/:id/post')
  postStockCount(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.postStockCount(tenantId, companyId, userId, id);
  }
}
