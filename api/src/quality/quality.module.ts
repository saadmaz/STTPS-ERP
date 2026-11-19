import { Body, Controller, HttpCode, Module, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import {
  AddNcrActionDto, CloseNcrDto, CompleteInspectionDto, CreateInspectionDto, CreateInspectionPlanDto, CreateNonConformanceDto,
  UpdateInspectionDto, UpdateInspectionPlanDto, UpdateNonConformanceDto,
} from "./quality.dto.js";
import { InspectionPlanService, InspectionService, NonConformanceService } from "./quality.services.js";

@ApiTags("Quality")
@ApiBearerAuth()
@RequireModule("quality")
@Controller("quality")
class QualityActionsController {
  constructor(
    private readonly inspections: InspectionService,
    private readonly ncrs: NonConformanceService,
  ) {}

  @Post("inspections/:id/complete")
  @HttpCode(200)
  @RequirePermission("quality.inspection.edit")
  @ApiOperation({ summary: "Records results and completes an inspection, computing the overall result from required items if not given" })
  complete(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CompleteInspectionDto)) dto: CompleteInspectionDto) {
    return this.inspections.complete(ctx, id, dto);
  }

  @Post("inspections/:id/cancel")
  @HttpCode(200)
  @RequirePermission("quality.inspection.edit")
  cancel(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.inspections.cancel(ctx, id);
  }

  @Post("non-conformances/:id/actions")
  @HttpCode(200)
  @RequirePermission("quality.nonConformance.edit")
  @ApiOperation({ summary: "Adds a corrective or preventive action" })
  addAction(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(AddNcrActionDto)) dto: AddNcrActionDto) {
    return this.ncrs.addAction(ctx, id, dto);
  }

  @Post("non-conformances/:id/actions/:actionId/complete")
  @HttpCode(200)
  @RequirePermission("quality.nonConformance.edit")
  completeAction(@Ctx() ctx: RequestContext, @Param("id") id: string, @Param("actionId") actionId: string) {
    return this.ncrs.completeAction(ctx, id, actionId);
  }

  @Post("non-conformances/:id/close")
  @HttpCode(200)
  @RequirePermission("quality.nonConformance.edit")
  close(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CloseNcrDto)) dto: CloseNcrDto) {
    return this.ncrs.close(ctx, id, dto);
  }
}

const crud = [
  createMasterDataController({ path: "quality/inspection-plans", tag: "Quality: Inspection plans", module: "quality", permission: "quality.inspectionPlan", service: InspectionPlanService, createDto: CreateInspectionPlanDto, updateDto: UpdateInspectionPlanDto }),
  createMasterDataController({ path: "quality/inspections", tag: "Quality: Inspections", module: "quality", permission: "quality.inspection", service: InspectionService, createDto: CreateInspectionDto, updateDto: UpdateInspectionDto }),
  createMasterDataController({ path: "quality/non-conformances", tag: "Quality: Non-conformances", module: "quality", permission: "quality.nonConformance", service: NonConformanceService, createDto: CreateNonConformanceDto, updateDto: UpdateNonConformanceDto }),
];

const SERVICES = [InspectionPlanService, InspectionService, NonConformanceService];

@Module({
  controllers: [QualityActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class QualityModule {}
