import { Body, Controller, HttpCode, Module, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { SalesModule } from "../sales/sales.module.js";
import { ProcurementModule } from "../procurement/procurement.module.js";
import {
  CompleteOperationDto, CreateBomDto, CreateMachineDto, CreateProductionOrderDto, CreateRoutingDto, CreateWorkCentreDto,
  LogDowntimeDto, RecordOutputDto, UpdateBomDto, UpdateMachineDto, UpdateProductionOrderDto, UpdateRoutingDto, UpdateWorkCentreDto,
} from "./manufacturing.dto.js";
import { BomService, MachineService, ProductionOrderService, RoutingService, WorkCentreService } from "./manufacturing.services.js";
import { CreateDemandForecastDto, RunMrpDto, UpdateDemandForecastDto, UpdateMrpRunDto } from "./manufacturing-mrp.dto.js";
import { DemandForecastService, MrpService } from "./manufacturing-mrp.services.js";

@ApiTags("Manufacturing")
@ApiBearerAuth()
@RequireModule("manufacturing")
@Controller("manufacturing")
class ManufacturingActionsController {
  constructor(
    private readonly boms: BomService,
    private readonly routings: RoutingService,
    private readonly orders: ProductionOrderService,
    private readonly mrp: MrpService,
  ) {}

  @Post("boms/:id/activate")
  @HttpCode(200)
  @RequirePermission("manufacturing.bom.edit")
  activateBom(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.boms.activate(ctx, id);
  }

  @Post("boms/:id/obsolete")
  @HttpCode(200)
  @RequirePermission("manufacturing.bom.edit")
  obsoleteBom(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.boms.obsolete(ctx, id);
  }

  @Post("routings/:id/activate")
  @HttpCode(200)
  @RequirePermission("manufacturing.routing.edit")
  activateRouting(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.routings.activate(ctx, id);
  }

  @Post("production-orders/:id/release")
  @HttpCode(200)
  @RequirePermission("manufacturing.productionOrder.edit")
  @ApiOperation({ summary: "Releases a planned order for production" })
  release(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.orders.release(ctx, id);
  }

  @Post("production-orders/:id/start")
  @HttpCode(200)
  @RequirePermission("manufacturing.productionOrder.edit")
  start(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.orders.start(ctx, id);
  }

  @Post("production-orders/:id/operations/complete")
  @HttpCode(200)
  @RequirePermission("manufacturing.productionOrder.edit")
  @ApiOperation({ summary: "Marks one routing operation complete with its actual minutes" })
  completeOperation(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CompleteOperationDto)) dto: CompleteOperationDto) {
    return this.orders.completeOperation(ctx, id, dto);
  }

  @Post("production-orders/:id/downtime")
  @HttpCode(200)
  @RequirePermission("manufacturing.productionOrder.edit")
  logDowntime(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(LogDowntimeDto)) dto: LogDowntimeDto) {
    return this.orders.logDowntime(ctx, id, dto);
  }

  @Post("production-orders/:id/output")
  @HttpCode(200)
  @RequirePermission("manufacturing.productionOrder.edit")
  @ApiOperation({ summary: "Records good output and scrap; completes the order once planned quantity is reached" })
  recordOutput(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RecordOutputDto)) dto: RecordOutputDto) {
    return this.orders.recordOutput(ctx, id, dto);
  }

  @Post("production-orders/:id/cancel")
  @HttpCode(200)
  @RequirePermission("manufacturing.productionOrder.edit")
  cancel(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.orders.cancel(ctx, id);
  }

  @Post("mrp-runs/:id/production/:lineId/convert")
  @HttpCode(200)
  @RequirePermission("manufacturing.mrpRun.edit")
  @ApiOperation({ summary: "Creates a production order from a planned production line" })
  convertMrpProduction(@Ctx() ctx: RequestContext, @Param("id") id: string, @Param("lineId") lineId: string) {
    return this.mrp.convertProduction(ctx, id, lineId);
  }

  @Post("mrp-runs/:id/production/:lineId/dismiss")
  @HttpCode(200)
  @RequirePermission("manufacturing.mrpRun.edit")
  dismissMrpProduction(@Ctx() ctx: RequestContext, @Param("id") id: string, @Param("lineId") lineId: string) {
    return this.mrp.dismissProduction(ctx, id, lineId);
  }

  @Post("mrp-runs/:id/purchases/:lineId/convert")
  @HttpCode(200)
  @RequirePermission("manufacturing.mrpRun.edit")
  @ApiOperation({ summary: "Creates a purchase requisition from a planned purchase line" })
  convertMrpPurchase(@Ctx() ctx: RequestContext, @Param("id") id: string, @Param("lineId") lineId: string) {
    return this.mrp.convertPurchase(ctx, id, lineId);
  }

  @Post("mrp-runs/:id/purchases/:lineId/dismiss")
  @HttpCode(200)
  @RequirePermission("manufacturing.mrpRun.edit")
  dismissMrpPurchase(@Ctx() ctx: RequestContext, @Param("id") id: string, @Param("lineId") lineId: string) {
    return this.mrp.dismissPurchase(ctx, id, lineId);
  }
}

const crud = [
  createMasterDataController({ path: "manufacturing/work-centres", tag: "Manufacturing: Work centres", module: "manufacturing", permission: "manufacturing.workCentre", service: WorkCentreService, createDto: CreateWorkCentreDto, updateDto: UpdateWorkCentreDto }),
  createMasterDataController({ path: "manufacturing/machines", tag: "Manufacturing: Machines", module: "manufacturing", permission: "manufacturing.machine", service: MachineService, createDto: CreateMachineDto, updateDto: UpdateMachineDto }),
  createMasterDataController({ path: "manufacturing/boms", tag: "Manufacturing: BOMs", module: "manufacturing", permission: "manufacturing.bom", service: BomService, createDto: CreateBomDto, updateDto: UpdateBomDto }),
  createMasterDataController({ path: "manufacturing/routings", tag: "Manufacturing: Routings", module: "manufacturing", permission: "manufacturing.routing", service: RoutingService, createDto: CreateRoutingDto, updateDto: UpdateRoutingDto }),
  createMasterDataController({ path: "manufacturing/production-orders", tag: "Manufacturing: Production orders", module: "manufacturing", permission: "manufacturing.productionOrder", service: ProductionOrderService, createDto: CreateProductionOrderDto, updateDto: UpdateProductionOrderDto }),
  createMasterDataController({ path: "manufacturing/demand-forecasts", tag: "Manufacturing: Demand forecasts", module: "manufacturing", permission: "manufacturing.demandForecast", service: DemandForecastService, createDto: CreateDemandForecastDto, updateDto: UpdateDemandForecastDto }),
  createMasterDataController({ path: "manufacturing/mrp-runs", tag: "Manufacturing: MRP runs", module: "manufacturing", permission: "manufacturing.mrpRun", service: MrpService, createDto: RunMrpDto, updateDto: UpdateMrpRunDto }),
];

const SERVICES = [WorkCentreService, MachineService, BomService, RoutingService, ProductionOrderService, DemandForecastService, MrpService];

@Module({
  imports: [InventoryModule, SalesModule, ProcurementModule],
  controllers: [ManufacturingActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class ManufacturingModule {}
