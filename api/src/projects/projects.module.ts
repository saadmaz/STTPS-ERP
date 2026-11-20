import { Body, Controller, Get, HttpCode, Module, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { FinanceModule } from "../finance/finance.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { MilestoneService, ProjectCostService, ProjectPhaseService, ProjectService } from "./projects.services.js";
import { BillProjectDto, CreateMilestoneDto, CreatePhaseDto, CreateProjectCostDto, CreateProjectDto, UpdateMilestoneDto, UpdatePhaseDto, UpdateProjectCostDto, UpdateProjectDto } from "./projects.dto.js";

@ApiTags("Projects")
@ApiBearerAuth()
@RequireModule("projects")
@Controller("projects")
class ProjectActionsController {
  constructor(private readonly projects: ProjectService, private readonly milestones: MilestoneService) {}

  @Get(":id/summary")
  @RequirePermission("projects.project.view")
  @ApiOperation({ summary: "Budget vs actual: labour and material cost against what's been billed" })
  summary(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.projects.summary(ctx, id);
  }

  @Post(":id/bill")
  @HttpCode(201)
  @RequirePermission("projects.billing.edit")
  @ApiOperation({ summary: "Raises an invoice for the project's customer" })
  bill(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(BillProjectDto)) dto: BillProjectDto) {
    return this.projects.bill(ctx, id, dto);
  }

  @Post("milestones/:id/complete")
  @HttpCode(200)
  @RequirePermission("projects.milestone.edit")
  completeMilestone(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.milestones.complete(ctx, id);
  }
}

const crud = [
  createMasterDataController({ path: "projects", tag: "Projects", module: "projects", permission: "projects.project", service: ProjectService, createDto: CreateProjectDto, updateDto: UpdateProjectDto }),
  createMasterDataController({ path: "projects/phases", tag: "Projects: Phases", module: "projects", permission: "projects.phase", service: ProjectPhaseService, createDto: CreatePhaseDto, updateDto: UpdatePhaseDto }),
  createMasterDataController({ path: "projects/milestones", tag: "Projects: Milestones", module: "projects", permission: "projects.milestone", service: MilestoneService, createDto: CreateMilestoneDto, updateDto: UpdateMilestoneDto }),
  createMasterDataController({ path: "projects/costs", tag: "Projects: Costs", module: "projects", permission: "projects.projectCost", service: ProjectCostService, createDto: CreateProjectCostDto, updateDto: UpdateProjectCostDto }),
];

const SERVICES = [ProjectService, ProjectPhaseService, MilestoneService, ProjectCostService];

@Module({
  imports: [FinanceModule, TasksModule],
  controllers: [ProjectActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class ProjectsModule {}
