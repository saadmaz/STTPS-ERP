import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("HR: payroll", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  const trial = async (to: string) => (await http().get(`/api/v1/finance/reports/trial-balance?to=${to}`).set(as()).expect(200)).body;
  const balanceOf = async (to: string, code: string) => (await trial(to)).lines.find((l: { code: string }) => l.code === code)?.balance ?? 0;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY26", startDate: "2026-01-01", months: 24 }).expect(201);
    // EPF 8% employee / 12% employer, ETF 3% employer — the standard Sri Lankan rates (CLAUDE.md §9), effective from well before the test periods.
    await http().post("/api/v1/hr/statutory-rates").set(as()).send({ code: "epf_employee", rate: 800, effectiveFrom: "2020-01-01" }).expect(201);
    await http().post("/api/v1/hr/statutory-rates").set(as()).send({ code: "epf_employer", rate: 1200, effectiveFrom: "2020-01-01" }).expect(201);
    await http().post("/api/v1/hr/statutory-rates").set(as()).send({ code: "etf_employer", rate: 300, effectiveFrom: "2020-01-01" }).expect(201);
    // Illustrative APIT bands for testing the "income x rate - subtract" formula, NOT a real statutory table: 0% below Rs 100,000, 18% minus Rs 18,000 above (continuous at the boundary: 100,000 x 18% - 18,000 = 0).
    await http().post("/api/v1/hr/apit-brackets").set(as()).send({ effectiveFrom: "2020-01-01", lowerBound: "0", rate: 0, subtractAmount: "0" }).expect(201);
    await http().post("/api/v1/hr/apit-brackets").set(as()).send({ effectiveFrom: "2020-01-01", lowerBound: "100000", rate: 1800, subtractAmount: "18000" }).expect(201);
  });
  afterAll(async () => {
    await app?.close();
  });

  let allowanceId: string;
  let employeeA: string;
  let runA: string;

  it("calculates a payslip matching a hand-worked example", async () => {
    const allowance = await http().post("/api/v1/hr/salary-components").set(as()).send({ code: "ALLOW", name: "Transport allowance", type: "earning", category: "allowance" }).expect(201);
    allowanceId = allowance.body.id;

    const employee = await http().post("/api/v1/hr/employees").set(as()).send({ firstName: "Ama", lastName: "Perera", joiningDate: "2026-01-05" }).expect(201);
    employeeA = employee.body.id;
    await http().post("/api/v1/hr/salary-structures").set(as()).send({
      employeeId: employeeA, effectiveFrom: "2026-01-01", basicSalary: "100000.00", lines: [{ componentId: allowanceId, amount: "20000.00" }],
    }).expect(201);

    const run = await http().post("/api/v1/hr/payroll-runs").set(as()).send({ period: "2026-04" }).expect(201);
    runA = run.body.id;
    const calculated = await http().post(`/api/v1/hr/payroll-runs/${runA}/calculate`).set(as()).expect(200);
    // Gross = 100,000 basic + 20,000 allowance = 120,000. EPF employee 8% of basic = 8,000. Taxable income = 120,000 - 8,000 = 112,000,
    // which falls in the 18%-minus-18,000 band: 112,000 x 18% - 18,000 = 20,160 - 18,000 = 2,160 APIT. Net = 120,000 - 8,000 - 2,160 = 109,840.
    expect(calculated.body).toMatchObject({ status: "calculated", employeeCount: 1, totalGross: 12_000_000, totalDeductions: 1_016_000, totalNet: 10_984_000, totalEmployerCost: 13_500_000 });

    const payslips = await http().get(`/api/v1/hr/payroll-runs/${runA}/payslips`).set(as()).expect(200);
    expect(payslips.body).toHaveLength(1);
    expect(payslips.body[0]).toMatchObject({ employeeId: employeeA, grossPay: 12_000_000, epfEmployee: 800_000, epfEmployer: 1_200_000, etfEmployer: 300_000, apit: 216_000, totalDeductions: 1_016_000, netPay: 10_984_000, status: "ok" });

    // Recalculating replaces the payslip rather than adding a second one.
    await http().post(`/api/v1/hr/payroll-runs/${runA}/calculate`).set(as()).expect(200);
    const rerun = await http().get(`/api/v1/hr/payroll-runs/${runA}/payslips`).set(as()).expect(200);
    expect(rerun.body).toHaveLength(1);
    expect(rerun.body[0]).toMatchObject({ netPay: 10_984_000 });
  });

  it("approves and locks the run, posting one balanced journal to the general ledger", async () => {
    await http().post(`/api/v1/hr/payroll-runs/${runA}/approve`).set(as()).send({}).expect(200);
    const locked = await http().post(`/api/v1/hr/payroll-runs/${runA}/lock`).set(as()).expect(200);
    expect(locked.body.status).toBe("locked");
    await http().post(`/api/v1/hr/payroll-runs/${runA}/calculate`).set(as()).expect(400);

    expect(await balanceOf("2026-04", "6100")).toBe(12_000_000); // Salaries expense (gross)
    expect(await balanceOf("2026-04", "6110")).toBe(1_500_000); // Employer EPF + ETF
    expect(await balanceOf("2026-04", "2400")).toBe(10_984_000); // Net pay owed to employees
    expect(await balanceOf("2026-04", "2410")).toBe(2_300_000); // EPF + ETF payable (800,000 + 1,200,000 + 300,000)
    expect(await balanceOf("2026-04", "2420")).toBe(216_000); // APIT payable
  });

  it("prorates a full month of unpaid leave into a negative net pay, which blocks approval", async () => {
    const policy = await http().post("/api/v1/hr/leave-policies").set(as()).send({ code: "UNPAID", name: "Unpaid leave", type: "unpaid", annualEntitlementDays: 365, isPaid: false, requiresApproval: false }).expect(201);
    const employee = await http().post("/api/v1/hr/employees").set(as()).send({ firstName: "Nuwan", lastName: "Silva", joiningDate: "2026-01-05" }).expect(201);
    await http().post("/api/v1/hr/salary-structures").set(as()).send({ employeeId: employee.body.id, effectiveFrom: "2026-01-01", basicSalary: "100000.00" }).expect(201);
    // Requesting leave for every day of the run's own period means the days-off count always equals the period's working-day count exactly, whatever it is.
    await http().post("/api/v1/hr/leave-requests").set(as()).send({ employeeId: employee.body.id, policyId: policy.body.id, startDate: "2026-05-01", endDate: "2026-05-31" }).expect(201);

    const run = await http().post("/api/v1/hr/payroll-runs").set(as()).send({ period: "2026-05" }).expect(201);
    await http().post(`/api/v1/hr/payroll-runs/${run.body.id}/calculate`).set(as()).expect(200);
    const payslips = await http().get(`/api/v1/hr/payroll-runs/${run.body.id}/payslips`).set(as()).expect(200);
    const mine = payslips.body.find((p: { employeeId: string }) => p.employeeId === employee.body.id);
    expect(mine).toMatchObject({ unpaidLeaveDeduction: 10_000_000, status: "error" });
    expect(mine.netPay).toBeLessThan(0);

    await http().post(`/api/v1/hr/payroll-runs/${run.body.id}/approve`).set(as()).send({}).expect(400);
  });

  it("grants a loan, recovers an installment through payroll, and keeps the books balanced", async () => {
    const employee = await http().post("/api/v1/hr/employees").set(as()).send({ firstName: "Harsha", lastName: "Gunasekara", joiningDate: "2026-01-05" }).expect(201);
    await http().post("/api/v1/hr/salary-structures").set(as()).send({ employeeId: employee.body.id, effectiveFrom: "2026-01-01", basicSalary: "100000.00" }).expect(201);
    const loan = await http().post("/api/v1/hr/loans").set(as()).send({ employeeId: employee.body.id, type: "loan", principal: "50000.00", installmentAmount: "10000.00", grantedOn: "2026-06-01" }).expect(201);
    expect(await balanceOf("2026-06", "1250")).toBe(5_000_000); // Employee loans receivable, after disbursement

    const run = await http().post("/api/v1/hr/payroll-runs").set(as()).send({ period: "2026-06" }).expect(201);
    await http().post(`/api/v1/hr/payroll-runs/${run.body.id}/calculate`).set(as()).expect(200);
    const payslips = await http().get(`/api/v1/hr/payroll-runs/${run.body.id}/payslips`).set(as()).expect(200);
    const mine = payslips.body.find((p: { employeeId: string }) => p.employeeId === employee.body.id);
    expect(mine.loanDeductions).toBe(1_000_000);

    const loanAfter = await http().get(`/api/v1/hr/loans/${loan.body.id}`).set(as()).expect(200);
    expect(loanAfter.body.remainingBalance).toBe(4_000_000);

    await http().post(`/api/v1/hr/payroll-runs/${run.body.id}/approve`).set(as()).send({}).expect(200);
    await http().post(`/api/v1/hr/payroll-runs/${run.body.id}/lock`).set(as()).expect(200);
    expect(await balanceOf("2026-06", "1250")).toBe(5_000_000 - 1_000_000); // Recovered through the payroll journal
  });

  it("exposes a bank file and my own payslip history, and keeps payroll admin behind permissions", async () => {
    const bankFile = await http().get(`/api/v1/hr/payroll-runs/${runA}/bank-file`).set(as()).expect(200);
    expect(bankFile.body.csv.split("\n")[0]).toBe("Employee number,Name,Account number,Net pay");
    expect(bankFile.body.csv).toContain("109840.00");

    const viewerEmployee = await http().post("/api/v1/hr/employees").set(as()).send({ userId: `${t.tenantId}_viewer`, firstName: "Kasun", lastName: "Fernando", joiningDate: "2026-01-05" }).expect(201);
    await http().post("/api/v1/hr/salary-structures").set(as()).send({ employeeId: viewerEmployee.body.id, effectiveFrom: "2026-01-01", basicSalary: "80000.00" }).expect(201);
    const run = await http().post("/api/v1/hr/payroll-runs").set(as()).send({ period: "2026-07" }).expect(201);
    await http().post(`/api/v1/hr/payroll-runs/${run.body.id}/calculate`).set(as()).expect(200);

    const mine = await http().get("/api/v1/hr/self-service/me/payslips").set(as("viewer")).expect(200);
    expect(mine.body.find((p: { period: string }) => p.period === "2026-07")).toMatchObject({ grossPay: 8_000_000 });

    await http().post("/api/v1/hr/payroll-runs").set(as("viewer")).send({ period: "2026-08" }).expect(403);
  });
});
