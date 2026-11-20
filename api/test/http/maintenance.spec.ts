import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Maintenance: plans and work orders", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  let assetId: string;
  let planId: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    for (const a of (await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200)).body.items) acct[a.code] = a.id;
    const category = (await http().post("/api/v1/assets/categories").set(as()).send({
      code: "VEH", name: "Vehicles", assetAccountId: acct["1610"], accumulatedAccountId: acct["1690"], expenseAccountId: acct["6400"], usefulLifeMonths: 60,
    }).expect(201)).body.id;
    assetId = (await http().post("/api/v1/assets/register").set(as()).send({ name: "Delivery van", categoryId: category, cost: "3500000.00" }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("creates a plan and generates a preventive work order from it, advancing the plan's due date", async () => {
    const plan = await http().post("/api/v1/maintenance/plans").set(as()).send({
      assetId, name: "Oil change", frequency: "monthly", nextDueDate: "2026-12-01", checklistTemplate: ["Drain oil", "Replace filter"],
    }).expect(201);
    planId = plan.body.id;

    const wo = await http().post(`/api/v1/maintenance/plans/${planId}/generate-work-order`).set(as()).expect(201);
    expect(wo.body).toMatchObject({ code: "WO-000001", assetId, planId, type: "preventive", status: "requested" });
    expect(wo.body.checklist).toHaveLength(2);

    // The plan advances 30 days (monthly) from today, not from its old due date.
    const expectedNextDue = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const updatedPlan = await http().get(`/api/v1/maintenance/plans/${planId}`).set(as()).expect(200);
    expect(updatedPlan.body).toMatchObject({ lastDoneDate: new Date().toISOString().slice(0, 10), nextDueDate: expectedNextDue });
  });

  it("assigns a technician, starts the order, logs parts and labour, and tracks a checklist", async () => {
    const list = await http().get("/api/v1/maintenance/work-orders").set(as()).expect(200);
    const woId = list.body.items[0].id;

    await http().post(`/api/v1/maintenance/work-orders/${woId}/assign`).set(as()).send({ assignedTo: "tech-1" }).expect(200);
    const started = await http().post(`/api/v1/maintenance/work-orders/${woId}/start`).set(as()).expect(200);
    expect(started.body.status).toBe("in_progress");

    const withPart = await http().post(`/api/v1/maintenance/work-orders/${woId}/parts`).set(as()).send({ productId: "prod-oil", qty: "4", unitCost: "1500.00" }).expect(200);
    expect(withPart.body.partsCost).toBe(600_000); // 4 x 1,500.00

    const withLabor = await http().post(`/api/v1/maintenance/work-orders/${woId}/labor`).set(as()).send({ hours: "1.5", hourlyCost: "2000.00" }).expect(200);
    expect(withLabor.body).toMatchObject({ laborHours: 1_500, laborCost: 300_000, totalCost: 900_000 });

    const checklist = await http().post(`/api/v1/maintenance/work-orders/${woId}/checklist`).set(as()).send({ text: "Check tyre pressure" }).expect(201);
    const itemId = checklist.body.checklist.find((c: { text: string }) => c.text === "Check tyre pressure").itemId;
    const checked = await http().patch(`/api/v1/maintenance/work-orders/${woId}/checklist/${itemId}`).set(as()).send({ done: true }).expect(200);
    expect(checked.body.checklist.find((c: { itemId: string }) => c.itemId === itemId)).toMatchObject({ done: true });

    const completed = await http().post(`/api/v1/maintenance/work-orders/${woId}/complete`).set(as()).send({ downtimeMinutes: 90 }).expect(200);
    expect(completed.body).toMatchObject({ status: "completed", downtimeMinutes: 90 });

    const asset = await http().get(`/api/v1/assets/register/${assetId}`).set(as()).expect(200);
    expect(asset.body.history.at(-1)).toMatchObject({ event: "maintained", detail: expect.stringContaining("WO-000001") });

    await http().post(`/api/v1/maintenance/work-orders/${woId}/complete`).set(as()).send({}).expect(400);
    await http().post(`/api/v1/maintenance/work-orders/${woId}/cancel`).set(as("viewer")).expect(403);
  });
});
