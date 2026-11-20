import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("EHS", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["ehs.incident.view"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  let incidentId: string;
  let riskId: string;
  let permitId: string;

  it("keeps incident actions behind the edit permission", async () => {
    const incident = await http().post("/api/v1/ehs/incidents").set(as()).send({ title: "Slip near loading bay", occurredAt: "2026-01-10", description: "Wet floor, no signage" }).expect(201);
    await http().post(`/api/v1/ehs/incidents/${incident.body.id}/investigate`).set(as("viewer")).send({}).expect(403);
  });

  it("reports an incident, investigates it and closes it", async () => {
    const incident = await http().post("/api/v1/ehs/incidents").set(as()).send({
      title: "Slip near loading bay", incidentType: "near_miss", severity: "low", occurredAt: "2026-01-10", location: "Loading bay 2", description: "Wet floor, no signage",
    }).expect(201);
    incidentId = incident.body.id;
    expect(incident.body).toMatchObject({ number: expect.stringMatching(/^INC-\d{4}-\d{6}$/), status: "reported", reportedBy: expect.any(String) });

    const investigated = await http().post(`/api/v1/ehs/incidents/${incidentId}/investigate`).set(as()).send({ rootCause: "No wet-floor signage policy", preventiveActions: "Add mandatory signage after cleaning" }).expect(200);
    expect(investigated.body).toMatchObject({ status: "investigating", rootCause: "No wet-floor signage policy" });

    const closed = await http().post(`/api/v1/ehs/incidents/${incidentId}/close`).set(as()).expect(200);
    expect(closed.body.status).toBe("closed");
    expect(closed.body.closedAt).toBeTruthy();

    await http().post(`/api/v1/ehs/incidents/${incidentId}/close`).set(as()).expect(400); // already closed
  });

  it("creates a risk assessment, computes risk scores, and refuses activation with no hazards", async () => {
    const empty = await http().post("/api/v1/ehs/risk-assessments").set(as()).send({ title: "Warehouse racking", reviewDue: "2027-01-01" }).expect(201);
    await http().post(`/api/v1/ehs/risk-assessments/${empty.body.id}/activate`).set(as()).expect(400);

    const risk = await http().post("/api/v1/ehs/risk-assessments").set(as()).send({
      title: "Warehouse racking", reviewDue: "2027-01-01",
      hazards: [{ hazard: "Falling stock from racking", likelihood: 3, severity: 4, controls: "Secure pallets, inspect racking monthly", residualLikelihood: 1, residualSeverity: 4 }],
    }).expect(201);
    riskId = risk.body.id;
    expect(risk.body).toMatchObject({ number: expect.stringMatching(/^RA-\d{4}-\d{6}$/), status: "draft" });
    expect(risk.body.hazards[0]).toMatchObject({ riskScore: 12, residualScore: 4 });

    const activated = await http().post(`/api/v1/ehs/risk-assessments/${riskId}/activate`).set(as()).expect(200);
    expect(activated.body.status).toBe("active");
  });

  it("requests a permit to work, approves it and closes it", async () => {
    const permit = await http().post("/api/v1/ehs/permits").set(as()).send({
      permitType: "hot_work", title: "Welding on mezzanine", validFrom: "2026-02-01", validTo: "2026-02-02",
    }).expect(201);
    permitId = permit.body.id;
    expect(permit.body).toMatchObject({ number: expect.stringMatching(/^PTW-\d{4}-\d{6}$/), status: "pending", requestedBy: expect.any(String) });

    const approved = await http().post(`/api/v1/ehs/permits/${permitId}/approve`).set(as()).expect(200);
    expect(approved.body).toMatchObject({ status: "approved", approvedBy: expect.any(String) });
    await http().post(`/api/v1/ehs/permits/${permitId}/approve`).set(as()).expect(400); // already approved

    const closed = await http().post(`/api/v1/ehs/permits/${permitId}/close`).set(as()).expect(200);
    expect(closed.body.status).toBe("closed");
  });

  it("rejects a pending permit", async () => {
    const permit = await http().post("/api/v1/ehs/permits").set(as()).send({ title: "Confined space entry", validFrom: "2026-03-01", validTo: "2026-03-01" }).expect(201);
    const rejected = await http().post(`/api/v1/ehs/permits/${permit.body.id}/reject`).set(as()).expect(200);
    expect(rejected.body.status).toBe("rejected");
    await http().post(`/api/v1/ehs/permits/${permit.body.id}/approve`).set(as()).expect(400); // no longer pending
  });
});
