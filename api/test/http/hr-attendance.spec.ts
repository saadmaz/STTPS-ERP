import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("HR: attendance", () => {
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
  let employeeNumber: string;
  let deviceId: string;
  let deviceKey: string;

  it("sets up an employee linked to the viewer user, and keeps attendance settings at wide-open bounds for deterministic math", async () => {
    const employee = await http()
      .post("/api/v1/hr/employees")
      .set(as())
      .send({ userId: `${t.tenantId}_viewer`, firstName: "Kavindu", lastName: "Perera", joiningDate: "2026-01-05" })
      .expect(201);
    employeeId = employee.body.id;
    employeeNumber = employee.body.employeeNumber;
    expect(employeeNumber).toBe("EMP-000001");

    const settings = await http().put("/api/v1/hr/attendance-settings").set(as()).send({ startTime: "23:59", endTime: "00:00", graceMinutes: 0, standardMinutes: 480 }).expect(200);
    expect(settings.body).toMatchObject({ startTime: "23:59", endTime: "00:00", graceMinutes: 0, standardMinutes: 480 });
    await http().get("/api/v1/hr/attendance-settings").set(as()).expect(200);
  });

  it("clocks in and out through self-service, with a break in between", async () => {
    const me = await http().get("/api/v1/hr/attendance/me").set(as("viewer")).expect(200);
    expect(me.body.today).toBeNull();

    const in1 = await http().post("/api/v1/hr/attendance/clock-in").set(as("viewer")).send({}).expect(200);
    expect(in1.body).toMatchObject({ employeeId, method: "web", status: "present", clockOut: null });
    await http().post("/api/v1/hr/attendance/clock-in").set(as("viewer")).send({}).expect(400);

    const started = await http().post("/api/v1/hr/attendance/break/start").set(as("viewer")).send().expect(200);
    expect(started.body.breaks).toHaveLength(1);
    expect(started.body.breaks[0].end).toBeNull();
    await http().post("/api/v1/hr/attendance/break/start").set(as("viewer")).send().expect(400);

    const ended = await http().post("/api/v1/hr/attendance/break/end").set(as("viewer")).send().expect(200);
    expect(ended.body.breaks[0].end).not.toBeNull();
    await http().post("/api/v1/hr/attendance/break/end").set(as("viewer")).send().expect(400);

    const out = await http().post("/api/v1/hr/attendance/clock-out").set(as("viewer")).send().expect(200);
    expect(out.body).toMatchObject({ status: "half_day", lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 });
    expect(out.body.clockOut).not.toBeNull();
    await http().post("/api/v1/hr/attendance/clock-out").set(as("viewer")).send().expect(400);

    const me2 = await http().get("/api/v1/hr/attendance/me").set(as("viewer")).expect(200);
    expect(me2.body.today).toMatchObject({ status: "half_day" });
  });

  it("requests and decides a correction", async () => {
    const list = await http().get(`/api/v1/hr/attendance?where=employeeId:${employeeId}&limit=10`).set(as()).expect(200);
    const recordId = list.body.items[0].id;

    await http().post(`/api/v1/hr/attendance/${recordId}/correction`).set(as("viewer")).send({ reason: "Forgot to log a break" }).expect(200);
    await http().post(`/api/v1/hr/attendance/${recordId}/correction`).set(as("viewer")).send({ reason: "Again" }).expect(400);

    const decided = await http().post(`/api/v1/hr/attendance/${recordId}/correction/decide`).set(as()).send({ approve: true, note: "Looks right" }).expect(200);
    expect(decided.body.correction).toMatchObject({ status: "approved", decisionNote: "Looks right" });

    await http().post(`/api/v1/hr/attendance/${recordId}/correction/decide`).set(as()).send({ approve: true }).expect(400);
    await http().post(`/api/v1/hr/attendance/${recordId}/correction/decide`).set(as("viewer")).send({ approve: true }).expect(403);
  });

  it("marks a day absent and reports a timesheet", async () => {
    await http().post("/api/v1/hr/attendance/mark-absent").set(as()).send({ employeeId, date: "2026-01-10", reason: "Sick" }).expect(200);
    await http().post("/api/v1/hr/attendance/mark-absent").set(as()).send({ employeeId, date: "2026-01-10" }).expect(400);
    await http().post("/api/v1/hr/attendance/mark-absent").set(as("viewer")).send({ employeeId, date: "2026-01-11" }).expect(403);

    const sheet = await http().get(`/api/v1/hr/attendance/timesheet?employeeId=${employeeId}&from=2000-01-01&to=2100-01-01`).set(as()).expect(200);
    expect(sheet.body.totals).toMatchObject({ presentDays: 1, absentDays: 1, lateMinutes: 0 });
  });

  it("registers a kiosk device and clocks in by QR and by PIN", async () => {
    // A separate employee, since the first one already has a complete attendance record for today.
    const kiosk = await http().post("/api/v1/hr/employees").set(as()).send({ firstName: "Sanduni", lastName: "Fernando", joiningDate: "2026-01-05" }).expect(201);
    const kioskEmployeeNumber = kiosk.body.employeeNumber;

    const device = await http().post("/api/v1/hr/devices").set(as()).send({ code: "GATE-1", name: "Main gate kiosk" }).expect(201);
    deviceId = device.body.id;

    const issued = await http().post(`/api/v1/hr/devices/${deviceId}/issue-key`).set(as()).expect(200);
    deviceKey = issued.body.key;
    expect(typeof deviceKey).toBe("string");
    expect(issued.body.device.currentKeyHash).toBeUndefined();

    await http().post(`/api/v1/hr/employees/${kiosk.body.id}/attendance-pin`).set(as()).send({ pin: "4321" }).expect(200);

    const qrIn = await http().post("/api/v1/public/attendance/clock").send({ deviceKey, action: "in", employeeNumber: kioskEmployeeNumber }).expect(200);
    expect(qrIn.body).toMatchObject({ method: "qr", deviceId });

    await http().post("/api/v1/public/attendance/clock").send({ deviceKey, action: "in", employeeNumber: kioskEmployeeNumber, pin: "0000" }).expect(400);

    const qrOut = await http().post("/api/v1/public/attendance/clock").send({ deviceKey, action: "out", employeeNumber: kioskEmployeeNumber }).expect(200);
    expect(qrOut.body.clockOut).not.toBeNull();

    // A second employee, to exercise a PIN clock-in (as opposed to the QR clock-in above) on the same device.
    const pinEmployee = await http().post("/api/v1/hr/employees").set(as()).send({ firstName: "Ruwan", lastName: "Silva", joiningDate: "2026-01-05" }).expect(201);
    await http().post(`/api/v1/hr/employees/${pinEmployee.body.id}/attendance-pin`).set(as()).send({ pin: "9999" }).expect(200);
    const pinIn = await http().post("/api/v1/public/attendance/clock").send({ deviceKey, action: "in", employeeNumber: pinEmployee.body.employeeNumber, pin: "9999" }).expect(200);
    expect(pinIn.body).toMatchObject({ method: "pin", deviceId });

    await http().post(`/api/v1/hr/devices/${deviceId}/revoke`).set(as()).expect(200);
    await http().post("/api/v1/public/attendance/clock").send({ deviceKey, action: "in", employeeNumber: kioskEmployeeNumber }).expect(400);
  });

  it("requires a linked employee for self-service, and keeps admin actions behind permissions", async () => {
    // "admin" is a super-admin assigned to no employee record; "outsider" isn't even assigned to the company, so it's rejected earlier (403) than the self-service check.
    await http().post("/api/v1/hr/attendance/clock-in").set(as("admin")).send({}).expect(400);
    await http().post("/api/v1/hr/attendance/clock-in").set(as("outsider")).send({}).expect(403);
    await http().get("/api/v1/hr/attendance-settings").set(as("viewer")).expect(403);
    await http().put("/api/v1/hr/attendance-settings").set(as("viewer")).send({ graceMinutes: 10 }).expect(403);
  });
});
