import { Body, Controller, HttpCode, Module, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { CreateDocumentDto, CreateFolderDto, CreateFromTemplateDto, RecordSignatureOutcomeDto, UpdateDocumentDto, UpdateFolderDto } from "./documents.dto.js";
import { DocumentFolderService, DocumentService } from "./documents.services.js";
import { ManualSignatureProvider, SIGNATURE_PROVIDER } from "./signature-provider.js";

@ApiTags("Documents")
@ApiBearerAuth()
@RequireModule("documents")
@Controller("documents/records")
class DocumentActionsController {
  constructor(private readonly documents: DocumentService) {}

  @Post(":id/submit")
  @HttpCode(200)
  @RequirePermission("documents.document.edit")
  @ApiOperation({ summary: "Submits the document for approval" })
  submit(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.documents.submitForApproval(ctx, id);
  }

  @Post(":id/from-template")
  @RequirePermission("documents.document.create")
  @ApiOperation({ summary: "Creates a new draft document from this template" })
  fromTemplate(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CreateFromTemplateDto)) dto: CreateFromTemplateDto) {
    return this.documents.createFromTemplate(ctx, id, dto);
  }

  @Post(":id/request-signature")
  @HttpCode(200)
  @RequirePermission("documents.document.edit")
  @ApiOperation({ summary: "Requests a signature through the configured provider" })
  requestSignature(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.documents.requestSignature(ctx, id);
  }

  @Post(":id/signature-outcome")
  @HttpCode(200)
  @RequirePermission("documents.document.edit")
  @ApiOperation({ summary: "Records whether the document came back signed or declined" })
  signatureOutcome(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RecordSignatureOutcomeDto)) dto: RecordSignatureOutcomeDto) {
    return this.documents.recordSignatureOutcome(ctx, id, dto.outcome);
  }
}

const crud = [
  createMasterDataController({ path: "documents/folders", tag: "Documents: Folders", module: "documents", permission: "documents.folder", service: DocumentFolderService, createDto: CreateFolderDto, updateDto: UpdateFolderDto }),
  createMasterDataController({ path: "documents/records", tag: "Documents", module: "documents", permission: "documents.document", service: DocumentService, createDto: CreateDocumentDto, updateDto: UpdateDocumentDto }),
];

const SERVICES = [DocumentFolderService, DocumentService, { provide: SIGNATURE_PROVIDER, useClass: ManualSignatureProvider }];

@Module({
  controllers: [DocumentActionsController, ...crud],
  providers: SERVICES,
  exports: [DocumentFolderService, DocumentService],
})
export class DocumentsModule {}
