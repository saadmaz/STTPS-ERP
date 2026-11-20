import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Reports", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["analytics.reportDefinition.view", "crm.lead.view"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  const lead = async (status: string) =>
    http().post("/api/v1/crm/leads").set(as()).send({ firstName: "Test", lastName: status, status, email: `${status}.${Date.now()}@ex.lk` }).expect(201);

  it("keeps report management behind the create permission, and blocks an outsider entirely", async () => {
    await http().post("/api/v1/reports/definitions").set(as("viewer")).send({ name: "x", source: "crm.lead" }).expect(403);
    await http().get("/api/v1/reports/definitions").set(as("outsider")).expect(403);
  });

  it("filters, groups, aggregates, computes a calculated field, and compares to the prior period", async () => {
    await lead("new");
    await lead("new");
    await lead("contacted");

    const todayStart = new Date().toISOString().slice(0, 10);
    const todayEnd = `${todayStart}T23:59:59.999Z`;
    const def = await http()
      .post("/api/v1/reports/definitions")
      .set(as())
      .send({
        name: "Leads today by status",
        source: "crm.lead",
        filters: [{ field: "createdAt", operator: "gte", value: `${todayStart}T00:00:00.000Z` }, { field: "createdAt", operator: "lte", value: todayEnd }],
        groupBy: ["status"],
        aggregations: [{ field: "id", fn: "count", label: "count" }],
        calculatedFields: [{ name: "flag", label: "Flag", left: "1", op: "+", right: "1" }],
        compareField: "createdAt",
      })
      .expect(201);

    const run = await http().get(`/api/v1/reports/definitions/${def.body.id}/run`).set(as()).expect(200);
    expect(run.body.summary).toMatchObject({ count: 3 });
    expect(run.body.previousSummary).toMatchObject({ count: 0 });
    expect(run.body.rows.find((r: { status: string; count: number }) => r.status === "new")).toMatchObject({ count: 2 });
    expect(run.body.rows.find((r: { status: string; count: number }) => r.status === "contacted")).toMatchObject({ count: 1 });

    // A user with only the lead-view permission (not analytics.reportDefinition.create) can still run a report they can see.
    await http().get(`/api/v1/reports/definitions/${def.body.id}/run`).set(as("viewer")).expect(200);

    const csv = await http().get(`/api/v1/reports/definitions/${def.body.id}/export.csv`).set(as()).expect(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text.split("\n")[0]).toContain("status");

    const xlsx = await http().get(`/api/v1/reports/definitions/${def.body.id}/export.xlsx`).set(as()).expect(200);
    expect(xlsx.headers["content-type"]).toContain("spreadsheetml");
  });

  it("checks the source's own permission when running, separately from the report-definition permission", async () => {
    const def = await http().post("/api/v1/reports/definitions").set(as()).send({ name: "All tasks", source: "tasks.task" }).expect(201);
    await http().get(`/api/v1/reports/definitions/${def.body.id}/run`).set(as()).expect(200);
    await http().get(`/api/v1/reports/definitions/${def.body.id}/run`).set(as("viewer")).expect(403); // viewer lacks tasks.allTasks.view
  });
});
