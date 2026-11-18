import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { JobDoc, JobQueueService } from "../jobs/job-queue.service.js";
import { Scope } from "../context/request-context.js";

export const EVENTS_COLLECTION = "domainEvents";

/** A fact that happened in one module and that other modules may react to. */
export interface DomainEvent<P = Record<string, unknown>> {
  id: string;
  /** PascalCase past tense, e.g. "SalesOrderConfirmed". */
  type: string;
  tenantId: string;
  companyId: string;
  actorId: string | null;
  occurredAt: string;
  /** Which record the event is about. */
  entity: string;
  entityId: string;
  payload: P;
}

export type EventHandler<P = Record<string, unknown>> = (event: DomainEvent<P>) => Promise<void>;

interface EventJobPayload {
  eventId: string;
  handler: string;
}

/**
 * Transactional outbox. `publish` writes the event and one job per subscribed
 * handler inside the caller's transaction, so reactions happen if and only if
 * the business change commits. Handlers then run on the job queue with
 * retries; they must be idempotent because delivery is at least once.
 */
@Injectable()
export class EventBusService implements OnModuleInit {
  private readonly logger = new Logger("Events");
  private readonly subscribers = new Map<string, Map<string, EventHandler>>();
  private readonly handlersByName = new Map<string, EventHandler>();

  constructor(
    private readonly firestore: FirestoreService,
    private readonly jobs: JobQueueService,
  ) {}

  onModuleInit(): void {
    this.jobs.register<EventJobPayload>("event", async (job: JobDoc<EventJobPayload>) => {
      const { eventId, handler } = job.payload;
      const fn = this.handlersByName.get(handler);
      if (!fn) {
        this.logger.warn(`No handler named ${handler}; skipping event ${eventId}`);
        return;
      }
      const snap = await this.firestore.collection<DomainEvent>(EVENTS_COLLECTION).doc(eventId).get();
      const event = snap.data();
      if (!event) throw new Error(`Event ${eventId} not found`);
      await fn(event);
    });
  }

  /**
   * Subscribes a named handler to an event type. The name must be unique and
   * stable across deployments (e.g. "finance.postDeliveryCogs"), because it
   * is stored with each pending delivery.
   */
  subscribe<P = Record<string, unknown>>(type: string, name: string, handler: EventHandler<P>): void {
    if (this.handlersByName.has(name)) throw new Error(`Event handler name already used: ${name}`);
    this.handlersByName.set(name, handler as EventHandler);
    if (!this.subscribers.has(type)) this.subscribers.set(type, new Map());
    this.subscribers.get(type)!.set(name, handler as EventHandler);
  }

  publish<P extends object>(
    tx: Transaction,
    scope: Scope,
    type: string,
    entity: { entity: string; entityId: string },
    payload: P,
  ): DomainEvent<P> {
    const ref = this.firestore.collection<DomainEvent<P>>(EVENTS_COLLECTION).doc();
    const event: DomainEvent<P> = {
      id: ref.id,
      type,
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      actorId: scope.userId ?? null,
      occurredAt: new Date().toISOString(),
      entity: entity.entity,
      entityId: entity.entityId,
      payload,
    };
    tx.create(ref, event);
    for (const name of this.subscribers.get(type)?.keys() ?? []) {
      this.jobs.enqueueInTx<EventJobPayload>(tx, "event", { eventId: event.id, handler: name }, {
        id: `evt_${event.id}_${name.replace(/[^A-Za-z0-9_.-]/g, "_")}`,
        scope,
      });
    }
    this.jobs.kick();
    return event;
  }

  /** Recent events for one record, newest first (for activity feeds and debugging). */
  async forEntity(scope: Scope, entity: string, entityId: string, limit = 50): Promise<DomainEvent[]> {
    const snap = await this.firestore
      .collection<DomainEvent>(EVENTS_COLLECTION)
      .where("companyId", "==", scope.companyId)
      .where("entity", "==", entity)
      .where("entityId", "==", entityId)
      .orderBy("occurredAt", "desc")
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data());
  }
}
