import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";
import { EventBusService } from "../../src/platform/events/event-bus.service.js";
import { scoreLead } from "../../src/crm/crm.services.js";
import { DEFAULT_SCORING } from "../../src/crm/crm.models.js";

describe("CRM over HTTP", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (user: "admin" | "viewer" = "admin") => ({ Authorization: `Bearer ${t.token(user)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["crm.lead.view", "crm.account.view"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("scores leads from rules", () => {
    expect(scoreLead({ email: "a@b.co", phone: "1", company: "X", title: "Sales Director", source: "referral" }, DEFAULT_SCORING)).toBe(65);
    expect(scoreLead({}, DEFAULT_SCORING)).toBe(0);
  });

  it("numbers customers, stores money exactly and flags duplicates", async () => {
    const a = await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Lanka Tiles PLC", creditLimit: "250000.50", currency: "LKR" }).expect(201);
    expect(a.body).toMatchObject({ code: "CUS-000001", creditLimit: 25000050, nameLower: "lanka tiles plc", status: "active" });
    const dup = await http().post("/api/v1/crm/accounts").set(as()).send({ name: "lanka tiles plc" }).expect(409);
    expect(dup.body.duplicates[0]).toMatchObject({ entityType: "crm.account", id: a.body.id, match: "name" });
    const forced = await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Lanka Tiles PLC", allowDuplicate: true }).expect(201);
    expect(forced.body.code).toBe("CUS-000002");
    await http().post("/api/v1/crm/accounts").set(as("viewer")).send({ name: "Nope" }).expect(403);
  });

  it("lists large collections with indexed filters, sorting, search and paging", async () => {
    for (const [i, status] of ["new", "new", "qualified", "new", "contacted"].entries()) {
      await http().post("/api/v1/crm/leads").set(as()).send({ firstName: `Lead${i}`, lastName: "Perera", status, email: `lead${i}@ex.lk`, company: i % 2 ? "Ceylon Tea Co" : undefined }).expect(201);
    }
    const page1 = await http().get("/api/v1/crm/leads?where=status:new&limit=2").set(as("viewer")).expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();
    const page2 = await http().get(`/api/v1/crm/leads?where=status:new&limit=2&cursor=${page1.body.nextCursor}`).set(as("viewer")).expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    const byScore = await http().get("/api/v1/crm/leads?sort=-score").set(as("viewer")).expect(200);
    const scores = byScore.body.items.map((l: { score: number }) => l.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    const search = await http().get("/api/v1/crm/leads?q=ceylon").set(as("viewer")).expect(200);
    expect(search.body.items.map((l: { company: string }) => l.company)).toEqual(["Ceylon Tea Co", "Ceylon Tea Co"]);
    await http().get("/api/v1/crm/leads?sort=lastName").set(as("viewer")).expect(400);
  });

  it("routes new leads to the configured people", async () => {
    await http().put("/api/v1/crm/settings").set(as()).send({ assignmentMode: "roundRobin", assignees: [`${t.tenantId}_viewer`] }).expect(200);
    const lead = await http().post("/api/v1/crm/leads").set(as()).send({ firstName: "Routed", lastName: "Lead" }).expect(201);
    expect(lead.body.ownerUserId).toBe(`${t.tenantId}_viewer`);
    await http().put("/api/v1/crm/settings").set(as()).send({ assignmentMode: "owner" }).expect(200);
  });

  it("converts a lead into a customer, contact and opportunity, linked together", async () => {
    const lead = await http().post("/api/v1/crm/leads").set(as()).send({ firstName: "Nimal", lastName: "Silva", company: "Silva Hardware", email: "nimal@silva.lk", status: "qualified" }).expect(201);
    const res = await http().post(`/api/v1/crm/leads/${lead.body.id}/convert`).set(as()).send({ createOpportunity: true, amount: "1500000", opportunityName: "Store fit-out" }).expect(200);
    expect(res.body.account).toMatchObject({ name: "Silva Hardware", code: expect.stringMatching(/^CUS-\d{6}$/) });
    expect(res.body.contact).toMatchObject({ firstName: "Nimal", accountId: res.body.account.id });
    expect(res.body.opportunity).toMatchObject({ name: "Store fit-out", amount: 150000000, stage: "qualification", leadId: lead.body.id });
    expect(res.body.lead.status).toBe("converted");

    const related = await http().get(`/api/v1/records/crm.lead/${lead.body.id}/related`).set(as()).expect(200);
    expect(related.body.map((r: { entityType: string }) => r.entityType).sort()).toEqual(["crm.account", "crm.contact", "crm.opportunity"]);
    await http().post(`/api/v1/crm/leads/${lead.body.id}/convert`).set(as()).send({}).expect(400);
    await http().patch(`/api/v1/crm/leads/${lead.body.id}`).set(as()).send({ notes: "late" }).expect(400);
  });

  it("moves opportunities through stages and requires a listed reason to lose", async () => {
    const bus = app.get(EventBusService);
    const won: string[] = [];
    bus.subscribe("OpportunityWon", `test.won.${Date.now()}`, async (e) => void won.push(e.entityId));

    const opp = await http().post("/api/v1/crm/opportunities").set(as()).send({ name: "Fleet deal", amount: "99.99" }).expect(201);
    expect(opp.body).toMatchObject({ stage: "prospecting", probability: 10, amount: 9999 });
    await http().patch(`/api/v1/crm/opportunities/${opp.body.id}`).set(as()).send({ stage: "won" }).expect(400);
    await http().post(`/api/v1/crm/opportunities/${opp.body.id}/stage`).set(as()).send({ stage: "lost", reason: "aliens" }).expect(400);
    const prop = await http().post(`/api/v1/crm/opportunities/${opp.body.id}/stage`).set(as()).send({ stage: "proposal" }).expect(200);
    expect(prop.body.probability).toBe(50);
    const closed = await http().post(`/api/v1/crm/opportunities/${opp.body.id}/stage`).set(as()).send({ stage: "won", reason: "best price" }).expect(200);
    expect(closed.body).toMatchObject({ stage: "won", forecastCategory: "closed", winLossReason: "best price" });
    expect(closed.body.stageHistory.map((h: { stage: string }) => h.stage)).toEqual(["prospecting", "proposal", "won"]);
    await app.get(JobQueueService).drain();
    expect(won).toContain(opp.body.id);
  });

  it("ties activities to the customer of the related record and completes them", async () => {
    const account = await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Activity Test Ltd" }).expect(201);
    const contact = await http().post("/api/v1/crm/contacts").set(as()).send({ firstName: "Kamal", lastName: "Fernando", accountId: account.body.id }).expect(201);
    const act = await http().post("/api/v1/crm/activities").set(as()).send({ type: "call", subject: "Intro call", relatedType: "crm.contact", relatedId: contact.body.id }).expect(201);
    expect(act.body).toMatchObject({ accountId: account.body.id, relatedKey: `crm.contact:${contact.body.id}`, status: "planned" });
    await http().post("/api/v1/crm/activities").set(as()).send({ type: "call", subject: "Bad", relatedType: "crm.contact", relatedId: "nope" }).expect(400);
    const done = await http().post(`/api/v1/crm/activities/${act.body.id}/complete`).set(as()).send({ outcome: "Interested" }).expect(200);
    expect(done.body).toMatchObject({ status: "done", outcome: "Interested" });
    expect(done.body.completedAt).toBeTruthy();
    const forAccount = await http().get(`/api/v1/crm/activities?where=accountId:${account.body.id}`).set(as()).expect(200);
    expect(forAccount.body.items.map((a: { id: string }) => a.id)).toEqual([act.body.id]);
  });

  it("summarises the funnel and pipeline", async () => {
    await http().get("/api/v1/crm/analytics").set(as("viewer")).expect(403);
    const res = await http().get("/api/v1/crm/analytics").set(as()).expect(200);
    expect(res.body.leads.total).toBeGreaterThan(0);
    expect(res.body.leads.byStatus.converted).toBe(1);
    expect(res.body.winRate).toBe(1);
    expect(res.body.pipeline.won.amount).toBe(9999);
  });
});
