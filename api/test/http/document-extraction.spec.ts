import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("AI document extraction", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  const month = new Date().toISOString().slice(0, 7);
  let categoryId: string;
  const fileBase64 = Buffer.from("not a real file, just test content").toString("base64");

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["ai.documentExtraction.view"]);
    delete process.env.ANTHROPIC_API_KEY;
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    for (const a of (await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200)).body.items) acct[a.code] = a.id;
    await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: `${month}-01`, months: 12 }).expect(201);
    const misc = await http().post("/api/v1/finance/accounts").set(as()).send({ code: "6700", name: "Misc", type: "expense", parentId: acct["6000"] }).expect(201);
    categoryId = (await http().post("/api/v1/expenses/categories").set(as()).send({ code: "MISC", name: "Misc", accountId: misc.body.id }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("keeps extraction behind the create permission", async () => {
    await http().post("/api/v1/ai/document-extractions").set(as("viewer")).send({ docType: "receipt", fileName: "r.png", contentType: "image/png", fileBase64 }).expect(403);
    await http().get("/api/v1/ai/document-extractions").set(as("outsider")).expect(403);
  });

  it("extracts, reviews and creates a receipt draft, but refuses an unsupported doc type", async () => {
    const extraction = await http()
      .post("/api/v1/ai/document-extractions")
      .set(as())
      .send({ docType: "receipt", fileName: "receipt.png", contentType: "image/png", fileBase64 })
      .expect(201);
    expect(extraction.body).toMatchObject({ docType: "receipt", status: "failed", extractedData: {} });
    expect(extraction.body.error).toContain("isn't configured");

    const reviewed = await http()
      .patch(`/api/v1/ai/document-extractions/${extraction.body.id}`)
      .set({ ...as(), "If-Match": "1" })
      .send({ reviewedData: { merchant: "Cafe Colombo", totalAmount: "1180.00" } })
      .expect(200);
    expect(reviewed.body.status).toBe("reviewed");

    await http().post(`/api/v1/ai/document-extractions/${extraction.body.id}/create-draft`).set(as()).send({}).expect(400); // no categoryId
    const drafted = await http().post(`/api/v1/ai/document-extractions/${extraction.body.id}/create-draft`).set(as()).send({ categoryId }).expect(200);
    expect(drafted.body).toMatchObject({ status: "draft_created", draftEntityType: "expenses.claim" });
    expect(drafted.body.draftEntityId).toBeTruthy();
    await http().post(`/api/v1/ai/document-extractions/${extraction.body.id}/create-draft`).set(as()).send({ categoryId }).expect(400); // already drafted

    const cv = await http().post("/api/v1/ai/document-extractions").set(as()).send({ docType: "cv", fileName: "cv.pdf", contentType: "application/pdf", fileBase64 }).expect(201);
    await http().post(`/api/v1/ai/document-extractions/${cv.body.id}/create-draft`).set(as()).send({ categoryId }).expect(400); // cv not supported
  });
});
