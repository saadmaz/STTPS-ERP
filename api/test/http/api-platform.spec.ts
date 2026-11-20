import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";

describe("API platform: keys and webhooks", () => {
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

  it("keeps key management behind the create permission", async () => {
    await http().post("/api/v1/platform/api-keys").set(as("viewer")).send({ name: "x" }).expect(403);
  });

  it("authenticates and scopes a request via x-api-key, and rejects after revoke", async () => {
    const created = await http().post("/api/v1/platform/api-keys").set(as()).send({ name: "Integration", permissions: ["crm.lead.view"] }).expect(201);
    const key = created.body.key as string;
    expect(key).toMatch(/^sttps_/);
    expect(created.body.apiKey.prefix).toBe(key.slice(0, 14));

    // In scope: crm.lead.view
    await http().get("/api/v1/crm/leads").set({ "x-api-key": key }).expect(200);
    // Out of scope: no finance.account.view
    await http().get("/api/v1/finance/accounts").set({ "x-api-key": key }).expect(403);

    await http().post(`/api/v1/platform/api-keys/${created.body.apiKey.id}/revoke`).set(as()).expect(200);
    await http().get("/api/v1/crm/leads").set({ "x-api-key": key }).expect(401);
  });

  it("rate-limits requests per key", async () => {
    const created = await http().post("/api/v1/platform/api-keys").set(as()).send({ name: "Rate limited", permissions: ["crm.lead.view"], rateLimitPerMinute: 2 }).expect(201);
    const key = created.body.key as string;
    await http().get("/api/v1/crm/leads").set({ "x-api-key": key }).expect(200);
    await http().get("/api/v1/crm/leads").set({ "x-api-key": key }).expect(200);
    await http().get("/api/v1/crm/leads").set({ "x-api-key": key }).expect(429);
  });

  it("delivers a webhook for a subscribed event, and records a failed delivery to an unreachable url", async () => {
    const webhook = await http()
      .post("/api/v1/platform/webhooks")
      .set(as())
      .send({ name: "Lead conversions", url: "http://127.0.0.1:1/webhook", eventTypes: ["LeadConverted"] })
      .expect(201);

    const lead = await http().post("/api/v1/crm/leads").set(as()).send({ firstName: "Web", lastName: "Hook", email: `wh.${Date.now()}@ex.lk` }).expect(201);
    await http().post(`/api/v1/crm/leads/${lead.body.id}/convert`).set(as()).send({ createOpportunity: false }).expect(200);
    await app.get(JobQueueService).drain();

    const after = await http().get(`/api/v1/platform/webhooks/${webhook.body.id}`).set(as()).expect(200);
    expect(after.body.lastDeliveryStatus).toBe("failed");
    expect(after.body.lastDeliveryError).toBeTruthy();
  });
});
