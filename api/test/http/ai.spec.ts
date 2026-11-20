import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("AI assistant", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("requires the ask permission", async () => {
    await http().post("/api/v1/ai/assistant/ask").set(as("viewer")).send({ question: "x" }).expect(403);
    await http().post("/api/v1/ai/assistant/ask").set(as("outsider")).send({ question: "x" }).expect(403);
  });

  it("answers with a not-configured message when ANTHROPIC_API_KEY isn't set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await http().post("/api/v1/ai/assistant/ask").set(as()).send({ question: "What are my overdue invoices?" }).expect(200);
    expect(res.body).toMatchObject({ configured: false });
    expect(res.body.answer).toContain("isn't configured");
  });

  it("validates the question body", async () => {
    await http().post("/api/v1/ai/assistant/ask").set(as()).send({}).expect(400);
  });
});
