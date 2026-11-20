import { describe, expect, it } from "vitest";
import { SequenceService } from "../../src/platform/data/sequence.service.js";
import { AuditService } from "../../src/platform/audit/audit.service.js";
import { firestore, testContext } from "../helpers.js";

describe("SequenceService", () => {
  it("issues gap-free numbers per company, type and year, even concurrently", async () => {
    const fs = firestore();
    const seq = new SequenceService(fs);
    const ctx = testContext();
    const date = new Date("2026-03-01T00:00:00Z");
    const numbers = await Promise.all(
      Array.from({ length: 10 }, () => fs.runTransaction((tx) => seq.next(tx, ctx, "invoice", { prefix: "INV", date }))),
    );
    expect(new Set(numbers).size).toBe(10);
    expect(numbers.sort()).toEqual(Array.from({ length: 10 }, (_, i) => `INV-2026-${String(i + 1).padStart(6, "0")}`));
    const other = testContext();
    expect(await fs.runTransaction((tx) => seq.next(tx, other, "invoice", { prefix: "INV", date }))).toBe("INV-2026-000001");
  });
});

describe("AuditService", () => {
  it("stores only changed fields and lists history for a record", async () => {
    const fs = firestore();
    const audit = new AuditService(fs);
    const ctx = testContext();
    await fs.runTransaction(async (tx) => {
      audit.record(
        ctx,
        { module: "crm", action: "updated", entity: "lead", entityId: "L1", before: { a: 1, b: 2, version: 1 }, after: { a: 1, b: 3, version: 2 } },
        tx,
      );
    });
    const history = await audit.forEntity(ctx, "lead", "L1");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ before: { b: 2 }, after: { b: 3 }, userId: "u_test", userAgent: "vitest" });
  });
});
