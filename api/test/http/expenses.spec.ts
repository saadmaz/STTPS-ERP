import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";
import { MemoryStorage, ObjectStorageProvider } from "../../src/platform/files/object-storage.js";

describe("Expenses: claims, approval, posting and reimbursement", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  const month = new Date().toISOString().slice(0, 7);
  let travel: string;
  let meals: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["expenses.claim.view", "expenses.claim.create", "expenses.claim.edit", "expenses.category.view"]);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    for (const a of (await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200)).body.items) acct[a.code] = a.id;
    await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: `${month}-01`, months: 12 }).expect(201);
    const trav = await http().post("/api/v1/finance/accounts").set(as()).send({ code: "6600", name: "Travel", type: "expense", parentId: acct["6000"] }).expect(201);
    acct["6600"] = trav.body.id;
    await http().post("/api/v1/expenses/categories").set(as()).send({ code: "BAD", name: "Bad", accountId: acct["1120"] }).expect(400);
    travel = (await http().post("/api/v1/expenses/categories").set(as()).send({ code: "TRAVEL", name: "Travel", accountId: acct["6600"], taxCode: "VAT", receiptRequired: true }).expect(201)).body.id;
    meals = (await http().post("/api/v1/expenses/categories").set(as()).send({ code: "MEALS", name: "Meals", accountId: acct["6600"], receiptRequired: false, limit: "5000" }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  const balanceOf = async (code: string) => (await http().get(`/api/v1/finance/reports/trial-balance?to=${month}`).set(as()).expect(200)).body.lines.find((l: { code: string }) => l.code === code)?.balance ?? 0;

  it("splits tax out of receipts and enforces category limits", async () => {
    await http().post("/api/v1/expenses/claims").set(as("viewer")).send({ title: "Lunch", lines: [{ categoryId: meals, description: "Team lunch", amount: "6000" }] }).expect(400);
    const claim = await http().post("/api/v1/expenses/claims").set(as("viewer")).send({
      title: "Client visit, Kandy", lines: [{ categoryId: travel, description: "Hotel", amount: "11800" }, { categoryId: meals, description: "Dinner", amount: "2500" }],
    }).expect(201);
    expect(claim.body).toMatchObject({ number: expect.stringMatching(/^EXP-/), employeeId: `${t.tenantId}_viewer`, status: "draft", total: 1_430_000, tax: 180_000 });
    expect(claim.body.lines[0]).toMatchObject({ net: 1_000_000, tax: 180_000, taxCode: "VAT" });
    expect(claim.body.lines[1]).toMatchObject({ net: 250_000, tax: 0 });
  });

  it("needs receipts, goes through approval, posts and is reimbursed", async () => {
    const claim = (await http().get("/api/v1/expenses/claims").set(as("viewer")).expect(200)).body.items[0];
    const noReceipt = await http().post(`/api/v1/expenses/claims/${claim.id}/submit`).set(as("viewer")).expect(400);
    expect(noReceipt.body.message).toContain("Attach the receipts");

    const storage = app.get(ObjectStorageProvider).storage as MemoryStorage;
    const up = await http().post("/api/v1/files/upload-url").set(as("viewer")).send({ entityType: "expenses.claim", entityId: claim.id, name: "hotel.jpg", contentType: "image/jpeg", size: 20 }).expect(201);
    storage.put(up.body.file.storageKey, 20, "image/jpeg");
    await http().post(`/api/v1/files/${up.body.file.id}/complete`).set(as("viewer")).expect(200);

    await http().post("/api/v1/workflow/definitions").set(as()).send({
      code: "EXP", name: "Expense approval", entityType: "expenses.claim", steps: [{ name: "Finance", approvers: [{ type: "user", ids: [`${t.tenantId}_admin`] }] }],
    }).expect(201);
    await http().post(`/api/v1/expenses/claims/${claim.id}/submit`).set(as()).expect(400);
    expect((await http().post(`/api/v1/expenses/claims/${claim.id}/submit`).set(as("viewer")).expect(200)).body.status).toBe("pending_approval");
    expect(await balanceOf("6600")).toBe(0);
    const req = await http().get(`/api/v1/workflow/requests/for/expenses.claim/${claim.id}`).set(as()).expect(200);
    await http().post(`/api/v1/workflow/requests/${req.body[0].id}/approve`).set(as()).send({}).expect(200);
    await app.get(JobQueueService).drain();

    const approved = (await http().get(`/api/v1/expenses/claims/${claim.id}`).set(as()).expect(200)).body;
    expect(approved).toMatchObject({ status: "approved", journalId: expect.any(String) });
    expect(await balanceOf("6600")).toBe(1_250_000);
    expect(await balanceOf("1400")).toBe(180_000);
    expect(await balanceOf("2100")).toBe(1_430_000);

    await http().post(`/api/v1/expenses/claims/${claim.id}/reimburse`).set(as()).send({}).expect(200);
    expect(await balanceOf("2100")).toBe(0);
    expect(await balanceOf("1120")).toBe(-1_430_000);
    await http().post(`/api/v1/expenses/claims/${claim.id}/reimburse`).set(as()).send({}).expect(400);
  });
});
