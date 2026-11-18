import { Global, Module } from "@nestjs/common";
import { SequenceService } from "./data/sequence.service.js";
import { UniqueService } from "./data/unique.service.js";
import { AuditService } from "./audit/audit.service.js";
import { JobQueueService } from "./jobs/job-queue.service.js";
import { EventBusService } from "./events/event-bus.service.js";
import { ModulesService } from "./modules/modules.service.js";
import { ModulesController } from "./modules/modules.controller.js";
import { EmailSender } from "./notifications/email.sender.js";
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

const SHARED = [
  SequenceService,
  UniqueService,
  AuditService,
  JobQueueService,
  EventBusService,
  ModulesService,
  EmailSender,
  NotificationsService,
  ApprovalsService,
  ApprovalDefinitionsService,
  DelegationsService,
];

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
  ],
  providers: SHARED,
  exports: SHARED,
})
export class PlatformModule {}
