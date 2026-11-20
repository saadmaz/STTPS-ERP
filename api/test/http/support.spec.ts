import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Support desk and customer portal", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, [
      "support.ticket.view", "support.ticket.create", "support.ticket.edit",
      "support.slaPolicy.view", "support.slaPolicy.create", "support.portalUser.view",
    ]);
  });
  afterAll(async () => {
    await app?.close();
  });

  let customerId: string;
  let otherCustomerId: string;
  let ticketId: string;

  it("sets up a default SLA policy and a customer", async () => {
    const customer = await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Acme Lanka" }).expect(201);
    customerId = customer.body.id;
    const other = await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Other Co" }).expect(201);
    otherCustomerId = other.body.id;

    const policy = await http().post("/api/v1/support/sla-policies").set(as()).send({
      name: "Standard", tier: "standard", isDefault: true,
      targets: [
        { priority: "low", responseMinutes: 480, resolutionMinutes: 2880 },
        { priority: "medium", responseMinutes: 120, resolutionMinutes: 1440 },
        { priority: "high", responseMinutes: 30, resolutionMinutes: 480 },
        { priority: "urgent", responseMinutes: 10, resolutionMinutes: 120 },
      ],
    }).expect(201);
    expect(policy.body.isDefault).toBe(true);
  });

  it("opens a ticket and computes SLA due dates from the default policy", async () => {
    const before = Date.now();
    const ticket = await http().post("/api/v1/support/tickets").set(as("viewer")).send({
      customerId, subject: "Printer not working", priority: "high", channel: "phone",
    }).expect(201);
    ticketId = ticket.body.id;
    expect(ticket.body.number).toMatch(/^TKT-/);
    expect(ticket.body.status).toBe("new");
    expect(ticket.body.slaPolicyId).toBeTruthy();
    expect(new Date(ticket.body.firstResponseDueAt).getTime() - before).toBeGreaterThan(29 * 60_000);
    expect(new Date(ticket.body.firstResponseDueAt).getTime() - before).toBeLessThan(31 * 60_000);
  });

  it("assigns, replies and moves through the status flow", async () => {
    const assigned = await http().post(`/api/v1/support/tickets/${ticketId}/assign`).set(as("viewer")).send({ assignedTo: "staff-1" }).expect(200);
    expect(assigned.body).toMatchObject({ status: "assigned", assignedTo: "staff-1" });

    const replied = await http().post(`/api/v1/support/tickets/${ticketId}/reply`).set(as("viewer")).send({ body: "Looking into it" }).expect(200);
    expect(replied.body.status).toBe("in_progress");
    expect(replied.body.replies).toEqual([expect.objectContaining({ authorType: "staff", body: "Looking into it" })]);
    expect(replied.body.respondedAt).toBeTruthy();

    const waiting = await http().post(`/api/v1/support/tickets/${ticketId}/status`).set(as("viewer")).send({ status: "waiting_customer" }).expect(200);
    expect(waiting.body.status).toBe("waiting_customer");

    const resolved = await http().post(`/api/v1/support/tickets/${ticketId}/status`).set(as("viewer")).send({ status: "resolved" }).expect(200);
    expect(resolved.body.status).toBe("resolved");
    expect(resolved.body.resolvedAt).toBeTruthy();
  });

  it("keeps escalate and merge behind the manage permission, not plain edit", async () => {
    const second = await http().post("/api/v1/support/tickets").set(as()).send({ customerId, subject: "Duplicate report" }).expect(201);

    await http().post(`/api/v1/support/tickets/${ticketId}/escalate`).set(as("viewer")).send({ to: "staff-2" }).expect(403);

    const escalated = await http().post(`/api/v1/support/tickets/${second.body.id}/escalate`).set(as()).send({ to: "staff-2" }).expect(200);
    expect(escalated.body).toMatchObject({ assignedTo: "staff-2", status: "assigned", priority: "high" });

    const merged = await http().post(`/api/v1/support/tickets/${second.body.id}/merge`).set(as()).send({ intoId: ticketId }).expect(200);
    expect(merged.body).toMatchObject({ status: "closed", mergedIntoId: ticketId });
  });

  let setupToken: string;
  let portalEmail: string;

  it("provisions a customer portal login with a one-time setup token", async () => {
    portalEmail = `buyer+${customerId}@example.com`;
    const res = await http().post("/api/v1/support/portal-users").set(as()).send({ customerId, email: portalEmail }).expect(201);
    expect(res.body.setupToken).toBeTruthy();
    expect(res.body.user.passwordHash).toBeUndefined(); // stripped globally, never leaves the API
    setupToken = res.body.setupToken;

    await http().post("/api/v1/support/portal-users").set(as("viewer")).send({ customerId, email: "nope@example.com" }).expect(403);
  });

  let portalToken: string;

  it("lets the customer set a password from the setup link and sign in", async () => {
    await http().post("/api/v1/portal/auth/set-password").send({ token: setupToken, password: "Passw0rd123" }).expect(200);
    await http().post("/api/v1/portal/auth/set-password").send({ token: setupToken, password: "Passw0rd123" }).expect(401); // single-use

    await http().post("/api/v1/portal/auth/login").send({ email: portalEmail, password: "WrongPass123" }).expect(401);
    const login = await http().post("/api/v1/portal/auth/login").send({ email: portalEmail, password: "Passw0rd123" }).expect(200);
    portalToken = login.body.accessToken;
    expect(login.body.portalUser).toMatchObject({ email: portalEmail, customerId });
  });

  it("scopes the portal to the signed-in customer's own tickets", async () => {
    const mine = await http().get("/api/v1/portal/tickets").set({ Authorization: `Bearer ${portalToken}` }).expect(200);
    expect(mine.body.items.some((x: { id: string }) => x.id === ticketId)).toBe(true);

    const opened = await http().post("/api/v1/portal/tickets").set({ Authorization: `Bearer ${portalToken}` }).send({ subject: "Need a quote" }).expect(201);
    expect(opened.body).toMatchObject({ customerId, channel: "portal", status: "new" });

    const replied = await http().post(`/api/v1/portal/tickets/${opened.body.id}/reply`).set({ Authorization: `Bearer ${portalToken}` }).send({ body: "Any update?" }).expect(200);
    expect(replied.body.replies).toEqual([expect.objectContaining({ authorType: "customer" })]);

    // A ticket belonging to a different customer must not be reachable, even by a valid portal token.
    const foreignTicket = await http().post("/api/v1/support/tickets").set(as()).send({ customerId: otherCustomerId, subject: "Not yours" }).expect(201);
    await http().get(`/api/v1/portal/tickets/${foreignTicket.body.id}`).set({ Authorization: `Bearer ${portalToken}` }).expect(404);
  });

  it("lets the customer reopen and rate a resolved ticket", async () => {
    const reopened = await http().post(`/api/v1/portal/tickets/${ticketId}/reopen`).set({ Authorization: `Bearer ${portalToken}` }).expect(200);
    expect(reopened.body).toMatchObject({ status: "open", reopenedCount: 1 });

    await http().post(`/api/v1/support/tickets/${ticketId}/status`).set(as()).send({ status: "resolved" }).expect(200);
    const rated = await http().post(`/api/v1/portal/tickets/${ticketId}/rate`).set({ Authorization: `Bearer ${portalToken}` }).send({ rating: 5, comment: "Fast fix" }).expect(200);
    expect(rated.body).toMatchObject({ satisfactionRating: 5, satisfactionComment: "Fast fix" });
  });

  it("keeps a portal token out of staff routes and a staff token out of portal routes", async () => {
    await http().get("/api/v1/support/tickets").set({ Authorization: `Bearer ${portalToken}`, "x-company-id": t.companyId }).expect(401);
    await http().get("/api/v1/portal/tickets").set({ Authorization: `Bearer ${t.token("admin")}` }).expect(401);
    await http().get("/api/v1/portal/tickets").expect(401);
  });
});
