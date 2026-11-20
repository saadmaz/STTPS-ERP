import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Marketing", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["marketing.campaign.view"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  let campaignId: string;

  it("creates a campaign and numbers it", async () => {
    const campaign = await http().post("/api/v1/marketing/campaigns").set(as()).send({
      name: "Spring Promo", type: "email", budget: "50000", startDate: "2026-03-01", channels: ["email", "social"],
    }).expect(201);
    campaignId = campaign.body.id;
    expect(campaign.body).toMatchObject({ code: expect.stringMatching(/^CMP-\d{4}-\d{6}$/), status: "draft", budget: 5_000_000 });
  });

  it("previews a segment by handing its filter to the usual CRM list endpoint", async () => {
    await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Big Co", status: "active" }).expect(201);
    await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Blocked Co", status: "blocked" }).expect(201);

    const segment = await http().post("/api/v1/marketing/segments").set(as()).send({
      name: "Active accounts", entityType: "crm.account", filter: "status:active",
    }).expect(201);
    const preview = await http().get(`/api/v1/marketing/segments/${segment.body.id}/preview`).set(as()).expect(200);
    expect(preview.body.items.every((a: { status: string }) => a.status === "active")).toBe(true);
    expect(preview.body.items.some((a: { name: string }) => a.name === "Big Co")).toBe(true);
    expect(preview.body.items.some((a: { name: string }) => a.name === "Blocked Co")).toBe(false);
  });

  it("reports leads, conversions and revenue attributed to a campaign by name", async () => {
    const lead = await http().post("/api/v1/crm/leads").set(as()).send({ firstName: "Nadia", lastName: "Perera", email: "nadia@example.com", campaign: "Spring Promo" }).expect(201);
    const other = await http().post("/api/v1/crm/leads").set(as()).send({ firstName: "Someone", lastName: "Else", email: "someone@example.com" }).expect(201);
    void other;

    const converted = await http().post(`/api/v1/crm/leads/${lead.body.id}/convert`).set(as()).send({}).expect(200);
    const accountId = converted.body.account.id;
    const opp = await http().post("/api/v1/crm/opportunities").set(as()).send({ name: "Spring deal", accountId, amount: "200000" }).expect(201);
    await http().post(`/api/v1/crm/opportunities/${opp.body.id}/stage`).set(as()).send({ stage: "won", reason: "Closed won" }).expect(200);

    const report = await http().get(`/api/v1/marketing/campaigns/${campaignId}/report`).set(as()).expect(200);
    expect(report.body).toMatchObject({ leadsCount: 1, conversions: 1, revenue: 20_000_000, budget: 5_000_000 });
    expect(report.body.costPerLead).toBe(5_000_000);
    expect(report.body.roi).toBeGreaterThan(0);
  });

  let sequenceId: string;
  let enrollmentId: string;

  it("builds a sequence with steps and enrolls a lead at step 0", async () => {
    const sequence = await http().post("/api/v1/marketing/sequences").set(as()).send({
      name: "Welcome flow", trigger: "welcome",
      steps: [{ seq: 1, delayDays: 0, subject: "Welcome!", body: "Thanks for joining." }, { seq: 2, delayDays: 3, subject: "Here's more", body: "..." }],
    }).expect(201);
    sequenceId = sequence.body.id;
    expect(sequence.body.steps).toHaveLength(2);

    const lead = await http().post("/api/v1/crm/leads").set(as()).send({ firstName: "Ravi", lastName: "Fernando" }).expect(201);
    const enrollment = await http().post("/api/v1/marketing/enrollments").set(as()).send({ sequenceId, leadId: lead.body.id }).expect(201);
    enrollmentId = enrollment.body.id;
    expect(enrollment.body).toMatchObject({ status: "active", currentStep: -1, nextStepDueAt: null });
  });

  it("keeps enrollment actions behind the edit permission", async () => {
    await http().post(`/api/v1/marketing/enrollments/${enrollmentId}/advance`).set(as("viewer")).expect(403);
  });

  it("advances an enrollment through its steps to completion, then refuses a further advance", async () => {
    const step1 = await http().post(`/api/v1/marketing/enrollments/${enrollmentId}/advance`).set(as()).expect(200);
    expect(step1.body).toMatchObject({ currentStep: 0 });
    expect(step1.body.nextStepDueAt).toBeTruthy();

    const step2 = await http().post(`/api/v1/marketing/enrollments/${enrollmentId}/advance`).set(as()).expect(200);
    expect(step2.body).toMatchObject({ currentStep: 1 });

    const done = await http().post(`/api/v1/marketing/enrollments/${enrollmentId}/advance`).set(as()).expect(200);
    expect(done.body).toMatchObject({ status: "completed", nextStepDueAt: null });

    await http().post(`/api/v1/marketing/enrollments/${enrollmentId}/advance`).set(as()).expect(400); // already completed
  });

  it("cancels an active enrollment", async () => {
    const lead = await http().post("/api/v1/crm/leads").set(as()).send({ firstName: "Second", lastName: "Lead" }).expect(201);
    const enrollment = await http().post("/api/v1/marketing/enrollments").set(as()).send({ sequenceId, leadId: lead.body.id }).expect(201);
    const cancelled = await http().post(`/api/v1/marketing/enrollments/${enrollment.body.id}/cancel`).set(as()).expect(200);
    expect(cancelled.body.status).toBe("cancelled");
  });
});
