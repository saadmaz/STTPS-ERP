import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";

describe("Finance: chart of accounts, journals, automatic postings and statements", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  let fiscalYearId: string;
  let warehouse: string;
  let product: string;
  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["finance.journal.view", "finance.journal.create", "finance.journal.edit", "finance.account.view", "finance.reports.view"]);
    warehouse = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "WH", name: "Main" }).expect(201)).body.id;
    product = (await http().post("/api/v1/products/items").set(as()).send({ name: "Paint 4L" }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  const adjust = async (qty: string, unitCost?: string, productId = product) => {
    const adj = await http().post("/api/v1/inventory/adjustments").set(as()).send({ warehouseId: warehouse, reason: qty.startsWith("-") ? "damaged" : "opening_balance", lines: [{ productId, qty, unitCost }] }).expect(201);
    await http().post(`/api/v1/inventory/adjustments/${adj.body.id}/submit`).set(as()).expect(200);
    await app.get(JobQueueService).drain();
  };
  const trial = async () => (await http().get(`/api/v1/finance/reports/trial-balance?to=${month}`).set(as()).expect(200)).body;
  const balanceOf = async (code: string) => (await trial()).lines.find((l: { code: string }) => l.code === code)?.balance ?? 0;

  it("does nothing automatically until finance is set up", async () => {
    await adjust("10", "100");
    expect((await http().get("/api/v1/finance/journals").set(as()).expect(200)).body.items).toHaveLength(0);
  });

  it("creates the standard chart and posting rules once", async () => {
    const before = await http().get("/api/v1/finance/settings").set(as()).expect(200);
    expect(before.body).toMatchObject({ configured: false, baseCurrency: "LKR" });
    const res = await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    expect(res.body.accounts).toBeGreaterThan(30);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(400);
    const s = await http().get("/api/v1/finance/settings").set(as()).expect(200);
    expect(s.body).toMatchObject({ configured: true, missingRoles: [] });
    const chart = await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200);
    for (const a of chart.body.items) acct[a.code] = a.id;
    expect(chart.body.items.find((a: { code: string }) => a.code === "1200")).toMatchObject({ isControl: true, type: "asset" });
    const fy = await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: `${today.slice(0, 7)}-01`, months: 12 }).expect(201);
    fiscalYearId = fy.body.id;
  });

  it("keeps the chart consistent", async () => {
    await http().post("/api/v1/finance/accounts").set(as()).send({ code: "6250", name: "Insurance", type: "expense", parentId: acct["1000"] }).expect(400);
    const ins = await http().post("/api/v1/finance/accounts").set(as()).send({ code: "6250", name: "Insurance", type: "expense", parentId: acct["6000"] }).expect(201);
    acct["6250"] = ins.body.id;
    await http().post("/api/v1/finance/accounts").set(as()).send({ code: "6250", name: "Duplicate", type: "expense" }).expect(409);
  });

  let capitalId: string;

  it("posts balanced manual journals and rejects bad ones", async () => {
    await http().post("/api/v1/finance/journals").set(as()).send({ date: today, lines: [{ accountId: acct["1120"], debit: "100" }, { accountId: acct["3100"], credit: "90" }] }).expect(400);
    await http().post("/api/v1/finance/journals").set(as()).send({ date: today, lines: [{ accountId: acct["1100"], debit: "100" }, { accountId: acct["3100"], credit: "100" }] }).expect(400);
    const ar = await http().post("/api/v1/finance/journals").set(as("viewer")).send({ date: today, lines: [{ accountId: acct["1200"], debit: "100" }, { accountId: acct["4300"], credit: "100" }] }).expect(403);
    expect(ar.body.message).toContain("control account");

    const j = await http().post("/api/v1/finance/journals").set(as("viewer")).send({
      date: today, memo: "Capital injection",
      lines: [{ accountId: acct["1120"], debit: "1000000" }, { accountId: acct["3100"], credit: "1000000" }],
    }).expect(201);
    expect(j.body).toMatchObject({ number: expect.stringMatching(/^JE-\d{4}-\d{6}$/), status: "draft", totalDebit: 100_000_000, currency: "LKR" });
    expect(await balanceOf("1120")).toBe(0);
    const posted = await http().post(`/api/v1/finance/journals/${j.body.id}/post`).set(as("viewer")).expect(200);
    expect(posted.body).toMatchObject({ status: "posted" });
    await http().patch(`/api/v1/finance/journals/${j.body.id}`).set(as()).send({ memo: "x" }).expect(400);
    expect(await balanceOf("1120")).toBe(100_000_000);
    expect(await balanceOf("3100")).toBe(100_000_000);
    capitalId = j.body.id;
  });

  it("reverses a posted journal with its mirror image", async () => {
    const rent = await http().post("/api/v1/finance/journals").set(as()).send({ date: today, lines: [{ accountId: acct["6200"], debit: "50000" }, { accountId: acct["1120"], credit: "50000" }] }).expect(201);
    await http().post(`/api/v1/finance/journals/${rent.body.id}/post`).set(as()).expect(200);
    expect(await balanceOf("6200")).toBe(5_000_000);
    const rev = await http().post(`/api/v1/finance/journals/${rent.body.id}/reverse`).set(as()).send({}).expect(200);
    expect(rev.body).toMatchObject({ source: "reversal", status: "posted", reversalOfId: rent.body.id });
    expect((await http().get(`/api/v1/finance/journals/${rent.body.id}`).set(as()).expect(200)).body).toMatchObject({ status: "reversed", reversedById: rev.body.id });
    expect(await balanceOf("6200")).toBe(0);
    await http().post(`/api/v1/finance/journals/${rent.body.id}/reverse`).set(as()).send({}).expect(400);
  });

  it("sends journals for approval when a workflow applies", async () => {
    await http().post("/api/v1/workflow/definitions").set(as()).send({
      code: "JE-BIG", name: "Large journals", entityType: "finance.journal",
      conditions: [{ fact: "amount", op: "gte", value: 10_000_000 }],
      steps: [{ name: "Controller", approvers: [{ type: "user", ids: [`${t.tenantId}_admin`] }] }],
    }).expect(201);
    const j = await http().post("/api/v1/finance/journals").set(as("viewer")).send({ date: today, lines: [{ accountId: acct["6100"], debit: "200000" }, { accountId: acct["1120"], credit: "200000" }] }).expect(201);
    expect((await http().post(`/api/v1/finance/journals/${j.body.id}/post`).set(as("viewer")).expect(200)).body.status).toBe("pending_approval");
    expect(await balanceOf("6100")).toBe(0);
    const req = await http().get(`/api/v1/workflow/requests/for/finance.journal/${j.body.id}`).set(as()).expect(200);
    await http().post(`/api/v1/workflow/requests/${req.body[0].id}/approve`).set(as()).send({}).expect(200);
    await app.get(JobQueueService).drain();
    expect((await http().get(`/api/v1/finance/journals/${j.body.id}`).set(as()).expect(200)).body.status).toBe("posted");
    expect(await balanceOf("6100")).toBe(20_000_000);
  });

  let paint: string;

  it("posts stock value changes from inventory automatically", async () => {
    paint = (await http().post("/api/v1/products/items").set(as()).send({ name: "Paint 10L" }).expect(201)).body.id;
    await adjust("20", "150", paint);
    expect(await balanceOf("1300")).toBe(20 * 15_000);
    expect(await balanceOf("5200")).toBe(-(20 * 15_000));
    await adjust("-2", undefined, paint);
    expect(await balanceOf("1300")).toBe(18 * 15_000);
    const system = (await http().get("/api/v1/finance/journals?where=source:system").set(as()).expect(200)).body.items;
    expect(system).toHaveLength(2);
    expect(system[0]).toMatchObject({ status: "posted", sourceEvent: { type: "StockMoved" }, reference: { entityType: "inventory.movement" } });
  });

  it("keeps a failed automatic posting as an issue and posts it on retry", async () => {
    const period = (await http().get(`/api/v1/org/fiscal-periods/for-date?date=${today}`).set(as()).expect(200)).body.period.number;
    await http().post(`/api/v1/org/fiscal-years/${fiscalYearId}/periods/${period}/status`).set(as()).send({ status: "locked" }).expect(200);
    await http().post("/api/v1/finance/journals").set(as()).send({ date: today, lines: [{ accountId: acct["6200"], debit: "1" }, { accountId: acct["1120"], credit: "1" }] }).expect(201)
      .then((r) => http().post(`/api/v1/finance/journals/${r.body.id}/post`).set(as()).expect(403));
    await adjust("1", "150", paint);
    const issues = (await http().get("/api/v1/finance/posting-issues").set(as()).expect(200)).body;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ eventType: "StockMoved", status: "open", error: expect.stringContaining("locked") });
    expect(await balanceOf("1300")).toBe(18 * 15_000);

    await http().post(`/api/v1/org/fiscal-years/${fiscalYearId}/periods/${period}/status`).set(as()).send({ status: "open" }).expect(200);
    const retried = await http().post(`/api/v1/finance/posting-issues/${issues[0].id}/retry`).set(as()).expect(200);
    expect(retried.body.issue.status).toBe("resolved");
    expect(retried.body.journal.status).toBe("posted");
    expect(await balanceOf("1300")).toBe(19 * 15_000);
    expect((await http().get("/api/v1/finance/posting-issues").set(as()).expect(200)).body).toHaveLength(0);
  });

  it("produces a balanced trial balance, P&L and balance sheet", async () => {
    const tb = await trial();
    expect(tb.totalDebit).toBe(tb.totalCredit);
    const pl = (await http().get(`/api/v1/finance/reports/profit-and-loss?from=${month}&to=${month}`).set(as()).expect(200)).body;
    // Salaries 200,000 less inventory gains (20 + 1 - 2 = 19 units at 150 = 2,850 credited to adjustments).
    expect(pl.totalExpenses).toBe(20_000_000 - 19 * 15_000);
    expect(pl.netProfit).toBe(-(20_000_000 - 19 * 15_000));
    const bs = (await http().get(`/api/v1/finance/reports/balance-sheet?to=${month}`).set(as()).expect(200)).body;
    expect(bs.balanced).toBe(true);
    expect(bs.currentEarnings).toBe(pl.netProfit);
    await http().get("/api/v1/finance/reports/trial-balance?to=November").set(as()).expect(400);
  });

  it("shows an account's lines with a running balance", async () => {
    const led = (await http().get(`/api/v1/finance/reports/ledger/${acct["1120"]}`).set(as("viewer")).expect(200)).body;
    expect(led.lines.map((l: { debit: number; credit: number }) => l.debit - l.credit)).toEqual([100_000_000, -5_000_000, 5_000_000, -20_000_000]);
    expect(led.closing).toBe(80_000_000);
    expect(led.lines[0].journalId).toBe(capitalId);
    await http().get(`/api/v1/finance/reports/ledger/${acct["1100"]}`).set(as()).expect(400);
  });
});
