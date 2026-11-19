import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { monthlyCharge, nextMonth } from "../../src/finance/assets.js";

describe("Assets: register, depreciation, impairment and disposal", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${t.token("admin")}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString().slice(0, 10);
  let category: string;
  let assetId: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    for (const a of (await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200)).body.items) acct[a.code] = a.id;
    await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: start, months: 12 }).expect(201);
  });
  afterAll(async () => {
    await app?.close();
  });

  const balanceOf = async (code: string) => (await http().get(`/api/v1/finance/reports/trial-balance?to=${month}`).set(as()).expect(200)).body.lines.find((l: { code: string }) => l.code === code)?.balance ?? 0;

  it("works out monthly charges", () => {
    const base = { cost: 120_000, residualValue: 0, method: "straight_line" as const, usefulLifeMonths: 12, decliningRate: null, accumulatedDepreciation: 0, impairment: 0 };
    expect(monthlyCharge(base, 0)).toBe(10_000);
    expect(monthlyCharge({ ...base, accumulatedDepreciation: 115_000 }, 11)).toBe(5_000);
    expect(monthlyCharge({ ...base, residualValue: 20_000, accumulatedDepreciation: 100_000 }, 10)).toBe(0);
    expect(monthlyCharge({ ...base, method: "declining_balance", decliningRate: 2400 }, 0)).toBe(2_400);
    expect(nextMonth("2026-12")).toBe("2027-01");
  });

  it("registers and capitalises an asset", async () => {
    await http().post("/api/v1/assets/categories").set(as()).send({ code: "BAD", name: "Bad", assetAccountId: acct["6400"], accumulatedAccountId: acct["1690"], expenseAccountId: acct["6400"], usefulLifeMonths: 60 }).expect(400);
    category = (await http().post("/api/v1/assets/categories").set(as()).send({
      code: "PLANT", name: "Plant and machinery", assetAccountId: acct["1610"], accumulatedAccountId: acct["1690"], expenseAccountId: acct["6400"], usefulLifeMonths: 60,
    }).expect(201)).body.id;
    const a = await http().post("/api/v1/assets/register").set(as()).send({ name: "Tile cutter", categoryId: category, cost: "600000", inServiceDate: start, serialNo: "TC-1" }).expect(201);
    expect(a.body).toMatchObject({ code: "FA-000001", status: "draft", bookValue: 60_000_000, usefulLifeMonths: 60 });
    const cap = await http().post(`/api/v1/assets/register/${a.body.id}/capitalise`).set(as()).send({ creditAccountId: acct["1120"] }).expect(200);
    expect(cap.body).toMatchObject({ status: "active", capitalisationJournalId: expect.any(String) });
    expect(await balanceOf("1610")).toBe(60_000_000);
    assetId = a.body.id;
  });

  it("depreciates monthly, catching up missed months, once per period", async () => {
    const run = await http().post("/api/v1/assets/depreciation-run").set(as()).send({ period: month }).expect(200);
    expect(run.body.total).toBe(4 * 1_000_000);
    expect(await balanceOf("6400")).toBe(4_000_000);
    expect(await balanceOf("1690")).toBe(-4_000_000);
    const again = await http().post("/api/v1/assets/depreciation-run").set(as()).send({ period: month }).expect(200);
    expect(again.body.total).toBe(0);
    const a = (await http().get(`/api/v1/assets/register/${assetId}`).set(as()).expect(200)).body;
    expect(a).toMatchObject({ accumulatedDepreciation: 4_000_000, bookValue: 56_000_000, lastDepreciatedPeriod: month });
    const schedule = (await http().get(`/api/v1/assets/register/${assetId}/schedule`).set(as()).expect(200)).body;
    expect(schedule.rows).toHaveLength(56);
    expect(schedule.rows.at(-1).bookValue).toBe(0);
  });

  it("impairs, transfers and disposes with the gain or loss booked", async () => {
    await http().post(`/api/v1/assets/register/${assetId}/impair`).set(as()).send({ amount: "10000", accountId: acct["6400"], reason: "Damaged blade housing" }).expect(200);
    const moved = await http().post(`/api/v1/assets/register/${assetId}/transfer`).set(as()).send({ location: "Galle yard" }).expect(200);
    expect(moved.body.history.at(-1)).toMatchObject({ event: "transferred" });
    await http().post(`/api/v1/assets/register/${assetId}/dispose`).set(as()).send({ proceeds: "500000", gainLossAccountId: acct["4300"] }).expect(400);
    const d = await http().post(`/api/v1/assets/register/${assetId}/dispose`).set(as()).send({ proceeds: "500000", proceedsAccountId: acct["1120"], gainLossAccountId: acct["4300"] }).expect(200);
    expect(d.body).toMatchObject({ status: "disposed", bookValue: 0, disposal: { proceeds: 50_000_000, gainOrLoss: -5_000_000 } });
    expect(await balanceOf("1610")).toBe(0);
    expect(await balanceOf("1690")).toBe(0);
    expect(await balanceOf("4300")).toBe(-5_000_000);
    await http().post(`/api/v1/assets/register/${assetId}/dispose`).set(as()).send({ proceeds: "0", gainLossAccountId: acct["4300"] }).expect(400);
  });
});
