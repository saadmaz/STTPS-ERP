import { Body, Controller, HttpCode, Module, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { SalesModule } from "../sales/sales.module.js";
import {
  ArriveStopDto, CompleteStopDto, CreateFuelLogDto, CreateRouteDto, CreateVehicleDto, FailStopDto,
  UpdateFuelLogDto, UpdateRouteDto, UpdateVehicleDto,
} from "./logistics.dto.js";
import { FuelLogService, RouteService, VehicleService } from "./logistics.services.js";

@ApiTags("Logistics")
@ApiBearerAuth()
@RequireModule("logistics")
@Controller("logistics")
class LogisticsActionsController {
  constructor(private readonly routes: RouteService) {}

  @Post("routes/:id/dispatch")
  @HttpCode(200)
  @RequirePermission("logistics.route.edit")
  @ApiOperation({ summary: "Dispatches every stop's delivery and the route itself" })
  dispatch(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.routes.dispatch(ctx, id);
  }

  @Post("routes/:id/stops/arrive")
  @HttpCode(200)
  @RequirePermission("logistics.route.edit")
  arrive(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ArriveStopDto)) dto: ArriveStopDto) {
    return this.routes.arrive(ctx, id, dto);
  }

  @Post("routes/:id/stops/complete")
  @HttpCode(200)
  @RequirePermission("logistics.route.edit")
  @ApiOperation({ summary: "Confirms proof of delivery for one stop" })
  complete(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CompleteStopDto)) dto: CompleteStopDto) {
    return this.routes.completeStop(ctx, id, dto);
  }

  @Post("routes/:id/stops/fail")
  @HttpCode(200)
  @RequirePermission("logistics.route.edit")
  fail(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(FailStopDto)) dto: FailStopDto) {
    return this.routes.failStop(ctx, id, dto);
  }

  @Post("routes/:id/cancel")
  @HttpCode(200)
  @RequirePermission("logistics.route.edit")
  cancel(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.routes.cancel(ctx, id);
  }
}

const crud = [
  createMasterDataController({ path: "logistics/vehicles", tag: "Logistics: Vehicles", module: "logistics", permission: "logistics.vehicle", service: VehicleService, createDto: CreateVehicleDto, updateDto: UpdateVehicleDto }),
  createMasterDataController({ path: "logistics/fuel-logs", tag: "Logistics: Fuel logs", module: "logistics", permission: "logistics.fuelLog", service: FuelLogService, createDto: CreateFuelLogDto, updateDto: UpdateFuelLogDto }),
  createMasterDataController({ path: "logistics/routes", tag: "Logistics: Routes", module: "logistics", permission: "logistics.route", service: RouteService, createDto: CreateRouteDto, updateDto: UpdateRouteDto }),
];

const SERVICES = [VehicleService, FuelLogService, RouteService];

@Module({
  imports: [SalesModule],
  controllers: [LogisticsActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class LogisticsModule {}
