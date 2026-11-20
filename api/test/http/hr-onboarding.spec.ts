import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("HR: onboarding and offboarding checklists", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["hr.checklist.view"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  let employeeId: string;
  let checklistId: string;

  it("starts an onboarding checklist automatically when a candidate is hired", async () => {
    const candidate = await http().post("/api/v1/hr/candidates").set(as()).send({ firstName: "Nadeesha", lastName: "Gunawardena", email: "nadeesha@example.com" }).expect(201);
    const hired = await http().post(`/api/v1/hr/candidates/${candidate.body.id}/hire`).set(as()).send({ joiningDate: "2026-04-01" }).expect(200);
    employeeId = hired.body.employeeId;

    const list = await http().get(`/api/v1/hr/checklists?where=employeeId:${employeeId}&limit=50`).set(as()).expect(200);
    expect(list.body.items).toHaveLength(1);
    const checklist = list.body.items[0];
    checklistId = checklist.id;
    expect(checklist).toMatchObject({ type: "onboarding", status: "in_progress", targetDate: "2026-04-01" });
    expect(checklist.items.map((i: { title: string }) => i.title)).toEqual(expect.arrayContaining(["Create user account", "Assign equipment"]));
    expect(checklist.items.every((i: { status: string; dueDate: string }) => i.status === "pending" && i.dueDate === "2026-04-01")).toBe(true);

    // Hiring again (defensively) must not start a second onboarding checklist.
    await http().post(`/api/v1/hr/employees/${employeeId}/onboarding`).set(as()).send({}).expect(200);
    const again = await http().get(`/api/v1/hr/checklists?where=employeeId:${employeeId}&limit=50`).set(as()).expect(200);
    expect(again.body.items).toHaveLength(1);
  });

  it("assigns and completes items, finishing the checklist once nothing is pending", async () => {
    const checklist = (await http().get(`/api/v1/hr/checklists/${checklistId}`).set(as()).expect(200)).body;
    const [first, ...rest] = checklist.items as { itemId: string }[];

    const assigned = await http().post(`/api/v1/hr/checklists/${checklistId}/items/${first.itemId}/assign`).set(as()).send({ userId: `${t.tenantId}_admin` }).expect(200);
    expect(assigned.body.items.find((i: { itemId: string }) => i.itemId === first.itemId)).toMatchObject({ assigneeUserId: `${t.tenantId}_admin` });

    await http().post(`/api/v1/hr/checklists/${checklistId}/items/${first.itemId}/status`).set(as()).send({ status: "done", notes: "Account created" }).expect(200);
    let current = (await http().get(`/api/v1/hr/checklists/${checklistId}`).set(as()).expect(200)).body;
    expect(current.status).toBe("in_progress");

    for (const item of rest) {
      current = (await http().post(`/api/v1/hr/checklists/${checklistId}/items/${item.itemId}/status`).set(as()).send({ status: "skipped" }).expect(200)).body;
    }
    expect(current.status).toBe("completed");
    expect(current.items.find((i: { itemId: string }) => i.itemId === first.itemId)).toMatchObject({ status: "done", completedBy: `${t.tenantId}_admin`, notes: "Account created" });

    await http().post(`/api/v1/hr/checklists/${checklistId}/items/${first.itemId}/status`).set(as()).send({ status: "pending" }).expect(400);
  });

  it("starts an offboarding checklist automatically on termination, and the checklist can be cancelled", async () => {
    const terminated = await http().post(`/api/v1/hr/employees/${employeeId}/terminate`).set(as()).send({ date: "2026-06-30", reason: "Resigned" }).expect(200);
    expect(terminated.body.status).toBe("terminated");

    const list = await http().get(`/api/v1/hr/checklists?where=employeeId:${employeeId}&limit=50`).set(as()).expect(200);
    const offboarding = list.body.items.find((c: { type: string }) => c.type === "offboarding");
    expect(offboarding).toMatchObject({ status: "in_progress", targetDate: "2026-06-30" });
    expect(offboarding.items.map((i: { title: string }) => i.title)).toEqual(expect.arrayContaining(["Revoke system access", "Collect equipment"]));

    const cancelled = await http().post(`/api/v1/hr/checklists/${offboarding.id}/cancel`).set(as()).send({ reason: "Handled outside the system" }).expect(200);
    expect(cancelled.body).toMatchObject({ status: "cancelled", notes: "Handled outside the system" });
    await http().post(`/api/v1/hr/checklists/${offboarding.id}/cancel`).set(as()).send({}).expect(400);
  });

  it("keeps checklist actions behind hr.checklist.edit", async () => {
    const asViewer = () => ({ Authorization: `Bearer ${t.token("viewer")}`, "x-company-id": t.companyId });
    await http().post(`/api/v1/hr/checklists/${checklistId}/cancel`).set(asViewer()).send({}).expect(403);
  });
});
