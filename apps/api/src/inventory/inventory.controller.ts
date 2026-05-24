import { Controller, Get, Post, Put, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyGuard } from '../auth/guards/company.guard';
import { InventoryService } from './inventory.service';
import {
  CreateItemDto,
  CreateItemCategoryDto,
  CreateWarehouseDto,
  CreateStorageLocationDto,
  CreateStockMovementDto,
  CreateStockCountDto,
} from './dto/create-item.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard, CompanyGuard)
export class InventoryController {
  constructor(private service: InventoryService) {}

  @Get('summary')
  summary(@Req() req: any) {
    return this.service.getSummary(req.tenantId, req.companyId);
  }

  // Categories
  @Get('categories')
  getCategories(@Req() req: any) {
    return this.service.getCategories(req.tenantId, req.companyId);
  }

  @Post('categories')
  createCategory(@Req() req: any, @Body() dto: CreateItemCategoryDto) {
    return this.service.createCategory(req.tenantId, req.companyId, req.user.id, dto);
  }

  // Items
  @Get('items')
  getItems(@Req() req: any, @Query() q: any) {
    return this.service.getItems(req.tenantId, req.companyId, {
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
      search: q.search,
      categoryId: q.categoryId,
    });
  }

  @Get('items/:id')
  getItem(@Req() req: any, @Param('id') id: string) {
    return this.service.getItem(req.tenantId, req.companyId, id);
  }

  @Post('items')
  createItem(@Req() req: any, @Body() dto: CreateItemDto) {
    return this.service.createItem(req.tenantId, req.companyId, req.user.id, dto);
  }

  @Put('items/:id')
  updateItem(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreateItemDto>) {
    return this.service.updateItem(req.tenantId, req.companyId, id, dto);
  }

  // Warehouses
  @Get('warehouses')
  getWarehouses(@Req() req: any) {
    return this.service.getWarehouses(req.tenantId, req.companyId);
  }

  @Post('warehouses')
  createWarehouse(@Req() req: any, @Body() dto: CreateWarehouseDto) {
    return this.service.createWarehouse(req.tenantId, req.companyId, dto);
  }

  @Post('warehouses/locations')
  createLocation(@Body() dto: CreateStorageLocationDto) {
    return this.service.createLocation(dto);
  }

  // Stock levels
  @Get('stock-levels')
  getStockLevels(@Req() req: any, @Query() q: any) {
    return this.service.getStockLevels(req.tenantId, req.companyId, {
      warehouseId: q.warehouseId,
      itemId: q.itemId,
    });
  }

  // Stock movements
  @Get('movements')
  getMovements(@Req() req: any, @Query() q: any) {
    return this.service.getMovements(req.tenantId, req.companyId, {
      itemId: q.itemId,
      warehouseId: q.warehouseId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 50,
    });
  }

  @Post('movements')
  createMovement(@Req() req: any, @Body() dto: CreateStockMovementDto) {
    return this.service.createMovement(req.tenantId, req.companyId, req.user.id, dto);
  }

  // Stock counts
  @Get('counts')
  getStockCounts(@Req() req: any) {
    return this.service.getStockCounts(req.tenantId, req.companyId);
  }

  @Get('counts/:id')
  getStockCount(@Req() req: any, @Param('id') id: string) {
    return this.service.getStockCount(req.tenantId, req.companyId, id);
  }

  @Post('counts')
  createStockCount(@Req() req: any, @Body() dto: CreateStockCountDto) {
    return this.service.createStockCount(req.tenantId, req.companyId, req.user.id, dto);
  }

  @Post('counts/:id/post')
  postStockCount(@Req() req: any, @Param('id') id: string) {
    return this.service.postStockCount(req.tenantId, req.companyId, req.user.id, id);
  }
}
