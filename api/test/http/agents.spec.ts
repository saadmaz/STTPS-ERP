import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";

describe("AI agents", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["ai.agents.act"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("keeps agent actions behind the baseline permission, and behind a per-tier permission inside it", async () => {
    await http().post("/api/v1/ai/agents/act").set(as("outsider")).send({ actionName: "notify_user", input: {} }).expect(403);
    // viewer has ai.agents.act but not ai.agents.lowRiskExecute
    await http().post("/api/v1/ai/agents/act").set(as("viewer")).send({ actionName: "notify_user", input: { title: "Hi" } }).expect(403);
  });

  it("executes a low-risk action immediately", async () => {
    const res = await http().post("/api/v1/ai/agents/act").set(as()).send({ actionName: "notify_user", input: { title: "Agent said hi", userIds: [`${t.tenantId}_admin`] } }).expect(200);
    expect(res.body).toMatchObject({ status: "executed", result: { notified: 1 } });
    const notifications = await http().get("/api/v1/me/notifications").set(as()).expect(200);
    expect(notifications.body.find((n: { title: string }) => n.title === "Agent said hi")).toBeTruthy();
  });

  it("auto-approves an approval-required action when no workflow applies, and requires approval once one does", async () => {
    const before = (await http().get("/api/v1/procurement/requisitions").set(as()).expect(200)).body.items.length;
    const auto = await http()
      .post("/api/v1/ai/agents/act")
      .set(as())
      .send({ actionName: "create_requisition", input: { lines: [{ description: "Office chairs", qty: "3" }] } })
      .expect(200);
    expect(auto.body.status).toBe("executed");
    expect((await http().get("/api/v1/procurement/requisitions").set(as()).expect(200)).body.items.length).toBe(before + 1);

    await http().post("/api/v1/workflow/definitions").set(as()).send({
      code: "AGENT-REQ", name: "Agent requisitions", entityType: "ai.agentAction",
      steps: [{ name: "Reviewer", approvers: [{ type: "user", ids: [`${t.tenantId}_viewer`] }] }],
    }).expect(201);

    const pending = await http()
      .post("/api/v1/ai/agents/act")
      .set(as())
      .send({ actionName: "create_requisition", input: { lines: [{ description: "More office chairs", qty: "2" }] } })
      .expect(200);
    expect(pending.body.status).toBe("pending_approval");
    expect(pending.body.requestId).toBeTruthy();
    expect((await http().get("/api/v1/procurement/requisitions").set(as()).expect(200)).body.items.length).toBe(before + 1); // not yet created

    await http().post(`/api/v1/workflow/requests/${pending.body.requestId}/approve`).set(as("viewer")).send({}).expect(200);
    await app.get(JobQueueService).drain();
    expect((await http().get("/api/v1/procurement/requisitions").set(as()).expect(200)).body.items.length).toBe(before + 2);
  });
});
