import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("HR: leave", () => {
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

  let annualId: string;
  let noApprovalId: string;
  let viewerEmployeeId: string;

  it("creates leave policies and a holiday, and links the viewer to an employee", async () => {
    const annual = await http().post("/api/v1/hr/leave-policies").set(as()).send({ code: "ANNUAL", name: "Annual leave", type: "annual", annualEntitlementDays: 14, carryForwardMaxDays: 5 }).expect(201);
    annualId = annual.body.id;
    expect(annual.body).toMatchObject({ isPaid: true, requiresApproval: true });

    const noApproval = await http().post("/api/v1/hr/leave-policies").set(as()).send({ code: "WFH", name: "Work from home", type: "custom", annualEntitlementDays: 365, requiresApproval: false, isPaid: true }).expect(201);
    noApprovalId = noApproval.body.id;

    await http().post("/api/v1/hr/holidays").set(as()).send({ date: "2026-12-16", name: "Public holiday" }).expect(201);

    const employee = await http().post("/api/v1/hr/employees").set(as()).send({ userId: `${t.tenantId}_viewer`, firstName: "Dilani", lastName: "Senaratne", joiningDate: "2026-01-05" }).expect(201);
    viewerEmployeeId = employee.body.id;
  });

  it("requests leave, excluding weekends and the holiday from the day count", async () => {
    // Wed 2026-12-16 (public holiday) through Mon 2026-12-21: business days are Thu 17, Fri 18, Mon 21 = 3 (Sat/Sun and the holiday excluded).
    const req = await http().post("/api/v1/hr/leave/me/requests").set(as("viewer")).send({ policyId: annualId, startDate: "2026-12-16", endDate: "2026-12-21", reason: "Trip" }).expect(201);
    expect(req.body).toMatchObject({ days: 3, status: "pending", employeeId: viewerEmployeeId });

    const mine = await http().get("/api/v1/hr/leave/me/requests").set(as("viewer")).expect(200);
    expect(mine.body.items).toHaveLength(1);

    const balancesBefore = await http().get("/api/v1/hr/leave/me/balances").set(as("viewer")).expect(200);
    const annualBefore = balancesBefore.body.find((b: { policy: { id: string } }) => b.policy.id === annualId);
    expect(annualBefore.balance).toMatchObject({ entitlementDays: 14, usedDays: 0, remainingDays: 14 });

    const decided = await http().post(`/api/v1/hr/leave-requests/${req.body.id}/decide`).set(as()).send({ approve: true, note: "Enjoy" }).expect(200);
    expect(decided.body.status).toBe("approved");

    const balancesAfter = await http().get("/api/v1/hr/leave/me/balances").set(as("viewer")).expect(200);
    const annualAfter = balancesAfter.body.find((b: { policy: { id: string } }) => b.policy.id === annualId);
    expect(annualAfter.balance).toMatchObject({ usedDays: 3, remainingDays: 11 });

    await http().post(`/api/v1/hr/leave-requests/${req.body.id}/decide`).set(as()).send({ approve: true }).expect(400);
  });

  it("refuses a request beyond the remaining balance, auto-approves a no-approval policy, and shows the leave calendar", async () => {
    const tooLong = await http().post("/api/v1/hr/leave/me/requests").set(as("viewer")).send({ policyId: annualId, startDate: "2027-01-04", endDate: "2027-01-29" }).expect(201);
    await http().post(`/api/v1/hr/leave-requests/${tooLong.body.id}/decide`).set(as()).send({ approve: true }).expect(400);

    const wfh = await http().post("/api/v1/hr/leave/me/requests").set(as("viewer")).send({ policyId: noApprovalId, startDate: "2027-01-04", endDate: "2027-01-04" }).expect(201);
    expect(wfh.body.status).toBe("approved");

    const calendar = await http().get("/api/v1/hr/leave-requests/calendar?from=2026-12-01&to=2026-12-31").set(as()).expect(200);
    expect(calendar.body).toHaveLength(1);
    expect(calendar.body[0]).toMatchObject({ employeeId: viewerEmployeeId, status: "approved" });
  });

  it("cancels its own pending request, but not an approved one; HR can cancel either and release the balance", async () => {
    const pending = await http().post("/api/v1/hr/leave/me/requests").set(as("viewer")).send({ policyId: annualId, startDate: "2027-02-01", endDate: "2027-02-01" }).expect(201);
    await http().post(`/api/v1/hr/leave/me/requests/${pending.body.id}/cancel`).set(as("viewer")).send({}).expect(200);

    const approved = await http().post("/api/v1/hr/leave/me/requests").set(as("viewer")).send({ policyId: annualId, startDate: "2027-02-08", endDate: "2027-02-08" }).expect(201);
    await http().post(`/api/v1/hr/leave-requests/${approved.body.id}/decide`).set(as()).send({ approve: true }).expect(200);
    await http().post(`/api/v1/hr/leave/me/requests/${approved.body.id}/cancel`).set(as("viewer")).send({}).expect(400);

    const cancelled = await http().post(`/api/v1/hr/leave-requests/${approved.body.id}/cancel`).set(as()).send({ reason: "No longer needed" }).expect(200);
    expect(cancelled.body.status).toBe("cancelled");

    const balances = await http().get("/api/v1/hr/leave-balances?employeeId=" + viewerEmployeeId).set(as()).expect(200);
    const annual = balances.body.find((b: { policy: { id: string } }) => b.policy.id === annualId);
    expect(annual.balance.usedDays).toBe(3);
  });

  it("rolls every employee's balance over into the next year, carrying forward up to the policy's cap", async () => {
    const result = await http().post("/api/v1/hr/leave/rollover").set(as()).send({ year: 2028 }).expect(200);
    expect(result.body.balancesUpdated).toBeGreaterThan(0);

    const balances = await http().get("/api/v1/hr/leave-balances?employeeId=" + viewerEmployeeId).set(as()).expect(200);
    const annual = balances.body.find((b: { policy: { id: string } }) => b.policy.id === annualId);
    // 14 - 3 used = 11 remaining, under the carryForwardMaxDays cap of 5 -> only 5 carries forward.
    expect(annual.balance).toMatchObject({ year: 2028, entitlementDays: 14, carriedForwardDays: 5, usedDays: 0, remainingDays: 19 });

    await http().post("/api/v1/hr/leave/rollover").set(as("viewer")).send({ year: 2029 }).expect(403);
  });
});
