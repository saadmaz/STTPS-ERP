import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Analytics export", () => {
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

  it("requires the export permission", async () => {
    await http().post("/api/v1/analytics/export/run").set(as("viewer")).send({}).expect(403);
    await http().post("/api/v1/analytics/export/run").set(as("outsider")).send({}).expect(403);
  });

  it("no-ops with a per-source result when BigQuery isn't configured", async () => {
    delete process.env.BIGQUERY_DATASET;
    const res = await http().post("/api/v1/analytics/export/run").set(as()).send({ sources: ["crm.lead", "tasks.task"] }).expect(200);
    expect(res.body).toEqual([
      { source: "crm.lead", ok: true, configured: false, inserted: 0 },
      { source: "tasks.task", ok: true, configured: false, inserted: 0 },
    ]);
  });

  it("defaults to every registered source", async () => {
    const res = await http().post("/api/v1/analytics/export/run").set(as()).send({}).expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    expect(res.body.map((r: { source: string }) => r.source)).toContain("sales.order");
  });
});
