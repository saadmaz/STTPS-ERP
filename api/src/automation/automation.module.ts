import { Body, Controller, HttpCode, Module, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { ProcurementModule } from "../procurement/procurement.module.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { CreateAutomationRuleDto, TestRunAutomationRuleDto, UpdateAutomationRuleDto } from "./automation.dto.js";
import { AutomationEngineService, AutomationRuleService } from "./automation.services.js";

@ApiTags("Automation")
@ApiBearerAuth()
@RequireModule("automation")
@Controller("automation")
class AutomationActionsController {
  constructor(private readonly engine: AutomationEngineService) {}

  @Post("rules/:id/test-run")
  @HttpCode(200)
  @RequirePermission("automation.rule.edit")
  testRun(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(TestRunAutomationRuleDto)) dto: TestRunAutomationRuleDto) {
    return this.engine.testRun(ctx, id, dto.payload);
  }
}

const crud = [
  createMasterDataController({ path: "automation/rules", tag: "Automation: Rules", module: "automation", permission: "automation.rule", service: AutomationRuleService, createDto: CreateAutomationRuleDto, updateDto: UpdateAutomationRuleDto }),
];

const SERVICES = [AutomationRuleService, AutomationEngineService];

@Module({
  imports: [ProcurementModule, TasksModule],
  controllers: [AutomationActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class AutomationModule {}
