import { Body, Controller, Get, HttpCode, Module, Param, Post, Patch, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { FinanceModule } from "../finance/finance.module.js";
import { MaintenancePlanService, WorkOrderService } from "./maintenance.services.js";
import {
  AddPartDto,
  AssignTechnicianDto,
  ChecklistItemInputDto,
  CompleteWorkOrderDto,
  CreateMaintenancePlanDto,
  CreateWorkOrderDto,
  LogLaborDto,
  SetChecklistItemDto,
  UpdateMaintenancePlanDto,
  UpdateWorkOrderDto,
} from "./maintenance.dto.js";

@ApiTags("Maintenance")
@ApiBearerAuth()
@RequireModule("maintenance")
@Controller("maintenance")
class MaintenanceActionsController {
  constructor(private readonly plans: MaintenancePlanService, private readonly workOrders: WorkOrderService) {}

  @Get("plans/due")
  @RequirePermission("maintenance.plan.view")
  @ApiOperation({ summary: "Active plans due on or before a date" })
  duePlans(@Ctx() ctx: RequestContext, @Query("date") date: string) {
    return this.plans.dueBy(ctx, date);
  }

  @Post("plans/:id/activate")
  @HttpCode(200)
  @RequirePermission("maintenance.plan.edit")
  activatePlan(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.plans.setActive(ctx, id, true);
  }

  @Post("plans/:id/deactivate")
  @HttpCode(200)
  @RequirePermission("maintenance.plan.edit")
  deactivatePlan(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.plans.setActive(ctx, id, false);
  }

  @Post("plans/:id/generate-work-order")
  @HttpCode(201)
  @RequirePermission("maintenance.workOrder.create")
  @ApiOperation({ summary: "Creates a preventive work order from this plan and advances its next due date" })
  generateWorkOrder(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.workOrders.fromPlan(ctx, id);
  }

  @Post("work-orders/:id/assign")
  @HttpCode(200)
  @RequirePermission("maintenance.workOrder.edit")
  assign(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(AssignTechnicianDto)) dto: AssignTechnicianDto) {
    return this.workOrders.assign(ctx, id, dto);
  }

  @Post("work-orders/:id/start")
  @HttpCode(200)
  @RequirePermission("maintenance.workOrder.edit")
  start(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.workOrders.start(ctx, id);
  }

  @Post("work-orders/:id/parts")
  @HttpCode(200)
  @RequirePermission("maintenance.workOrder.edit")
  addPart(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(AddPartDto)) dto: AddPartDto) {
    return this.workOrders.addPart(ctx, id, dto);
  }

  @Post("work-orders/:id/labor")
  @HttpCode(200)
  @RequirePermission("maintenance.workOrder.edit")
  logLabor(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(LogLaborDto)) dto: LogLaborDto) {
    return this.workOrders.logLabor(ctx, id, dto);
  }

  @Post("work-orders/:id/checklist")
  @HttpCode(201)
  @RequirePermission("maintenance.workOrder.edit")
  addChecklistItem(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ChecklistItemInputDto)) dto: ChecklistItemInputDto) {
    return this.workOrders.addChecklistItem(ctx, id, dto.text);
  }

  @Patch("work-orders/:id/checklist/:itemId")
  @RequirePermission("maintenance.workOrder.edit")
  setChecklistItem(@Ctx() ctx: RequestContext, @Param("id") id: string, @Param("itemId") itemId: string, @Body(validated(SetChecklistItemDto)) dto: SetChecklistItemDto) {
    return this.workOrders.setChecklistItem(ctx, id, itemId, dto.done);
  }

  @Post("work-orders/:id/complete")
  @HttpCode(200)
  @RequirePermission("maintenance.workOrder.edit")
  @ApiOperation({ summary: "Completes the order and records its cost onto the asset's history" })
  complete(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CompleteWorkOrderDto)) dto: CompleteWorkOrderDto) {
    return this.workOrders.complete(ctx, id, dto);
  }

  @Post("work-orders/:id/cancel")
  @HttpCode(200)
  @RequirePermission("maintenance.workOrder.edit")
  cancel(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.workOrders.cancel(ctx, id);
  }
}

const crud = [
  createMasterDataController({ path: "maintenance/plans", tag: "Maintenance: Plans", module: "maintenance", permission: "maintenance.plan", service: MaintenancePlanService, createDto: CreateMaintenancePlanDto, updateDto: UpdateMaintenancePlanDto }),
  createMasterDataController({ path: "maintenance/work-orders", tag: "Maintenance: Work orders", module: "maintenance", permission: "maintenance.workOrder", service: WorkOrderService, createDto: CreateWorkOrderDto, updateDto: UpdateWorkOrderDto }),
];

const SERVICES = [MaintenancePlanService, WorkOrderService];

@Module({
  imports: [FinanceModule],
  controllers: [MaintenanceActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class MaintenanceModule {}
