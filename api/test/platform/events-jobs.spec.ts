import { describe, expect, it } from "vitest";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";
import { DomainEvent, EventBusService } from "../../src/platform/events/event-bus.service.js";
import { firestore, testContext } from "../helpers.js";

function kernel() {
  const fs = firestore();
  const jobs = new JobQueueService(fs);
  const bus = new EventBusService(fs, jobs);
  bus.onModuleInit();
  return { fs, jobs, bus };
}

describe("JobQueueService", () => {
  it("retries a failed job and records the error", async () => {
    const { jobs } = kernel();
    let calls = 0;
    const type = `test.flaky.${Date.now()}`;
    jobs.register(type, async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return { ok: true };
    });
    const id = await jobs.enqueue(type, {});
    await jobs.drain();
    const failed = await jobs.get(id);
    expect(failed).toMatchObject({ status: "queued", attempts: 1 });
    expect(failed!.lastError).toContain("boom");
    // Make the retry due now instead of after the backoff.
    await firestore().collection("jobs").doc(id).update({ runAt: new Date().toISOString() });
    await jobs.drain();
    expect(await jobs.get(id)).toMatchObject({ status: "done", attempts: 2, result: { ok: true } });
    expect(calls).toBe(2);
  });

  it("ignores a second enqueue with the same id", async () => {
    const { jobs } = kernel();
    let calls = 0;
    const type = `test.once.${Date.now()}`;
    jobs.register(type, async () => void calls++);
    const id = `once_${Date.now()}`;
    await jobs.enqueue(type, {}, { id });
    await jobs.enqueue(type, {}, { id });
    await jobs.drain();
    expect(calls).toBe(1);
  });
});

describe("EventBusService", () => {
  it("delivers to every subscriber only when the transaction commits", async () => {
    const { fs, jobs, bus } = kernel();
    const ctx = testContext();
    const type = `TestHappened${Date.now()}`;
    const seen: string[] = [];
    bus.subscribe(type, `${type}.a`, async (e: DomainEvent) => void seen.push(`a:${e.entityId}`));
    bus.subscribe(type, `${type}.b`, async (e: DomainEvent) => void seen.push(`b:${e.entityId}`));

    await expect(
      fs.runTransaction(async (tx) => {
        bus.publish(tx, ctx, type, { entity: "thing", entityId: "rolled-back" }, {});
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");

    await fs.runTransaction(async (tx) => {
      bus.publish(tx, ctx, type, { entity: "thing", entityId: "T1" }, { n: 1 });
    });
    await jobs.drain();
    expect(seen.sort()).toEqual(["a:T1", "b:T1"]);
    expect((await bus.forEntity(ctx, "thing", "T1"))[0]).toMatchObject({ type, payload: { n: 1 } });
  });
});
