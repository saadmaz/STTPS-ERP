import { Body, Controller, HttpCode, Module, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import {
  CreateIncidentDto, CreatePermitDto, CreateRiskAssessmentDto, InvestigateIncidentDto, UpdateIncidentDto, UpdatePermitDto, UpdateRiskAssessmentDto,
} from "./ehs.dto.js";
import { IncidentService, PermitToWorkService, RiskAssessmentService } from "./ehs.services.js";

@ApiTags("EHS")
@ApiBearerAuth()
@RequireModule("ehs")
@Controller("ehs")
class EhsActionsController {
  constructor(
    private readonly incidents: IncidentService,
    private readonly risks: RiskAssessmentService,
    private readonly permits: PermitToWorkService,
  ) {}

  @Post("incidents/:id/investigate")
  @HttpCode(200)
  @RequirePermission("ehs.incident.edit")
  investigate(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(InvestigateIncidentDto)) dto: InvestigateIncidentDto) {
    return this.incidents.investigate(ctx, id, dto);
  }

  @Post("incidents/:id/close")
  @HttpCode(200)
  @RequirePermission("ehs.incident.edit")
  closeIncident(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.incidents.close(ctx, id);
  }

  @Post("risk-assessments/:id/activate")
  @HttpCode(200)
  @RequirePermission("ehs.riskAssessment.edit")
  activateRisk(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.risks.activate(ctx, id);
  }

  @Post("permits/:id/approve")
  @HttpCode(200)
  @RequirePermission("ehs.permit.edit")
  approvePermit(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.permits.approve(ctx, id);
  }

  @Post("permits/:id/reject")
  @HttpCode(200)
  @RequirePermission("ehs.permit.edit")
  rejectPermit(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.permits.reject(ctx, id);
  }

  @Post("permits/:id/close")
  @HttpCode(200)
  @RequirePermission("ehs.permit.edit")
  closePermit(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.permits.close(ctx, id);
  }
}

const crud = [
  createMasterDataController({ path: "ehs/incidents", tag: "EHS: Incidents", module: "ehs", permission: "ehs.incident", service: IncidentService, createDto: CreateIncidentDto, updateDto: UpdateIncidentDto }),
  createMasterDataController({ path: "ehs/risk-assessments", tag: "EHS: Risk assessments", module: "ehs", permission: "ehs.riskAssessment", service: RiskAssessmentService, createDto: CreateRiskAssessmentDto, updateDto: UpdateRiskAssessmentDto }),
  createMasterDataController({ path: "ehs/permits", tag: "EHS: Permits to work", module: "ehs", permission: "ehs.permit", service: PermitToWorkService, createDto: CreatePermitDto, updateDto: UpdatePermitDto }),
];

const SERVICES = [IncidentService, RiskAssessmentService, PermitToWorkService];

@Module({
  controllers: [EhsActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class EhsModule {}
