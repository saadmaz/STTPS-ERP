import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { spread } from "../../src/finance/budget.js";

describe("Finance: budgets, budget vs actual and procurement controls", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${t.token("admin")}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  const today = new Date().toISOString().slice(0, 10);
  let year: string;
  let dept: string;
  let item: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    for (const a of (await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200)).body.items) acct[a.code] = a.id;
    year = (await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: `${today.slice(0, 7)}-01`, months: 12 }).expect(201)).body.id;
    dept = (await http().post("/api/v1/org/departments").set(as()).send({ code: "OPS", name: "Operations" }).expect(201)).body.id;
    item = (await http().post("/api/v1/products/items").set(as()).send({ name: "Safety boots", purchasePrice: "1000" }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  const requisition = async (qty: string) => (await http().post("/api/v1/procurement/requisitions").set(as()).send({ departmentId: dept, lines: [{ productId: item, qty }] }).expect(201)).body.id as string;

  it("spreads annual figures evenly", () => {
    expect(spread(100, 12)).toEqual([8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9]);
    expect(spread(120, 12).every((n) => n === 10)).toBe(true);
  });

  let budgetId: string;

  it("approves a department budget and compares it with the ledger", async () => {
    await http().post("/api/v1/finance/budgets").set(as()).send({ code: "OPS-26", name: "Operations", fiscalYearId: year, dimension: "department", lines: [{ accountId: acct["6200"], annual: "1" }] }).expect(400);
    await http().post("/api/v1/finance/budgets").set(as()).send({ code: "OPS-26", name: "Operations", fiscalYearId: year, dimension: "department", dimensionId: dept, lines: [{ accountId: acct["6000"], annual: "1" }] }).expect(400);
    const b = await http().post("/api/v1/finance/budgets").set(as()).send({
      code: "OPS-26", name: "Operations", fiscalYearId: year, dimension: "department", dimensionId: dept, control: "block",
      lines: [{ accountId: acct["6200"], annual: "120000" }, { accountId: acct["6300"], amounts: Array(12).fill("1000") }],
    }).expect(201);
    expect(b.body).toMatchObject({ status: "draft", revision: 1, total: 13_200_000 });
    expect((await http().post(`/api/v1/finance/budgets/${b.body.id}/submit`).set(as()).expect(200)).body.status).toBe("approved");
    await http().patch(`/api/v1/finance/budgets/${b.body.id}`).set(as()).send({ name: "x" }).expect(400);

    const j = await http().post("/api/v1/finance/journals").set(as()).send({
      date: today, lines: [{ accountId: acct["6200"], debit: "30000", departmentId: dept }, { accountId: acct["6200"], debit: "999" }, { accountId: acct["1120"], credit: "30999" }],
    }).expect(201);
    await http().post(`/api/v1/finance/journals/${j.body.id}/post`).set(as()).expect(200);
    const vs = (await http().get(`/api/v1/finance/budgets/${b.body.id}/vs-actual`).set(as()).expect(200)).body;
    expect(vs.periods).toHaveLength(12);
    const rent = vs.lines.find((l: { code: string }) => l.code === "6200");
    expect(rent).toMatchObject({ totalBudget: 12_000_000, totalActual: 3_000_000, variance: 9_000_000, usedPct: 25 });
    expect(rent.actual[0]).toBe(3_000_000);
    budgetId = b.body.id;
  });

  it("blocks requisitions beyond what is left after actuals and commitments", async () => {
    // Budget 132,000 − actual 30,000 = 102,000 available.
    const big = await requisition("110");
    const refused = await http().post(`/api/v1/procurement/requisitions/${big}/submit`).set(as()).expect(400);
    expect(refused.body.message).toContain("Over budget OPS-26: 102000.00 available");
    const first = await requisition("60");
    expect((await http().post(`/api/v1/procurement/requisitions/${first}/submit`).set(as()).expect(200)).body.status).toBe("approved");
    const second = await requisition("50");
    const blocked = await http().post(`/api/v1/procurement/requisitions/${second}/submit`).set(as()).expect(400);
    expect(blocked.body.message).toContain("42000.00 available");
  });

  it("revises a budget, supersedes the old one and softens the control", async () => {
    const rev = await http().post(`/api/v1/finance/budgets/${budgetId}/revise`).set(as()).expect(200);
    expect(rev.body).toMatchObject({ code: "OPS-26-R2", revision: 2, previousId: budgetId, status: "draft" });
    await http().patch(`/api/v1/finance/budgets/${rev.body.id}`).set(as()).send({ control: "warn" }).expect(200);
    await http().post(`/api/v1/finance/budgets/${rev.body.id}/submit`).set(as()).expect(200);
    expect((await http().get(`/api/v1/finance/budgets/${budgetId}`).set(as()).expect(200)).body.status).toBe("superseded");

    const second = await requisition("50");
    expect((await http().post(`/api/v1/procurement/requisitions/${second}/submit`).set(as()).expect(200)).body.status).toBe("approved");

    const clash = await http().post("/api/v1/finance/budgets").set(as()).send({ code: "OPS-DUP", name: "Dup", fiscalYearId: year, dimension: "department", dimensionId: dept, lines: [{ accountId: acct["6200"], annual: "1" }] }).expect(201);
    const res = await http().post(`/api/v1/finance/budgets/${clash.body.id}/submit`).set(as()).expect(400);
    expect(res.body.message).toContain("revise it instead");
  });
});
