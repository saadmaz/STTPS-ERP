import { Global, Module } from "@nestjs/common";
import { SequenceService } from "./data/sequence.service.js";
import { AuditService } from "./audit/audit.service.js";
import { JobQueueService } from "./jobs/job-queue.service.js";
import { EventBusService } from "./events/event-bus.service.js";

/** Shared kernel available to every domain module without importing it. */
@Global()
@Module({
  providers: [SequenceService, AuditService, JobQueueService, EventBusService],
  exports: [SequenceService, AuditService, JobQueueService, EventBusService],
})
export class PlatformModule {}
