import { Body, Controller, Get, Global, Headers, HttpCode, Module, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { ApiKeyService } from "./api-keys/api-keys.service.js";
import { CreateApiKeyDto, UpdateApiKeyDto } from "./api-keys/api-keys.dto.js";
import { CreateWebhookDto, UpdateWebhookDto } from "./webhooks/webhooks.dto.js";
import { WebhookService } from "./webhooks/webhooks.service.js";
import { ArchiveDto, createMasterDataController, parseVersion, validated } from "./crud/master-data.controller.js";
import { ListQueryDto } from "./crud/list-query.dto.js";
import { RequireModule } from "./modules/require-module.decorator.js";
import { Ctx, RequestContext } from "./context/request-context.js";
import { SequenceService } from "./data/sequence.service.js";
import { UniqueService } from "./data/unique.service.js";
import { AuditService } from "./audit/audit.service.js";
import { JobQueueService } from "./jobs/job-queue.service.js";
import { EventBusService } from "./events/event-bus.service.js";
import { ModulesService } from "./modules/modules.service.js";
import { ModulesController } from "./modules/modules.controller.js";
import { EmailSender } from "./notifications/email.sender.js";
import { SmsSender } from "./notifications/sms.sender.js";
import { NotificationsService } from "./notifications/notifications.service.js";
import { ApprovalsService } from "./approvals/approvals.service.js";
import { ApprovalDefinitionsService, DelegationsService } from "./approvals/approval-definitions.service.js";
import {
  ApprovalDefinitionsController,
  ApprovalRequestsController,
  DelegationsAdminController,
  MyDelegationsController,
} from "./approvals/approvals.controller.js";
import { MeController } from "./me/me.controller.js";
import { RecordsService } from "./records/records.service.js";
import { CustomFieldsController, RecordItemsController, RecordsController } from "./records/records.controller.js";
import { CustomFieldsService } from "./custom-fields/custom-fields.js";
import { FilesService } from "./files/files.service.js";
import { ObjectStorageProvider } from "./files/object-storage.js";

/**
 * Hand-written rather than `createMasterDataController`: creating a key has
 * to return the one-time raw secret alongside the record, a shape the
 * generic factory's `create()` (which always returns the doc type itself)
 * can't express — so every other route is copied from it instead, except
 * `create`.
 */
@ApiTags("Platform: API keys")
@ApiBearerAuth()
@RequireModule("integrations")
@Controller("platform/api-keys")
class ApiKeysController {
  constructor(private readonly keys: ApiKeyService) {}

  @Get()
  @RequirePermission("integrations.apiKey.view")
  list(@Ctx() ctx: RequestContext, @Query(validated(ListQueryDto)) query: ListQueryDto) {
    return this.keys.list(ctx, query);
  }

  @Get(":id")
  @RequirePermission("integrations.apiKey.view")
  get(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.keys.get(ctx, id);
  }

  @Get(":id/history")
  @RequirePermission("integrations.apiKey.view")
  history(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.keys.history(ctx, id);
  }

  @Post()
  @RequirePermission("integrations.apiKey.create")
  create(@Ctx() ctx: RequestContext, @Body(validated(CreateApiKeyDto)) dto: CreateApiKeyDto) {
    return this.keys.createKey(ctx, dto);
  }

  @Patch(":id")
  @RequirePermission("integrations.apiKey.edit")
  update(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(UpdateApiKeyDto)) dto: UpdateApiKeyDto, @Headers("if-match") ifMatch?: string) {
    return this.keys.update(ctx, id, dto, parseVersion(ifMatch));
  }

  @Post(":id/revoke")
  @HttpCode(200)
  @RequirePermission("integrations.apiKey.edit")
  revoke(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.keys.revoke(ctx, id);
  }

  @Post(":id/archive")
  @HttpCode(200)
  @RequirePermission("integrations.apiKey.delete")
  archive(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ArchiveDto)) dto: ArchiveDto) {
    return this.keys.archive(ctx, id, dto.reason);
  }

  @Post(":id/restore")
  @HttpCode(200)
  @RequirePermission("integrations.apiKey.delete")
  restore(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.keys.restore(ctx, id);
  }
}

const SHARED = [
  SequenceService,
  UniqueService,
  AuditService,
  JobQueueService,
  EventBusService,
  ModulesService,
  EmailSender,
  SmsSender,
  NotificationsService,
  ApprovalsService,
  ApprovalDefinitionsService,
  DelegationsService,
  RecordsService,
  CustomFieldsService,
  FilesService,
  ObjectStorageProvider,
  ApiKeyService,
  WebhookService,
];

const webhooksController = createMasterDataController({ path: "platform/webhooks", tag: "Platform: Webhooks", module: "integrations", permission: "integrations.webhook", service: WebhookService, createDto: CreateWebhookDto, updateDto: UpdateWebhookDto });

/** Shared kernel available to every domain module without importing it. */
@Global()
@Module({
  controllers: [
    ModulesController,
    MeController,
    MyDelegationsController,
    ApprovalRequestsController,
    ApprovalDefinitionsController,
    DelegationsAdminController,
    RecordsController,
    RecordItemsController,
    CustomFieldsController,
    ApiKeysController,
    webhooksController,
  ],
  providers: SHARED,
  exports: SHARED,
})
export class PlatformModule {}
