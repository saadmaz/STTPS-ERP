import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";

export const JOBS_COLLECTION = "jobs";

export type JobStatus = "queued" | "running" | "done" | "dead";

export interface JobDoc<P = unknown> {
  id: string;
  type: string;
  payload: P;
  tenantId: string | null;
  companyId: string | null;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  /** Earliest time the job may run (ISO). */
  runAt: string;
  /** While running: when the claim expires and another worker may retry it. */
  leaseUntil: string | null;
  lastError: string | null;
  result: unknown;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface EnqueueOptions {
  /** Deterministic id makes enqueueing idempotent (a second enqueue with the same id is ignored). */
  id?: string;
  runAt?: Date;
  maxAttempts?: number;
  scope?: { tenantId: string; companyId: string } | null;
}

export type JobHandler<P = unknown> = (job: JobDoc<P>) => Promise<unknown>;

const LEASE_MS = 5 * 60_000;
const POLL_MS = 2_000;
const BATCH = 20;

/**
 * Durable background jobs on Firestore: emails, PDFs, imports, event handlers,
 * chunked postings. At-least-once delivery, so handlers must be idempotent.
 * Failed jobs retry with exponential backoff and go to `dead` after
 * `maxAttempts`. Each API instance runs a polling worker; claims are leased in
 * a transaction so two instances never run the same job at once.
 */
@Injectable()
export class JobQueueService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("Jobs");
  private readonly handlers = new Map<string, JobHandler>();
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private stopped = false;

  constructor(private readonly firestore: FirestoreService) {}

  register<P>(type: string, handler: JobHandler<P>): void {
    if (this.handlers.has(type)) throw new Error(`Job handler already registered: ${type}`);
    this.handlers.set(type, handler as JobHandler);
  }

  /** Enqueues outside any transaction. A repeated deterministic id is ignored. */
  async enqueue<P>(type: string, payload: P, options: EnqueueOptions = {}): Promise<string> {
    const job = this.buildJob(type, payload, options);
    try {
      await this.firestore.collection<JobDoc<P>>(JOBS_COLLECTION).doc(job.id).create(job);
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
    this.kick();
    return job.id;
  }

  /**
   * Enqueues inside the caller's transaction, so the job exists only if the
   * business write commits. Uses set() rather than create(): a duplicate id
   * must not abort the caller's whole transaction.
   */
  enqueueInTx<P>(tx: Transaction, type: string, payload: P, options: EnqueueOptions = {}): string {
    const job = this.buildJob(type, payload, options);
    tx.set(this.firestore.collection<JobDoc<P>>(JOBS_COLLECTION).doc(job.id), job);
    return job.id;
  }

  private buildJob<P>(type: string, payload: P, options: EnqueueOptions): JobDoc<P> {
    const now = new Date().toISOString();
    return {
      id: options.id ?? this.firestore.newId(JOBS_COLLECTION),
      type,
      payload,
      tenantId: options.scope?.tenantId ?? null,
      companyId: options.scope?.companyId ?? null,
      status: "queued",
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 8,
      runAt: (options.runAt ?? new Date()).toISOString(),
      leaseUntil: null,
      lastError: null,
      result: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    };
  }

  onApplicationBootstrap(): void {
    if (process.env.BACKGROUND_WORKERS === "off") return;
    this.timer = setInterval(() => void this.drain(), POLL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** Runs due jobs soon, without waiting for the next poll. */
  kick(): void {
    if (process.env.BACKGROUND_WORKERS === "off" || this.stopped) return;
    setTimeout(() => void this.drain(), 25).unref();
  }

  /**
   * Processes due jobs until none are left (or `maxRounds` is reached).
   * Returns the number of jobs run. Tests call this directly.
   */
  async drain(maxRounds = 50): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    let ran = 0;
    try {
      for (let round = 0; round < maxRounds && !this.stopped; round++) {
        const due = await this.findDue();
        if (due.length === 0) break;
        for (const id of due) {
          const job = await this.claim(id);
          if (job) {
            await this.run(job);
            ran++;
          }
        }
      }
    } catch (error) {
      this.logger.error(`Job drain failed: ${(error as Error).message}`);
    } finally {
      this.draining = false;
    }
    return ran;
  }

  async get(id: string): Promise<JobDoc | null> {
    const snap = await this.firestore.collection<JobDoc>(JOBS_COLLECTION).doc(id).get();
    return snap.data() ?? null;
  }

  private async findDue(): Promise<string[]> {
    const now = new Date().toISOString();
    const col = this.firestore.collection<JobDoc>(JOBS_COLLECTION);
    const [queued, stale] = await Promise.all([
      col.where("status", "==", "queued").where("runAt", "<=", now).orderBy("runAt").limit(BATCH).get(),
      col.where("status", "==", "running").where("leaseUntil", "<=", now).orderBy("leaseUntil").limit(BATCH).get(),
    ]);
    return [...queued.docs, ...stale.docs]
      .map((d) => d.data())
      .filter((job) => this.handlers.has(job.type))
      .map((job) => job.id);
  }

  private claim(id: string): Promise<JobDoc | null> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.firestore.collection<JobDoc>(JOBS_COLLECTION).doc(id);
      const job = (await tx.get(ref)).data();
      const now = new Date();
      if (!job) return null;
      const isDue = job.status === "queued" && job.runAt <= now.toISOString();
      const isStale = job.status === "running" && !!job.leaseUntil && job.leaseUntil <= now.toISOString();
      if (!isDue && !isStale) return null;
      const claimed: JobDoc = {
        ...job,
        status: "running",
        attempts: job.attempts + 1,
        leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString(),
        updatedAt: now.toISOString(),
      };
      tx.set(ref, claimed);
      return claimed;
    });
  }

  private async run(job: JobDoc): Promise<void> {
    const ref = this.firestore.collection<JobDoc>(JOBS_COLLECTION).doc(job.id);
    const handler = this.handlers.get(job.type)!;
    try {
      const result = await handler(job);
      const now = new Date().toISOString();
      await ref.update({ status: "done", result: result ?? null, leaseUntil: null, lastError: null, updatedAt: now, finishedAt: now });
    } catch (error) {
      const message = (error as Error)?.stack ?? String(error);
      const dead = job.attempts >= job.maxAttempts;
      const backoffMs = Math.min(2 ** job.attempts * 1_000, 60 * 60_000);
      const now = new Date();
      await ref.update({
        status: dead ? "dead" : "queued",
        runAt: new Date(now.getTime() + backoffMs).toISOString(),
        leaseUntil: null,
        lastError: message.slice(0, 4_000),
        updatedAt: now.toISOString(),
        finishedAt: dead ? now.toISOString() : null,
      });
      this.logger.warn(`Job ${job.type} ${job.id} failed (attempt ${job.attempts}${dead ? ", giving up" : ""}): ${(error as Error)?.message}`);
    }
  }
}

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}
