import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Asset management: check-in/out, missing, audits and repairs", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  let assetId: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    for (const a of (await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200)).body.items) acct[a.code] = a.id;
    const category = (await http().post("/api/v1/assets/categories").set(as()).send({
      code: "IT", name: "IT equipment", assetAccountId: acct["1610"], accumulatedAccountId: acct["1690"], expenseAccountId: acct["6400"], usefulLifeMonths: 36,
    }).expect(201)).body.id;
    const asset = await http().post("/api/v1/assets/register").set(as()).send({
      name: "Laptop #42", categoryId: category, cost: "250000.00", serialNo: "LAP-42", warrantyExpiryDate: "2028-01-01",
    }).expect(201);
    assetId = asset.body.id;
    expect(asset.body).toMatchObject({ condition: "good", isMissing: false, checkedOutTo: null, warrantyExpiryDate: "2028-01-01" });
  });
  afterAll(async () => {
    await app?.close();
  });

  it("checks an asset out and back in, recording its condition", async () => {
    const out = await http().post(`/api/v1/assets/register/${assetId}/check-out`).set(as()).send({ to: "emp-123", dueBackDate: "2026-12-10" }).expect(200);
    expect(out.body).toMatchObject({ checkedOutTo: "emp-123", dueBackDate: "2026-12-10" });
    await http().post(`/api/v1/assets/register/${assetId}/check-out`).set(as()).send({ to: "emp-999" }).expect(400);

    const inBody = await http().post(`/api/v1/assets/register/${assetId}/check-in`).set(as()).send({ condition: "fair", notes: "Small scratch on the lid" }).expect(200);
    expect(inBody.body).toMatchObject({ checkedOutTo: null, dueBackDate: null, condition: "fair" });
    expect(inBody.body.history.at(-1)).toMatchObject({ event: "checked_in" });

    await http().post(`/api/v1/assets/register/${assetId}/check-in`).set(as()).send({}).expect(400);
  });

  it("reports an asset missing, and an audit finding it recovers it automatically", async () => {
    const missing = await http().post(`/api/v1/assets/register/${assetId}/report-missing`).set(as()).send({ notes: "Not at its desk" }).expect(200);
    expect(missing.body).toMatchObject({ isMissing: true });
    await http().post(`/api/v1/assets/register/${assetId}/report-missing`).set(as()).send({}).expect(400);

    const audit = await http().post("/api/v1/assets/audits").set(as()).send({ name: "Q4 IT count", scheduledDate: "2026-12-01" }).expect(201);
    const found = await http().post(`/api/v1/assets/audits/${audit.body.id}/findings`).set(as()).send({ assetId, result: "found", notes: "On the shelf after all" }).expect(200);
    expect(found.body.status).toBe("in_progress");
    expect(found.body.findings).toHaveLength(1);

    const asset = await http().get(`/api/v1/assets/register/${assetId}`).set(as()).expect(200);
    expect(asset.body).toMatchObject({ isMissing: false, missingSince: null });

    const completed = await http().post(`/api/v1/assets/audits/${audit.body.id}/complete`).set(as()).expect(200);
    expect(completed.body.status).toBe("completed");
    await http().post(`/api/v1/assets/audits/${audit.body.id}/findings`).set(as()).send({ assetId, result: "missing" }).expect(400);
  });

  it("logs a repair and completes it, keeping admin actions behind permissions", async () => {
    const repair = await http().post("/api/v1/assets/repairs").set(as()).send({ assetId, reportedDate: "2026-12-02", description: "Replace keyboard", cost: "8500.00" }).expect(201);
    expect(repair.body).toMatchObject({ status: "reported", cost: 850_000 });

    const completed = await http().post(`/api/v1/assets/repairs/${repair.body.id}/complete`).set(as()).send({ completedDate: "2026-12-05" }).expect(200);
    expect(completed.body).toMatchObject({ status: "completed", completedDate: "2026-12-05", cost: 850_000 });
    await http().post(`/api/v1/assets/repairs/${repair.body.id}/complete`).set(as()).send({}).expect(400);

    await http().post(`/api/v1/assets/register/${assetId}/report-missing`).set(as("viewer")).send({}).expect(403);
  });
});
