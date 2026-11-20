import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { AuditService } from "../audit/audit.service.js";
import { systemContext } from "../context/request-context.js";
import { MasterDataService } from "../crud/master-data.service.js";
import { ListQueryDto } from "../crud/list-query.dto.js";
import { NewDoc, Patch } from "../data/repository.js";
import { UniqueService } from "../data/unique.service.js";
import { DomainEvent, EventBusService } from "../events/event-bus.service.js";
import { JobDoc, JobQueueService } from "../jobs/job-queue.service.js";
import { SearchEntry } from "../search/search-index.js";
import { CreateWebhookDto, UpdateWebhookDto } from "./webhooks.dto.js";
import { WEBHOOK_COLLECTIONS, WebhookDoc } from "./webhooks.models.js";

/**
 * Every domain event type published anywhere in this codebase (grep
 * `events.publish(tx` across `api/src` to keep this current). This is a
 * second copy of the Automation engine's own list, deliberately: `platform/`
 * must not depend on a domain module (`automation/`), so the two lists are
 * kept independently rather than one importing the other.
 */
const KNOWN_EVENT_TYPES = [
  "LowStock", "StockMoved", "GoodsReceived", "GoodsDispatched", "PurchaseOrderApproved", "SupplierReturnShipped",
  "SalesOrderConfirmed", "SalesDelivered", "SalesReturnReceived", "QuoteAccepted", "InvoicePosted", "CreditNotePosted",
  "DebitNotePosted", "PaymentReceived", "SupplierPaymentMade", "ExpenseClaimApproved", "LeadConverted", "OpportunityWon", "OpportunityLost",
];

interface WebhookDeliveryJob {
  webhookId: string;
  event: DomainEvent;
}

@Injectable()
export class WebhookService extends MasterDataService<WebhookDoc, CreateWebhookDto, UpdateWebhookDto> implements OnModuleInit {
  private readonly logger = new Logger("Webhooks");

  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly events: EventBusService,
    private readonly jobs: JobQueueService,
  ) {
    super(fs, audit, unique, {
      module: "integrations", entity: "webhook", label: "Webhook", collection: WEBHOOK_COLLECTIONS.webhooks,
      route: "/platform/webhooks", filterFields: ["active"], customFields: false,
    });
  }

  onModuleInit(): void {
    this.jobs.register<WebhookDeliveryJob>("webhook.deliver", (job: JobDoc<WebhookDeliveryJob>) => this.deliver(job.payload.webhookId, job.payload.event));
    for (const type of KNOWN_EVENT_TYPES) {
      this.events.subscribe(type, `platform.webhook.${type}`, async (event) => {
        const ctx = systemContext(event);
        const page = await this.list(ctx, { where: "active:true", limit: 200 } as ListQueryDto);
        for (const webhook of page.items) {
          if (webhook.eventTypes.includes(event.type)) this.jobs.enqueue<WebhookDeliveryJob>("webhook.deliver", { webhookId: webhook.id, event });
        }
      });
    }
  }

  protected toNew(dto: CreateWebhookDto): NewDoc<WebhookDoc> {
    return { name: dto.name, url: dto.url, eventTypes: dto.eventTypes, active: dto.active ?? true, lastDeliveryAt: null, lastDeliveryStatus: null, lastDeliveryError: null };
  }

  protected toPatch(dto: UpdateWebhookDto): Patch<WebhookDoc> {
    return { ...dto } as Patch<WebhookDoc>;
  }

  protected searchEntry(doc: WebhookDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.url };
  }

  private async deliver(webhookId: string, event: DomainEvent): Promise<void> {
    const ctx = systemContext(event);
    const webhook = await this.repo.find(ctx, webhookId);
    if (!webhook || !webhook.active) return;
    const now = new Date().toISOString();
    try {
      const response = await fetch(webhook.url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: event.type, entity: event.entity, entityId: event.entityId, occurredAt: event.occurredAt, payload: event.payload }),
      });
      if (!response.ok) throw new Error(`Webhook endpoint returned ${response.status}`);
      await this.repo.update(ctx, webhookId, { lastDeliveryAt: now, lastDeliveryStatus: "delivered", lastDeliveryError: null } as Patch<WebhookDoc>);
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);
      this.logger.warn(`Delivery to "${webhook.name}" failed: ${message}`);
      await this.repo.update(ctx, webhookId, { lastDeliveryAt: now, lastDeliveryStatus: "failed", lastDeliveryError: message } as Patch<WebhookDoc>);
      throw error; // lets the job queue retry with backoff
    }
  }
}
