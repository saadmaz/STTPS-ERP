import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("HTTP guard chain", () => {
  let app: INestApplication;
  let t: Seeded;
  let other: Seeded;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["org.branch.view"]);
    other = await seedTenant(app, []);
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (user: "admin" | "viewer" | "outsider", company = t.companyId) => ({
    Authorization: `Bearer ${t.token(user)}`,
    "x-company-id": company,
  });

  it("requires a token everywhere except public routes", async () => {
    await http().get("/api/v1/org/branches").expect(401);
    await http().get("/api/v1/auth/me").expect(401);
    await http().post("/api/v1/auth/login").send({}).expect(400);
  });

  it("requires a company context for permission-checked routes", async () => {
    const res = await http().get("/api/v1/org/branches").set({ Authorization: `Bearer ${t.token("viewer")}` }).expect(403);
    expect(res.body.message).toContain("x-company-id");
  });

  it("rejects companies of other tenants and users not assigned to the company", async () => {
    await http().get("/api/v1/org/branches").set(as("admin", other.companyId)).expect(403);
    await http().get("/api/v1/org/branches").set(as("outsider")).expect(403);
  });

  it("enforces per-action permissions", async () => {
    await http().get("/api/v1/org/branches").set(as("viewer")).expect(200);
    await http().post("/api/v1/org/branches").set(as("viewer")).send({ code: "HQ", name: "Head office" }).expect(403);
  });

  it("creates, validates, updates with If-Match and archives through the generic controller", async () => {
    const created = await http().post("/api/v1/org/branches").set(as("admin")).send({ code: "HQ", name: "Head office", type: "office" }).expect(201);
    expect(created.body).toMatchObject({ code: "HQ", type: "office", version: 1, companyId: t.companyId });

    await http().post("/api/v1/org/branches").set(as("admin")).send({ code: "hq", name: "Duplicate" }).expect(409);
    await http().post("/api/v1/org/branches").set(as("admin")).send({ code: "B2", name: "x", hacker: true }).expect(400);
    await http().post("/api/v1/org/branches").set(as("admin")).send({ code: "bad code!", name: "x" }).expect(400);

    const id = created.body.id;
    await http().patch(`/api/v1/org/branches/${id}`).set({ ...as("admin"), "If-Match": "1" }).send({ name: "HQ Colombo" }).expect(200);
    await http().patch(`/api/v1/org/branches/${id}`).set({ ...as("admin"), "If-Match": "1" }).send({ name: "Stale" }).expect(409);

    const list = await http().get("/api/v1/org/branches?q=colombo").set(as("viewer")).expect(200);
    expect(list.body.items.map((b: { name: string }) => b.name)).toEqual(["HQ Colombo"]);

    await http().post(`/api/v1/org/branches/${id}/archive`).set(as("admin")).send({ reason: "moved" }).expect(200);
    const after = await http().get("/api/v1/org/branches").set(as("viewer")).expect(200);
    expect(after.body.items).toHaveLength(0);

    const history = await http().get(`/api/v1/org/branches/${id}/history`).set(as("viewer")).expect(200);
    expect(history.body.map((h: { action: string }) => h.action)).toEqual(["archived", "updated", "created"]);
  });

  it("blocks privilege escalation through user and company updates", async () => {
    const viewerId = `${t.tenantId}_viewer`;
    // No permission at all.
    await http().put(`/api/v1/users/${viewerId}`).set(as("viewer")).send({ firstName: "x" }).expect(403);
    // Even an administrator cannot smuggle privilege flags through the profile update.
    await http().put(`/api/v1/users/${viewerId}`).set(as("admin")).send({ isSuperAdmin: true }).expect(400);
    await http().put(`/api/v1/users/${viewerId}`).set(as("admin")).send({ isPlatformAdmin: true }).expect(400);
    await http().put(`/api/v1/users/${viewerId}`).set(as("admin")).send({ tenantId: other.tenantId }).expect(400);
    const ok = await http().put(`/api/v1/users/${viewerId}`).set(as("admin")).send({ firstName: "Vera" }).expect(200);
    expect(ok.body).toMatchObject({ firstName: "Vera", isSuperAdmin: false, tenantId: t.tenantId });
    expect(ok.body).not.toHaveProperty("passwordHash");
    expect(ok.body).not.toHaveProperty("mfaSecret");

    await http().post("/api/v1/companies").set(as("viewer")).send({ name: "Sub", code: "SUB" }).expect(403);
    await http().put(`/api/v1/companies/${t.companyId}`).set(as("admin")).send({ code: "NEW" }).expect(400);
    await http().put(`/api/v1/companies/${t.companyId}`).set(as("admin")).send({ parentId: other.companyId }).expect(400);
  });

  it("returns the workspace context and the company directory for the UI", async () => {
    const ctx = await http().get("/api/v1/me/context").set(as("viewer")).expect(200);
    expect(ctx.body).toMatchObject({ companyId: t.companyId, allPermissions: false, permissions: ["org.branch.view"] });
    expect(ctx.body.modules).toEqual(expect.arrayContaining(["platform", "org", "workflow"]));
    const directory = await http().get("/api/v1/me/directory").set(as("viewer")).expect(200);
    // Only users assigned to the company, without secrets.
    expect(directory.body.map((u: { id: string }) => u.id)).toEqual([`${t.tenantId}_viewer`]);
    expect(directory.body[0]).not.toHaveProperty("passwordHash");
  });

  it("lists modules for navigation and protects module switches", async () => {
    const res = await http().get("/api/v1/platform/modules").set(as("viewer")).expect(200);
    expect(res.body.find((m: { key: string }) => m.key === "org")).toMatchObject({ enabled: true, core: true });
    await http().put("/api/v1/platform/modules/quality").set(as("viewer")).send({ enabled: true }).expect(403);
    await http().put("/api/v1/platform/modules/quality").set(as("admin")).send({ enabled: true }).expect(400); // quality is not available yet
  });
});
