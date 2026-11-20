import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Notification channels: SMS and WhatsApp", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("stores and returns a text mute list alongside in-app and email", async () => {
    await http().put("/api/v1/me/notification-preferences").set(as()).send({ text: ["marketing"] }).expect(200);
    const prefs = await http().get("/api/v1/me/notification-preferences").set(as()).expect(200);
    expect(prefs.body.muted.text).toEqual(["marketing"]);
    expect(prefs.body.muted).toHaveProperty("inApp");
    expect(prefs.body.muted).toHaveProperty("email");
  });
});
