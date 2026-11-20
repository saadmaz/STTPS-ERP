import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Dashboards and KPIs", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["analytics.reportDefinition.view", "analytics.kpiDefinition.view", "analytics.dashboard.view"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  const lead = async () => http().post("/api/v1/crm/leads").set(as()).send({ firstName: "Test", lastName: "Lead", email: `lead.${Date.now()}.${Math.random()}@ex.lk` }).expect(201);

  it("computes a KPI's live value and status from thresholds, and runs a dashboard with mixed widgets", async () => {
    await lead();
    await lead();

    const report = await http()
      .post("/api/v1/reports/definitions")
      .set(as())
      .send({ name: "Lead count", source: "crm.lead", aggregations: [{ field: "id", fn: "count", label: "leadCount" }] })
      .expect(201);

    const kpi = await http()
      .post("/api/v1/reports/kpis")
      .set(as())
      .send({ name: "Leads", reportId: report.body.id, metric: "leadCount", target: 10, warningThreshold: 3, criticalThreshold: 1, direction: "higher_is_better" })
      .expect(201);

    const kpiRun = await http().get(`/api/v1/reports/kpis/${kpi.body.id}/run`).set(as()).expect(200);
    expect(kpiRun.body).toMatchObject({ name: "Leads", value: 2, status: "warning", target: 10 });

    const dashboard = await http()
      .post("/api/v1/reports/dashboards")
      .set(as())
      .send({
        name: "Sales overview",
        widgets: [
          { id: "w1", type: "kpi", title: "Leads", kpiId: kpi.body.id, x: 0, y: 0, w: 2, h: 1 },
          { id: "w2", type: "report_table", title: "Lead list", reportId: report.body.id, x: 2, y: 0, w: 4, h: 2 },
          { id: "w3", type: "alerts", title: "Alerts", x: 0, y: 1, w: 2, h: 2 },
        ],
      })
      .expect(201);

    const run = await http().get(`/api/v1/reports/dashboards/${dashboard.body.id}/run`).set(as()).expect(200);
    expect(run.body.widgets).toHaveLength(3);
    const w1 = run.body.widgets.find((w: { id: string }) => w.id === "w1");
    expect(w1.data).toMatchObject({ value: 2, status: "warning" });
    const w2 = run.body.widgets.find((w: { id: string }) => w.id === "w2");
    expect(w2.data.rows).toHaveLength(2);
    const w3 = run.body.widgets.find((w: { id: string }) => w.id === "w3");
    expect(Array.isArray(w3.data)).toBe(true);
  });

  it("requires the single-widget permission directly, but degrades gracefully inside a dashboard", async () => {
    const report = await http().post("/api/v1/reports/definitions").set(as()).send({ name: "Leads 2", source: "crm.lead" }).expect(201);
    await http().get(`/api/v1/reports/definitions/${report.body.id}/run`).set(as("viewer")).expect(403); // viewer lacks crm.lead.view

    const dashboard = await http()
      .post("/api/v1/reports/dashboards")
      .set(as())
      .send({ name: "Mixed", widgets: [{ id: "w1", type: "report_table", title: "Leads", reportId: report.body.id, x: 0, y: 0, w: 2, h: 2 }, { id: "w2", type: "alerts", title: "Alerts", x: 0, y: 0, w: 2, h: 2 }] })
      .expect(201);

    const run = await http().get(`/api/v1/reports/dashboards/${dashboard.body.id}/run`).set(as("viewer")).expect(200);
    const w1 = run.body.widgets.find((w: { id: string }) => w.id === "w1");
    expect(w1.data).toBeNull();
    expect(w1.error).toContain("Permission required");
    const w2 = run.body.widgets.find((w: { id: string }) => w.id === "w2");
    expect(Array.isArray(w2.data)).toBe(true);
  });

  it("keeps dashboard and KPI creation behind the create permission", async () => {
    await http().post("/api/v1/reports/dashboards").set(as("viewer")).send({ name: "x" }).expect(403);
    await http().post("/api/v1/reports/kpis").set(as("viewer")).send({ name: "x", reportId: "r1", metric: "count" }).expect(403);
  });
});
