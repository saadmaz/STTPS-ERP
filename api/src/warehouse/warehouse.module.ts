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
  AssignTaskDto, CompleteTaskDto, CreatePutAwayRuleDto, CreateWarehouseTaskDto, ScanTaskDto, SuggestPickDto, UpdatePutAwayRuleDto, UpdateWarehouseTaskDto, WavePickDto,
} from "./warehouse.dto.js";
import { PickingService, PutAwayRuleService, WarehouseTaskService } from "./warehouse.services.js";

@ApiTags("Warehouse")
@ApiBearerAuth()
@RequireModule("warehouse")
@Controller("warehouse")
class WarehouseActionsController {
  constructor(
    private readonly tasks: WarehouseTaskService,
    private readonly picking: PickingService,
  ) {}

  @Post("tasks/:id/assign")
  @HttpCode(200)
  @RequirePermission("warehouse.task.edit")
  assign(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(AssignTaskDto)) dto: AssignTaskDto) {
    return this.tasks.assign(ctx, id, dto);
  }

  @Post("tasks/:id/start")
  @HttpCode(200)
  @RequirePermission("warehouse.task.edit")
  start(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.tasks.start(ctx, id);
  }

  @Post("tasks/:id/complete")
  @HttpCode(200)
  @RequirePermission("warehouse.task.edit")
  complete(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CompleteTaskDto)) dto: CompleteTaskDto) {
    return this.tasks.complete(ctx, id, dto);
  }

  @Post("tasks/:id/cancel")
  @HttpCode(200)
  @RequirePermission("warehouse.task.edit")
  cancel(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.tasks.cancel(ctx, id);
  }

  @Post("tasks/scan")
  @HttpCode(200)
  @RequirePermission("warehouse.task.view")
  @ApiOperation({ summary: "Looks up a task by its scanned code (number)" })
  scan(@Ctx() ctx: RequestContext, @Body(validated(ScanTaskDto)) dto: ScanTaskDto) {
    return this.tasks.scan(ctx, dto.code);
  }

  @Post("picking/suggest")
  @HttpCode(200)
  @RequirePermission("warehouse.task.view")
  @ApiOperation({ summary: "Suggests which lots to pick for a quantity under a FIFO, FEFO or zone strategy" })
  suggest(@Ctx() ctx: RequestContext, @Body(validated(SuggestPickDto)) dto: SuggestPickDto) {
    return this.picking.suggest(ctx, dto);
  }

  @Post("picking/wave")
  @HttpCode(200)
  @RequirePermission("warehouse.task.view")
  @ApiOperation({ summary: "Combines several deliveries into one pick list, grouped by product and warehouse" })
  wave(@Ctx() ctx: RequestContext, @Body(validated(WavePickDto)) dto: WavePickDto) {
    return this.picking.wave(ctx, dto);
  }
}

const crud = [
  createMasterDataController({ path: "warehouse/put-away-rules", tag: "Warehouse: Put-away rules", module: "warehouse", permission: "warehouse.putAwayRule", service: PutAwayRuleService, createDto: CreatePutAwayRuleDto, updateDto: UpdatePutAwayRuleDto }),
  createMasterDataController({ path: "warehouse/tasks", tag: "Warehouse: Tasks", module: "warehouse", permission: "warehouse.task", service: WarehouseTaskService, createDto: CreateWarehouseTaskDto, updateDto: UpdateWarehouseTaskDto }),
];

const SERVICES = [PutAwayRuleService, WarehouseTaskService, PickingService];

@Module({
  imports: [InventoryModule, SalesModule, ProcurementModule],
  controllers: [WarehouseActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class WarehouseModule {}
