import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("AI insights", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  const month = new Date().toISOString().slice(0, 7);

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    delete process.env.ANTHROPIC_API_KEY;
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    for (const a of (await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200)).body.items) acct[a.code] = a.id;
    await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: `${month}-01`, months: 12 }).expect(201);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("requires the insights permission", async () => {
    await http().get("/api/v1/ai/insights/run").set(as("viewer")).expect(403);
  });

  it("flags an expense anomaly, and falls back to a plain summary with no API key", async () => {
    const misc = await http().post("/api/v1/finance/accounts").set(as()).send({ code: "6800", name: "Misc2", type: "expense", parentId: acct["6000"] }).expect(201);
    const categoryId = (await http().post("/api/v1/expenses/categories").set(as()).send({ code: "MISC2", name: "Misc2", accountId: misc.body.id }).expect(201)).body.id;
    for (const amount of ["1000", "1200", "900"]) {
      await http().post("/api/v1/expenses/claims").set(as()).send({ title: "Normal", lines: [{ categoryId, description: "x", amount }] }).expect(201);
    }
    const big = await http().post("/api/v1/expenses/claims").set(as()).send({ title: "Big one", lines: [{ categoryId, description: "y", amount: "50000" }] }).expect(201);

    const res = await http().get("/api/v1/ai/insights/run").set(as()).expect(200);
    const flagged = res.body.insights.find((i: { type: string; data: { claimId: string } }) => i.type === "expense_anomaly" && i.data.claimId === big.body.id);
    expect(flagged).toBeTruthy();
    expect(res.body.summary).toContain("Big one");
  });
});
