import { Global, Module } from "@nestjs/common";
import { SequenceService } from "./data/sequence.service.js";
import { UniqueService } from "./data/unique.service.js";
import { AuditService } from "./audit/audit.service.js";
import { JobQueueService } from "./jobs/job-queue.service.js";
import { EventBusService } from "./events/event-bus.service.js";
import { ModulesService } from "./modules/modules.service.js";
import { ModulesController } from "./modules/modules.controller.js";

const SHARED = [SequenceService, UniqueService, AuditService, JobQueueService, EventBusService, ModulesService];

/** Shared kernel available to every domain module without importing it. */
@Global()
@Module({
  controllers: [ModulesController],
  providers: SHARED,
  exports: SHARED,
})
export class PlatformModule {}
