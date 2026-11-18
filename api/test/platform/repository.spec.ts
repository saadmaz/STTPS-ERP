import { describe, expect, it } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { BaseDoc, TenantRepository } from "../../src/platform/data/repository.js";
import { firestore, testContext } from "../helpers.js";

interface WidgetDoc extends BaseDoc {
  name: string;
  size: number;
}

const repo = () => new TenantRepository<WidgetDoc>(firestore(), "test_widgets", "Widget");

describe("TenantRepository", () => {
  it("creates with base fields and reads back in scope", async () => {
    const ctx = testContext();
    const created = await repo().create(ctx, { name: "A", size: 1 });
    expect(created).toMatchObject({ tenantId: ctx.tenantId, companyId: ctx.companyId, version: 1, archivedAt: null, createdBy: "u_test" });
    expect(await repo().get(ctx, created.id)).toEqual(created);
  });

  it("hides records from other companies", async () => {
    const a = testContext();
    const b = testContext();
    const created = await repo().create(a, { name: "secret", size: 1 });
    await expect(repo().get(b, created.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await repo().list(b)).items).toHaveLength(0);
  });

  it("paginates with a cursor and hides archived records", async () => {
    const ctx = testContext();
    for (let i = 0; i < 5; i++) await repo().create(ctx, { name: `w${i}`, size: i });
    const first = await repo().list(ctx, { limit: 2, orderBy: [{ field: "size" }] });
    expect(first.items.map((w) => w.size)).toEqual([0, 1]);
    const second = await repo().list(ctx, { limit: 2, cursor: first.nextCursor, orderBy: [{ field: "size" }] });
    expect(second.items.map((w) => w.size)).toEqual([2, 3]);
    await repo().archive(ctx, first.items[0]!.id);
    const all = await repo().list(ctx, { orderBy: [{ field: "size" }] });
    expect(all.items.map((w) => w.size)).toEqual([1, 2, 3, 4]);
    expect(all.nextCursor).toBeNull();
  });

  it("enforces optimistic concurrency and ignores base-field patches", async () => {
    const ctx = testContext();
    const created = await repo().create(ctx, { name: "A", size: 1 });
    const { after } = await repo().update(ctx, created.id, { size: 2, tenantId: "evil" } as never, { expectedVersion: 1 });
    expect(after).toMatchObject({ size: 2, version: 2, tenantId: ctx.tenantId });
    await expect(repo().update(ctx, created.id, { size: 3 }, { expectedVersion: 1 })).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects duplicate ids", async () => {
    const ctx = testContext();
    await repo().create(ctx, { id: `${ctx.companyId}_X`, name: "A", size: 1 });
    await expect(repo().create(ctx, { id: `${ctx.companyId}_X`, name: "B", size: 1 })).rejects.toBeInstanceOf(ConflictException);
  });
});
