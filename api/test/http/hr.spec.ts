import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("HR: employees, positions, job grades and the org chart", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  let department: string;
  let branch: string;
  let jobGrade: string;
  let position: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["hr.employee.view", "hr.employee.create", "hr.employee.edit", "hr.employee.terminate"]);
    branch = (await http().post("/api/v1/org/branches").set(as()).send({ code: "HQ", name: "Head Office" }).expect(201)).body.id;
    department = (await http().post("/api/v1/org/departments").set(as()).send({ code: "ENG", name: "Engineering", branchId: branch }).expect(201)).body.id;
    jobGrade = (await http().post("/api/v1/hr/job-grades").set(as()).send({ code: "G5", name: "Grade 5", minSalary: "100000", maxSalary: "200000" }).expect(201)).body.id;
    position = (await http().post("/api/v1/hr/positions").set(as()).send({ code: "ENG-2", title: "Senior Engineer", departmentId: department, jobGradeId: jobGrade }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  let managerId: string;
  let employeeId: string;

  it("hires a manager and a report, with an auto-numbered employee ID and a hired history entry", async () => {
    const mgr = await http().post("/api/v1/hr/employees").set(as()).send({
      firstName: "Nimal", lastName: "Perera", joiningDate: "2024-01-15", departmentId: department, branchId: branch, positionId: position,
    }).expect(201);
    expect(mgr.body).toMatchObject({ employeeNumber: expect.stringMatching(/^EMP-\d+$/), status: "active", employmentType: "full_time" });
    expect(mgr.body.employmentHistory).toEqual([{ date: "2024-01-15", type: "hired", description: "Hired", departmentId: department, positionId: position, managerId: null }]);
    managerId = mgr.body.id;

    const emp = await http().post("/api/v1/hr/employees").set(as()).send({
      firstName: "Kamala", lastName: "Silva", joiningDate: "2024-03-01", departmentId: department, managerId,
    }).expect(201);
    employeeId = emp.body.id;
    expect(emp.body.managerId).toBe(managerId);
  });

  it("rejects a manager that would make the reporting line a cycle", async () => {
    const res = await http().patch(`/api/v1/hr/employees/${managerId}`).set(as()).send({ managerId: employeeId }).expect(400);
    expect(res.body.message).toMatch(/ancestor|cycle/i);
  });

  it("keeps salary, bank details and national ID out of reach without the compensation permission", async () => {
    const asViewer = () => ({ Authorization: `Bearer ${t.token("viewer")}`, "x-company-id": t.companyId });
    const blocked = await http().patch(`/api/v1/hr/employees/${employeeId}`).set(asViewer()).send({ compensation: { salary: "150000" } }).expect(403);
    expect(blocked.body.message).toContain("compensation");

    const updated = await http().patch(`/api/v1/hr/employees/${employeeId}`).set(as()).send({
      compensation: { salary: "150000.00", currency: "LKR", payFrequency: "monthly", effectiveDate: "2024-03-01" },
      bankDetails: { bankName: "Commercial Bank", accountNumber: "1234567890" },
      nationalId: "199012345678",
    }).expect(200);
    expect(updated.body.compensation).toMatchObject({ salary: 15_000_000, currency: "LKR" });
    expect(updated.body.bankDetails).toMatchObject({ accountNumber: "1234567890" });
    expect(updated.body.nationalId).toBe("199012345678");
    // Transferring + raising pay in one patch records both kinds of history.
    const types = updated.body.employmentHistory.map((h: { type: string }) => h.type);
    expect(types).toEqual(["hired", "salary_changed"]);

    const seenByAdmin = (await http().get(`/api/v1/hr/employees/${employeeId}`).set(as()).expect(200)).body;
    expect(seenByAdmin.compensation).not.toBeNull();

    const seenByViewer = (await http().get(`/api/v1/hr/employees/${employeeId}`).set(asViewer()).expect(200)).body;
    expect(seenByViewer).toMatchObject({ compensation: null, bankDetails: null, nationalId: null, firstName: "Kamala" });

    const listedByViewer = (await http().get("/api/v1/hr/employees?limit=50").set(asViewer()).expect(200)).body.items;
    expect(listedByViewer.every((e: { compensation: unknown }) => e.compensation === null)).toBe(true);

    const historyByViewer = await http().get(`/api/v1/hr/employees/${employeeId}/history`).set(asViewer()).expect(200);
    const salaryEntry = historyByViewer.body.find((h: { action: string }) => h.action === "updated");
    expect(salaryEntry.after.compensation).toBeUndefined();
    expect(salaryEntry.after.bankDetails).toBeUndefined();
    expect(salaryEntry.after.nationalId).toBeUndefined();

    const historyByAdmin = await http().get(`/api/v1/hr/employees/${employeeId}/history`).set(as()).expect(200);
    expect(historyByAdmin.body.find((h: { action: string }) => h.action === "updated").after.compensation).toMatchObject({ salary: 15_000_000 });
  });

  it("records a transfer when department or manager changes", async () => {
    const engTwo = (await http().post("/api/v1/org/departments").set(as()).send({ code: "SUP", name: "Support" }).expect(201)).body.id;
    const moved = await http().patch(`/api/v1/hr/employees/${employeeId}`).set(as()).send({ departmentId: engTwo }).expect(200);
    const types = moved.body.employmentHistory.map((h: { type: string }) => h.type);
    expect(types).toEqual(["hired", "salary_changed", "transferred"]);
  });

  it("terminates and reinstates an employee, blocking edits while terminated", async () => {
    await http().patch(`/api/v1/hr/employees/${employeeId}`).set(as()).send({ status: "terminated" }).expect(400);
    const term = await http().post(`/api/v1/hr/employees/${employeeId}/terminate`).set(as()).send({ date: "2024-06-30", reason: "Resigned" }).expect(200);
    expect(term.body).toMatchObject({ status: "terminated", terminationDate: "2024-06-30", terminationReason: "Resigned" });
    await http().patch(`/api/v1/hr/employees/${employeeId}`).set(as()).send({ phone: "0771234567" }).expect(400);
    await http().post(`/api/v1/hr/employees/${employeeId}/terminate`).set(as()).send({ reason: "Again" }).expect(400);

    const back = await http().post(`/api/v1/hr/employees/${employeeId}/reinstate`).set(as()).send({ date: "2024-07-15" }).expect(200);
    expect(back.body).toMatchObject({ status: "active", terminationDate: null, terminationReason: null });
    const types = back.body.employmentHistory.map((h: { type: string }) => h.type);
    expect(types).toEqual(["hired", "salary_changed", "transferred", "terminated", "reinstated"]);
  });

  it("builds the reporting tree from managers down", async () => {
    const chart = (await http().get("/api/v1/hr/employees/org-chart").set(as()).expect(200)).body;
    const root = chart.find((n: { id: string }) => n.id === managerId);
    expect(root).toBeTruthy();
    expect(root.reports.map((r: { id: string }) => r.id)).toContain(employeeId);

    const subtree = (await http().get(`/api/v1/hr/employees/org-chart?rootId=${managerId}`).set(as()).expect(200)).body;
    expect(subtree).toHaveLength(1);
    expect(subtree[0].reports.map((r: { id: string }) => r.id)).toContain(employeeId);
  });

  it("links an employee to a platform user only when assigned to this company", async () => {
    const outsiderLink = await http().post("/api/v1/hr/employees").set(as()).send({
      firstName: "Saman", lastName: "Fernando", joiningDate: "2024-01-01", userId: "not-a-real-user",
    }).expect(400);
    expect(outsiderLink.body.message).toContain("not assigned");

    const linked = await http().post("/api/v1/hr/employees").set(as()).send({
      firstName: "Viewer", lastName: "User", joiningDate: "2024-01-01", userId: `${t.tenantId}_viewer`,
    }).expect(201);
    expect(linked.body.userId).toBe(`${t.tenantId}_viewer`);
  });
});
