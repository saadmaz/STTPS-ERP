import { Body, Controller, Get, HttpCode, Module, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { ListQueryDto } from "../platform/crud/list-query.dto.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { InventoryLedger } from "./inventory.ledger.js";
import {
  AdjustmentService,
  CountService,
  InventoryReports,
  InventorySettingsService,
  LocationService,
  TransferService,
  WarehouseService,
} from "./inventory.services.js";
import {
  CreateAdjustmentDto,
  CreateLocationDto,
  CreateTransferDto,
  CreateWarehouseDto,
  InventorySettingsDto,
  RecordCountDto,
  ReorderDto,
  StartCountDto,
  UpdateAdjustmentDto,
  UpdateLocationDto,
  UpdateTransferDto,
  UpdateWarehouseDto,
} from "./inventory.dto.js";

@ApiTags("Inventory")
@ApiBearerAuth()
@RequireModule("inventory")
@Controller("inventory")
class InventoryController {
  constructor(
    private readonly adjustments: AdjustmentService,
    private readonly transfers: TransferService,
    private readonly counts: CountService,
    private readonly reports: InventoryReports,
    private readonly settings: InventorySettingsService,
  ) {}

  // Stock positions and reports
  @Get("stock")
  @RequirePermission("inventory.stock.view")
  @ApiOperation({ summary: "Stock on hand by warehouse and lot" })
  stock(@Ctx() ctx: RequestContext, @Query("productId") productId?: string, @Query("warehouseId") warehouseId?: string) {
    return this.reports.onHand(ctx, { productId, warehouseId });
  }

  @Get("stock/:productId")
  @RequirePermission("inventory.stock.view")
  @ApiOperation({ summary: "One product's position: on hand, reserved, available, in transit, value" })
  productStock(@Ctx() ctx: RequestContext, @Param("productId") productId: string) {
    return this.reports.summary(ctx, productId);
  }

  @Put("stock/:productId/reorder")
  @RequirePermission("inventory.stock.edit")
  reorderSettings(@Ctx() ctx: RequestContext, @Param("productId") productId: string, @Body(validated(ReorderDto)) dto: ReorderDto) {
    return this.reports.setReorder(ctx, productId, dto);
  }

  @Get("movements")
  @RequirePermission("inventory.stock.view")
  @ApiOperation({ summary: "The stock ledger" })
  movements(@Ctx() ctx: RequestContext, @Query("productId") productId?: string, @Query("warehouseId") warehouseId?: string, @Query("type") type?: string, @Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    return this.reports.movements(ctx, { productId, warehouseId, type, cursor, limit: limit ? Number(limit) : undefined });
  }

  @Get("reports/valuation")
  @RequirePermission("inventory.valuation.view")
  valuation(@Ctx() ctx: RequestContext) {
    return this.reports.valuation(ctx);
  }

  @Get("reports/reorder")
  @RequirePermission("inventory.stock.view")
  reorder(@Ctx() ctx: RequestContext) {
    return this.reports.reorder(ctx);
  }

  @Get("reports/expiring")
  @RequirePermission("inventory.stock.view")
  expiring(@Ctx() ctx: RequestContext, @Query("days") days?: string) {
    return this.reports.expiring(ctx, Number(days ?? 30));
  }

  @Get("reports/slow-moving")
  @RequirePermission("inventory.valuation.view")
  slowMoving(@Ctx() ctx: RequestContext, @Query("days") days?: string) {
    return this.reports.slowMoving(ctx, Number(days ?? 90));
  }

  @Get("reports/ageing")
  @RequirePermission("inventory.valuation.view")
  ageing(@Ctx() ctx: RequestContext) {
    return this.reports.ageing(ctx);
  }

  // Settings
  @Get("settings")
  @RequirePermission("inventory.stock.view")
  getSettings(@Ctx() ctx: RequestContext) {
    return this.settings.get(ctx);
  }

  @Put("settings")
  @RequirePermission("inventory.settings.edit")
  putSettings(@Ctx() ctx: RequestContext, @Body(validated(InventorySettingsDto)) dto: InventorySettingsDto) {
    return this.settings.update(ctx, dto);
  }

  // Document actions
  @Post("adjustments/:id/submit")
  @HttpCode(200)
  @RequirePermission("inventory.adjustment.create")
  @ApiOperation({ summary: "Post the adjustment, or send it for approval when a workflow applies" })
  submitAdjustment(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.adjustments.submit(ctx, id);
  }

  @Post("adjustments/:id/cancel")
  @HttpCode(200)
  @RequirePermission("inventory.adjustment.edit")
  cancelAdjustment(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.adjustments.cancel(ctx, id);
  }

  @Post("transfers/:id/ship")
  @HttpCode(200)
  @RequirePermission("inventory.transfer.edit")
  ship(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.transfers.ship(ctx, id);
  }

  @Post("transfers/:id/receive")
  @HttpCode(200)
  @RequirePermission("inventory.transfer.edit")
  receive(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.transfers.receive(ctx, id);
  }

  @Post("transfers/:id/cancel")
  @HttpCode(200)
  @RequirePermission("inventory.transfer.edit")
  cancelTransfer(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.transfers.cancel(ctx, id);
  }

  // Counts (custom: starting one snapshots and locks a warehouse)
  @Get("counts")
  @RequirePermission("inventory.count.view")
  listCounts(@Ctx() ctx: RequestContext, @Query(validated(ListQueryDto)) q: ListQueryDto) {
    return this.counts.list(ctx, q);
  }

  @Get("counts/:id")
  @RequirePermission("inventory.count.view")
  getCount(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.counts.get(ctx, id);
  }

  @Post("counts")
  @RequirePermission("inventory.count.create")
  @ApiOperation({ summary: "Start a count: snapshots expected quantities and locks the warehouse" })
  startCount(@Ctx() ctx: RequestContext, @Body(validated(StartCountDto)) dto: StartCountDto) {
    return this.counts.start(ctx, dto);
  }

  @Put("counts/:id/entries")
  @RequirePermission("inventory.count.edit")
  recordCount(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RecordCountDto)) dto: RecordCountDto) {
    return this.counts.record(ctx, id, dto);
  }

  @Post("counts/:id/post")
  @HttpCode(200)
  @RequirePermission("inventory.count.approve")
  postCount(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.counts.post(ctx, id);
  }

  @Post("counts/:id/cancel")
  @HttpCode(200)
  @RequirePermission("inventory.count.edit")
  cancelCount(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.counts.cancel(ctx, id);
  }
}

const crud = [
  createMasterDataController({ path: "inventory/warehouses", tag: "Inventory: Warehouses", module: "inventory", permission: "inventory.warehouse", service: WarehouseService, createDto: CreateWarehouseDto, updateDto: UpdateWarehouseDto }),
  createMasterDataController({ path: "inventory/locations", tag: "Inventory: Locations", module: "inventory", permission: "inventory.warehouse", service: LocationService, createDto: CreateLocationDto, updateDto: UpdateLocationDto }),
  createMasterDataController({ path: "inventory/adjustments", tag: "Inventory: Adjustments", module: "inventory", permission: "inventory.adjustment", service: AdjustmentService, createDto: CreateAdjustmentDto, updateDto: UpdateAdjustmentDto }),
  createMasterDataController({ path: "inventory/transfers", tag: "Inventory: Transfers", module: "inventory", permission: "inventory.transfer", service: TransferService, createDto: CreateTransferDto, updateDto: UpdateTransferDto }),
];

const SERVICES = [InventoryLedger, WarehouseService, LocationService, InventorySettingsService, AdjustmentService, TransferService, CountService, InventoryReports];

@Module({
  controllers: [InventoryController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class InventoryModule {}
