import { Body, Controller, HttpCode, Module, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { ReportsModule } from "../reports/reports.module.js";
import { AskAiDto } from "./ai.dto.js";
import { AiAssistantService } from "./ai.services.js";

@ApiTags("AI")
@ApiBearerAuth()
@RequireModule("ai")
@Controller("ai/assistant")
class AiAssistantController {
  constructor(private readonly assistant: AiAssistantService) {}

  @Post("ask")
  @HttpCode(200)
  @RequirePermission("ai.assistant.ask")
  ask(@Ctx() ctx: RequestContext, @Body(validated(AskAiDto)) dto: AskAiDto) {
    return this.assistant.ask(ctx, dto.question);
  }
}

@Module({
  imports: [ReportsModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
  exports: [AiAssistantService],
})
export class AiModule {}
