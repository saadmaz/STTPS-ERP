import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("HR: shifts", () => {
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

  let dayTemplateId: string;
  let nightTemplateId: string;
  let viewerEmployeeId: string;
  let otherEmployeeId: string;

  it("creates templates, a day and a night shift", async () => {
    const day = await http().post("/api/v1/hr/shift-templates").set(as()).send({ code: "DAY", name: "Day shift", startTime: "08:00", endTime: "16:00" }).expect(201);
    dayTemplateId = day.body.id;
    expect(day.body.isNightShift).toBe(false);

    const night = await http().post("/api/v1/hr/shift-templates").set(as()).send({ code: "NIGHT", name: "Night shift", startTime: "22:00", endTime: "06:00" }).expect(201);
    nightTemplateId = night.body.id;
    expect(night.body.isNightShift).toBe(true);
  });

  it("assigns two employees to shifts, snapshotting the template's times", async () => {
    const viewer = await http().post("/api/v1/hr/employees").set(as()).send({ userId: `${t.tenantId}_viewer`, firstName: "Nimal", lastName: "Jayawardena", joiningDate: "2026-01-05" }).expect(201);
    viewerEmployeeId = viewer.body.id;
    const other = await http().post("/api/v1/hr/employees").set(as()).send({ firstName: "Chamari", lastName: "Dias", joiningDate: "2026-01-05" }).expect(201);
    otherEmployeeId = other.body.id;

    const a1 = await http().post("/api/v1/hr/shift-assignments").set(as()).send({ employeeId: viewerEmployeeId, date: "2026-12-01", templateId: dayTemplateId }).expect(201);
    expect(a1.body).toMatchObject({ startTime: "08:00", endTime: "16:00", isNightShift: false, status: "scheduled" });

    const a2 = await http().post("/api/v1/hr/shift-assignments").set(as()).send({ employeeId: otherEmployeeId, date: "2026-12-01", templateId: nightTemplateId, isHoliday: true }).expect(201);
    expect(a2.body).toMatchObject({ startTime: "22:00", endTime: "06:00", isNightShift: true, isHoliday: true });

    // Later edits to the template never change an already-assigned shift.
    await http().patch(`/api/v1/hr/shift-templates/${dayTemplateId}`).set(as()).send({ startTime: "09:00" }).expect(200);
    const a1Again = await http().get(`/api/v1/hr/shift-assignments/${a1.body.id}`).set(as()).expect(200);
    expect(a1Again.body.startTime).toBe("08:00");
  });

  it("shows the calendar for every employee, and self-service shows just my own", async () => {
    const calendar = await http().get("/api/v1/hr/shift-assignments/calendar?from=2026-12-01&to=2026-12-01").set(as()).expect(200);
    expect(calendar.body).toHaveLength(2);

    const mine = await http().get("/api/v1/hr/shift-assignments/me?from=2026-12-01&to=2026-12-01").set(as("viewer")).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ employeeId: viewerEmployeeId });
  });

  it("requests a swap and approves it, exchanging the two employees", async () => {
    const list = await http().get(`/api/v1/hr/shift-assignments?where=employeeId:${viewerEmployeeId}&limit=10`).set(as()).expect(200);
    const mine = list.body.items[0].id;
    const list2 = await http().get(`/api/v1/hr/shift-assignments?where=employeeId:${otherEmployeeId}&limit=10`).set(as()).expect(200);
    const theirs = list2.body.items[0].id;

    await http().post(`/api/v1/hr/shift-assignments/${mine}/swap`).set(as("viewer")).send({ targetAssignmentId: theirs, note: "Family event" }).expect(200);
    await http().post(`/api/v1/hr/shift-assignments/${mine}/swap`).set(as("viewer")).send({ targetAssignmentId: theirs }).expect(400);

    const decided = await http().post(`/api/v1/hr/shift-assignments/${mine}/swap/decide`).set(as()).send({ approve: true, note: "Approved" }).expect(200);
    expect(decided.body).toMatchObject({ employeeId: otherEmployeeId, status: "swapped" });

    const theirsAfter = await http().get(`/api/v1/hr/shift-assignments/${theirs}`).set(as()).expect(200);
    expect(theirsAfter.body).toMatchObject({ employeeId: viewerEmployeeId, status: "swapped" });

    await http().post(`/api/v1/hr/shift-assignments/${mine}/swap/decide`).set(as()).send({ approve: true }).expect(400);
  });

  it("cancels an assignment, which only an HR admin may do", async () => {
    const list = await http().get(`/api/v1/hr/shift-assignments?where=employeeId:${otherEmployeeId}&limit=10`).set(as()).expect(200);
    const assignmentId = list.body.items[0].id;

    const cancelled = await http().post(`/api/v1/hr/shift-assignments/${assignmentId}/cancel`).set(as()).send({ reason: "No longer needed" }).expect(200);
    expect(cancelled.body.status).toBe("cancelled");
    await http().post(`/api/v1/hr/shift-assignments/${assignmentId}/cancel`).set(as()).send({}).expect(400);

    await http().post(`/api/v1/hr/shift-assignments/${assignmentId}/cancel`).set(as("viewer")).send({}).expect(403);
  });
});
