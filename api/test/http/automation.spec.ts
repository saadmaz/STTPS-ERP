import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";

describe("Automation", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  let main: string;
  let adminId: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["automation.rule.view"]);
    adminId = `${t.tenantId}_admin`;
    main = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "MAIN", name: "Main warehouse" }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  const product = async (name: string) => (await http().post("/api/v1/products/items").set(as()).send({ name }).expect(201)).body.id as string;
  const adjust = async (productId: string, qty: string, reason = "opening_balance") =>
    http()
      .post("/api/v1/inventory/adjustments")
      .set(as())
      .send({ warehouseId: main, reason, lines: [{ productId, qty, unitCost: qty.startsWith("-") ? undefined : "1" }] })
      .expect(201)
      .then((adj) => http().post(`/api/v1/inventory/adjustments/${adj.body.id}/submit`).set(as()).expect(200));
  const drain = () => app.get(JobQueueService).drain();

  it("keeps rule management behind the edit permission, and blocks an outsider entirely", async () => {
    await http().post("/api/v1/automation/rules").set(as("viewer")).send({ name: "x", eventType: "LowStock" }).expect(403);
    await http().get("/api/v1/automation/rules").set(as("outsider")).expect(403);
  });

  it("fires a matching rule on a LowStock event: notifies a user, opens a task and raises a requisition", async () => {
    const p = await product("Sand bag");
    const rule = await http()
      .post("/api/v1/automation/rules")
      .set(as())
      .send({
        name: "Reorder on low stock",
        eventType: "LowStock",
        conditions: [{ field: "payload.available", operator: "lte", value: "10000" }],
        actions: [
          { type: "notify", config: { userIds: adminId, category: "automation.lowstock", title: "Low stock: {{payload.productId}}" } },
          { type: "create_task", config: { title: "Follow up on low stock for {{payload.productId}}", assigneeId: "actor" } },
          { type: "create_requisition", config: { productId: "{{payload.productId}}", qty: "{{qty:payload.reorderQty}}" } },
        ],
      })
      .expect(201);

    await adjust(p, "10");
    await http().put(`/api/v1/inventory/stock/${p}/reorder`).set(as()).send({ reorderPoint: "5", reorderQty: "20" }).expect(200);
    await adjust(p, "-6", "damaged"); // available drops to 4 (<= 10 in the condition), triggers LowStock
    await drain();

    const notifications = await http().get("/api/v1/me/notifications").set(as()).expect(200);
    expect(notifications.body.find((n: { category: string; title: string }) => n.category === "automation.lowstock")).toMatchObject({ title: `Low stock: ${p}` });

    const mine = await http().get("/api/v1/tasks/mine").set(as()).expect(200);
    expect(mine.body.find((task: { title: string }) => task.title === `Follow up on low stock for ${p}`)).toBeTruthy();

    const requisitions = await http().get("/api/v1/procurement/requisitions").set(as()).expect(200);
    const created = requisitions.body.items.find((r: { lines: { productId: string }[] }) => r.lines.some((l) => l.productId === p));
    expect(created).toMatchObject({ justification: "Auto-created by an automation rule" });
    expect(created.lines[0]).toMatchObject({ productId: p, qty: 20000 });

    const after = await http().get(`/api/v1/automation/rules/${rule.body.id}`).set(as()).expect(200);
    expect(after.body.recentRuns[0]).toMatchObject({ matched: true, actions: [{ type: "notify", ok: true }, { type: "create_task", ok: true }, { type: "create_requisition", ok: true }] });
  });

  it("records a non-match without running any action", async () => {
    const p = await product("Steel rod");
    const rule = await http()
      .post("/api/v1/automation/rules")
      .set(as())
      .send({ name: "Never matches", eventType: "LowStock", conditions: [{ field: "payload.available", operator: "lte", value: "0" }], actions: [{ type: "notify", config: { userIds: adminId, title: "Should not fire" } }] })
      .expect(201);

    await adjust(p, "10");
    await http().put(`/api/v1/inventory/stock/${p}/reorder`).set(as()).send({ reorderPoint: "5", reorderQty: "20" }).expect(200);
    await adjust(p, "-6", "damaged");
    await drain();

    const after = await http().get(`/api/v1/automation/rules/${rule.body.id}`).set(as()).expect(200);
    expect(after.body.recentRuns[0]).toMatchObject({ matched: false, actions: [] });
    const notifications = await http().get("/api/v1/me/notifications").set(as()).expect(200);
    expect(notifications.body.find((n: { title: string }) => n.title === "Should not fire")).toBeFalsy();
  });

  it("does not fire an inactive rule", async () => {
    const p = await product("Paint can");
    const rule = await http()
      .post("/api/v1/automation/rules")
      .set(as())
      .send({ name: "Disabled rule", eventType: "LowStock", conditions: [{ field: "payload.available", operator: "lte", value: "10000" }], actions: [{ type: "notify", config: { userIds: adminId, title: "Should not fire either" } }] })
      .expect(201);
    await http().patch(`/api/v1/automation/rules/${rule.body.id}`).set({ ...as(), "If-Match": "1" }).send({ active: false }).expect(200);

    await adjust(p, "10");
    await http().put(`/api/v1/inventory/stock/${p}/reorder`).set(as()).send({ reorderPoint: "5", reorderQty: "20" }).expect(200);
    await adjust(p, "-6", "damaged");
    await drain();

    const after = await http().get(`/api/v1/automation/rules/${rule.body.id}`).set(as()).expect(200);
    expect(after.body.recentRuns).toHaveLength(0);
  });

  it("lets an author test-run a rule against a synthetic payload", async () => {
    const rule = await http()
      .post("/api/v1/automation/rules")
      .set(as())
      .send({ name: "Manual test", eventType: "LowStock", conditions: [{ field: "payload.available", operator: "lt", value: "5" }], actions: [{ type: "notify", config: { userIds: adminId, title: "Test fired: {{payload.productId}}" } }] })
      .expect(201);

    const miss = await http().post(`/api/v1/automation/rules/${rule.body.id}/test-run`).set(as()).send({ payload: { productId: "sim-1", available: "9" } }).expect(200);
    expect(miss.body.recentRuns[0]).toMatchObject({ eventId: null, matched: false });

    const hit = await http().post(`/api/v1/automation/rules/${rule.body.id}/test-run`).set(as()).send({ payload: { productId: "sim-2", available: "1" } }).expect(200);
    expect(hit.body.recentRuns[0]).toMatchObject({ eventId: null, matched: true, actions: [{ type: "notify", ok: true }] });

    await http().post(`/api/v1/automation/rules/${rule.body.id}/test-run`).set(as("viewer")).send({}).expect(403);
  });
});
