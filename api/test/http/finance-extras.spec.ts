import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { advance } from "../../src/finance/extras.js";

describe("Finance: recurring journals, tax return, cash flow, ratios and revaluation", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${t.token("admin")}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const monthStart = (back: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toISOString().slice(0, 10);
  let customer: string;
  let supplier: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    for (const a of (await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200)).body.items) acct[a.code] = a.id;
    await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: monthStart(3), months: 12 }).expect(201);
    customer = (await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Global Imports", currency: "USD" }).expect(201)).body.id;
    supplier = (await http().post("/api/v1/procurement/suppliers").set(as()).send({ name: "Office Mart" }).expect(201)).body.id;
    const cap = await http().post("/api/v1/finance/journals").set(as()).send({ date: monthStart(3), lines: [{ accountId: acct["1120"], debit: "500000" }, { accountId: acct["3100"], credit: "500000" }] }).expect(201);
    await http().post(`/api/v1/finance/journals/${cap.body.id}/post`).set(as()).expect(200);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("advances schedules to the same day, clamped to month end", () => {
    expect(advance("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advance("2026-11-15", "quarterly")).toBe("2027-02-15");
    expect(advance("2028-02-29", "yearly")).toBe("2029-02-28");
  });

  it("posts recurring journals that are due, catching up, once", async () => {
    const r = await http().post("/api/v1/finance/recurring").set(as()).send({
      code: "RENT", name: "Monthly rent", frequency: "monthly", startDate: monthStart(3), memo: "Office rent",
      lines: [{ accountId: acct["6200"], debit: "40000" }, { accountId: acct["1120"], credit: "40000" }],
    }).expect(201);
    expect(r.body).toMatchObject({ status: "active", nextRunDate: monthStart(3), runs: 0 });
    const run = await http().post("/api/v1/finance/recurring/run-due").set(as()).send({}).expect(200);
    expect(run.body.posted).toHaveLength(4);
    expect(run.body.failed).toEqual([]);
    expect((await http().post("/api/v1/finance/recurring/run-due").set(as()).send({}).expect(200)).body.posted).toHaveLength(0);
    expect((await http().get(`/api/v1/finance/recurring/${r.body.id}`).set(as()).expect(200)).body).toMatchObject({ runs: 4, nextRunDate: monthStart(-1) });
  });

  it("summarises output and input tax and exports the return", async () => {
    await http().post("/api/v1/org/exchange-rates").set(as()).send({ fromCurrency: "USD", toCurrency: "LKR", rate: "300", effectiveDate: monthStart(3) }).expect(201);
    const inv = await http().post("/api/v1/finance/invoices").set(as()).send({ customerId: customer, date: today, lines: [{ description: "Consulting", qty: "1", unitPrice: "100", taxCode: "VAT" }] }).expect(201);
    expect(inv.body).toMatchObject({ currency: "USD", rate: "300" });
    await http().post(`/api/v1/finance/invoices/${inv.body.id}/post`).set(as()).expect(200);
    const bill = await http().post("/api/v1/finance/bills").set(as()).send({ supplierId: supplier, supplierInvoiceNo: "OM-1", date: today, lines: [{ description: "Stationery", qty: "1", unitPrice: "5000", taxCode: "VAT", accountId: acct["6300"] }] }).expect(201);
    await http().post(`/api/v1/finance/bills/${bill.body.id}/post`).set(as()).send({}).expect(200);

    const tax = (await http().get(`/api/v1/finance/reports/tax?from=${monthStart(0)}&to=${today}`).set(as()).expect(200)).body;
    expect(tax.lines.find((l: { taxCode: string }) => l.taxCode === "VAT")).toMatchObject({ rate: 1800, outputNet: 3_000_000, outputTax: 540_000, inputNet: 500_000, inputTax: 90_000 });
    expect(tax.netPayable).toBe(450_000);
    const csv = await http().get(`/api/v1/finance/reports/tax.csv?from=${monthStart(0)}&to=${today}`).set(as()).expect(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("NET_PAYABLE,,,,,4500.00");
  });

  it("classifies cash movements and computes ratios", async () => {
    const cf = (await http().get(`/api/v1/finance/reports/cash-flow?from=${monthStart(3)}&to=${today}`).set(as()).expect(200)).body;
    expect(cf.opening).toBe(0);
    expect(cf.financing.total).toBe(50_000_000);
    expect(cf.operating.total).toBe(-4 * 4_000_000);
    expect(cf.closing).toBe(50_000_000 - 16_000_000);
    const ratios = (await http().get(`/api/v1/finance/reports/ratios?to=${month}`).set(as()).expect(200)).body;
    expect(ratios.figures.revenue).toBe(3_000_000);
    expect(ratios.currentRatio).toBeGreaterThan(1);
  });

  it("revalues open foreign invoices and reverses next month", async () => {
    await http().post("/api/v1/org/exchange-rates").set(as()).send({ fromCurrency: "USD", toCurrency: "LKR", rate: "310", effectiveDate: today }).expect(201);
    const res = (await http().post("/api/v1/finance/fx-revaluation").set(as()).send({ date: today }).expect(200)).body;
    // 118 USD open: 36,580 at 310 against 35,400 carried.
    expect(res.receivable).toBe(118_000);
    expect(res.details).toHaveLength(1);
    expect(res.journal).toBeTruthy();
    expect(res.reversal).toBeTruthy();
    const tb = (await http().get(`/api/v1/finance/reports/trial-balance?to=${month}`).set(as()).expect(200)).body;
    expect(tb.lines.find((l: { code: string }) => l.code === "7100").balance).toBe(-118_000);
  });
});
