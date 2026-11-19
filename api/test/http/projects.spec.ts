import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Projects", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
  });
  afterAll(async () => {
    await app?.close();
  });

  let projectId: string;
  let milestoneId: string;

  it("sets up a project with a customer and budget", async () => {
    const account = await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Lanka Retail PLC" }).expect(201);
    const project = await http().post("/api/v1/projects").set(as()).send({
      code: "PRJ-1", name: "Storefront revamp", customerId: account.body.id, budget: "500000.00", billingMethod: "milestone", priority: "high",
    }).expect(201);
    projectId = project.body.id;
    expect(project.body).toMatchObject({ status: "planning", budget: 50_000_000, billedToDate: 0 });

    const phase = await http().post("/api/v1/projects/phases").set(as()).send({ projectId, name: "Design", sequence: 1 }).expect(201);
    expect(phase.body.status).toBe("not_started");

    const milestone = await http().post("/api/v1/projects/milestones").set(as()).send({ projectId, phaseId: phase.body.id, name: "Design sign-off", dueDate: "2026-12-10" }).expect(201);
    milestoneId = milestone.body.id;
    const completed = await http().post(`/api/v1/projects/milestones/${milestoneId}/complete`).set(as()).expect(200);
    expect(completed.body.status).toBe("completed");

    await http().post("/api/v1/projects/costs").set(as()).send({ projectId, category: "material", amount: "30000.00", date: "2026-12-01", description: "Signage" }).expect(201);
  });

  it("logs billable time against the project and summarises budget vs actual", async () => {
    await http().post("/api/v1/tasks/time-entries").set(as("viewer")).send({ date: "2026-12-02", projectId, hours: "8", cost: "20000.00" }).expect(201);

    const summary = await http().get(`/api/v1/projects/${projectId}/summary`).set(as()).expect(200);
    // Labour 20,000 + material 30,000 = 50,000 actual cost; budget 500,000 - 50,000 = 450,000 variance; nothing billed yet.
    expect(summary.body).toMatchObject({ laborCost: 2_000_000, materialCost: 3_000_000, actualCost: 5_000_000, budgetVariance: 45_000_000, billedToDate: 0, profitability: -5_000_000 });
    expect(summary.body.milestones).toHaveLength(1);
    expect(summary.body.costs).toHaveLength(1);
  });

  it("bills the project's customer and updates billedToDate and profitability", async () => {
    const invoice = await http().post(`/api/v1/projects/${projectId}/bill`).set(as()).send({ amount: "100000.00", description: "Design milestone" }).expect(201);
    expect(invoice.body).toMatchObject({ invoiceType: "milestone", status: "draft" });

    // The default 18% VAT tax code applies even without a full chart of accounts: 100,000 net x 1.18 = 118,000 total.
    const project = await http().get(`/api/v1/projects/${projectId}`).set(as()).expect(200);
    expect(project.body.billedToDate).toBe(11_800_000);

    const summary = await http().get(`/api/v1/projects/${projectId}/summary`).set(as()).expect(200);
    expect(summary.body).toMatchObject({ billedToDate: 11_800_000, profitability: 11_800_000 - 5_000_000 });

    await http().post(`/api/v1/projects/${projectId}/bill`).set(as("viewer")).send({ amount: "1.00", description: "x" }).expect(403);
  });
});
