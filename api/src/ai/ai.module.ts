import { Body, Controller, Get, HttpCode, Module, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { FinanceModule } from "../finance/finance.module.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { ReportsModule } from "../reports/reports.module.js";
import { AskAiDto } from "./ai.dto.js";
import { AiAssistantService } from "./ai.services.js";
import { CreateDraftDto, ExtractDocumentDto, UpdateDocumentExtractionDto } from "./document-extraction.dto.js";
import { DocumentExtractionService } from "./document-extraction.services.js";
import { DocumentExtractorService } from "./document-extractor.services.js";
import { InsightsService } from "./insights.services.js";

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

@ApiTags("AI")
@ApiBearerAuth()
@RequireModule("ai")
@Controller("ai/document-extractions")
class DocumentExtractionActionsController {
  constructor(private readonly extractions: DocumentExtractionService) {}

  @Post(":id/create-draft")
  @HttpCode(200)
  @RequirePermission("ai.documentExtraction.edit")
  createDraft(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CreateDraftDto)) dto: CreateDraftDto) {
    return this.extractions.createDraft(ctx, id, dto);
  }
}

@ApiTags("AI")
@ApiBearerAuth()
@RequireModule("ai")
@Controller("ai/insights")
class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get("run")
  @RequirePermission("ai.insights.view")
  run(@Ctx() ctx: RequestContext) {
    return this.insights.run(ctx);
  }
}

const crud = [
  createMasterDataController({
    path: "ai/document-extractions", tag: "AI: Document extraction", module: "ai", permission: "ai.documentExtraction",
    service: DocumentExtractionService, createDto: ExtractDocumentDto, updateDto: UpdateDocumentExtractionDto,
  }),
];

@Module({
  imports: [ReportsModule, FinanceModule],
  controllers: [AiAssistantController, DocumentExtractionActionsController, InsightsController, ...crud],
  providers: [AiAssistantService, DocumentExtractorService, DocumentExtractionService, InsightsService],
  exports: [AiAssistantService, DocumentExtractionService, InsightsService],
})
export class AiModule {}
