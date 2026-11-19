import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("HR: employee self-service", () => {
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

  let employeeId: string;

  it("links the viewer to an employee and updates their own profile", async () => {
    const employee = await http().post("/api/v1/hr/employees").set(as()).send({ userId: `${t.tenantId}_viewer`, firstName: "Chathuri", lastName: "Bandara", joiningDate: "2026-01-05" }).expect(201);
    employeeId = employee.body.id;

    const me = await http().get("/api/v1/hr/self-service/me/profile").set(as("viewer")).expect(200);
    expect(me.body).toMatchObject({ id: employeeId, firstName: "Chathuri" });

    const updated = await http().put("/api/v1/hr/self-service/me/profile").set(as("viewer")).send({ phone: "0771234567", address: { city: "Colombo" } }).expect(200);
    expect(updated.body).toMatchObject({ phone: "0771234567", address: { city: "Colombo" } });

    // Employment and pay fields are not reachable through this endpoint.
    await http().put("/api/v1/hr/self-service/me/profile").set(as("viewer")).send({ status: "terminated" }).expect(400);
  });

  it("shows published, non-expired announcements only", async () => {
    await http().post("/api/v1/hr/announcements").set(as()).send({ title: "Welcome", body: "Glad to have you" }).expect(201);
    await http().post("/api/v1/hr/announcements").set(as()).send({ title: "Draft", body: "Not yet", isPublished: false }).expect(201);
    await http().post("/api/v1/hr/announcements").set(as()).send({ title: "Old notice", body: "Expired", expiresAt: "2020-01-01T00:00:00.000Z" }).expect(201);

    const feed = await http().get("/api/v1/hr/self-service/announcements").set(as("viewer")).expect(200);
    expect(feed.body).toHaveLength(1);
    expect(feed.body[0]).toMatchObject({ title: "Welcome" });
  });

  it("raises an HR request and an equipment request, and HR decides them", async () => {
    const req = await http().post("/api/v1/hr/self-service/me/requests").set(as("viewer")).send({ type: "address_change", subject: "New home address" }).expect(201);
    expect(req.body).toMatchObject({ employeeId, status: "open" });

    const resolved = await http().post(`/api/v1/hr/requests/${req.body.id}/decide`).set(as()).send({ status: "resolved", resolution: "Updated in the system" }).expect(200);
    expect(resolved.body).toMatchObject({ status: "resolved", resolution: "Updated in the system" });

    const mine = await http().get("/api/v1/hr/self-service/me/requests").set(as("viewer")).expect(200);
    expect(mine.body.items).toHaveLength(1);

    const equipment = await http().post("/api/v1/hr/self-service/me/equipment-requests").set(as("viewer")).send({ itemDescription: "Laptop", reason: "Replacing a broken one" }).expect(201);
    await http().post(`/api/v1/hr/equipment-requests/${equipment.body.id}/fulfill`).set(as()).send({}).expect(400);

    const approved = await http().post(`/api/v1/hr/equipment-requests/${equipment.body.id}/decide`).set(as()).send({ approve: true, note: "Approved by IT" }).expect(200);
    expect(approved.body.status).toBe("approved");

    const fulfilled = await http().post(`/api/v1/hr/equipment-requests/${equipment.body.id}/fulfill`).set(as()).send({ note: "Handed over" }).expect(200);
    expect(fulfilled.body.status).toBe("fulfilled");

    await http().post(`/api/v1/hr/equipment-requests/${equipment.body.id}/decide`).set(as()).send({ approve: true }).expect(400);
  });

  it("requires a linked employee for the self-service portal, and keeps HR decisions behind permissions", async () => {
    await http().get("/api/v1/hr/self-service/me/profile").set(as("admin")).expect(400);
    await http().post("/api/v1/hr/self-service/me/requests").set(as("admin")).send({ type: "other", subject: "x" }).expect(400);
    await http().get("/api/v1/hr/self-service/me/profile").set(as("outsider")).expect(403);
  });
});
