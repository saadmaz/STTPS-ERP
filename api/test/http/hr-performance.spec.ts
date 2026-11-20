import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("HR: performance", () => {
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

  let cycleId: string;
  let employeeId: string;

  it("creates a cycle and links the viewer to an employee", async () => {
    const cycle = await http().post("/api/v1/hr/performance-cycles").set(as()).send({ code: "2026-H2", name: "2026 H2 review", startDate: "2026-07-01", endDate: "2026-12-31", status: "active" }).expect(201);
    cycleId = cycle.body.id;

    const employee = await http().post("/api/v1/hr/employees").set(as()).send({ userId: `${t.tenantId}_viewer`, firstName: "Ishara", lastName: "Wickrama", joiningDate: "2026-01-05" }).expect(201);
    employeeId = employee.body.id;
  });

  it("sets a goal for myself and updates its progress", async () => {
    const goal = await http().post("/api/v1/hr/performance/me/goals").set(as("viewer")).send({ cycleId, title: "Ship the leave module", type: "okr", weight: 40 }).expect(201);
    expect(goal.body).toMatchObject({ employeeId, status: "not_started" });

    const updated = await http().post(`/api/v1/hr/performance/me/goals/${goal.body.id}/progress`).set(as("viewer")).send({ status: "in_progress", currentValue: "70%" }).expect(200);
    expect(updated.body).toMatchObject({ status: "in_progress", currentValue: "70%" });

    const mine = await http().get("/api/v1/hr/performance/me/goals").set(as("viewer")).expect(200);
    expect(mine.body.items).toHaveLength(1);

    // Someone else's goal cannot be updated through the self-service route.
    const other = await http().post("/api/v1/hr/employees").set(as()).send({ firstName: "Saman", lastName: "Kumara", joiningDate: "2026-01-05" }).expect(201);
    const othersGoal = await http().post("/api/v1/hr/goals").set(as()).send({ employeeId: other.body.id, cycleId, title: "Mentor new hires" }).expect(201);
    await http().post(`/api/v1/hr/performance/me/goals/${othersGoal.body.id}/progress`).set(as("viewer")).send({ status: "completed" }).expect(403);
  });

  it("submits a self-review, a manager review, and shows only submitted reviews about me", async () => {
    const self1 = await http().post("/api/v1/hr/performance/me/reviews/self").set(as("viewer")).send({ cycleId, rating: 4, strengths: "Delivery" }).expect(200);
    expect(self1.body).toMatchObject({ type: "self", status: "submitted", rating: 4 });
    // Resubmitting updates the same self-review rather than creating a second one.
    await http().post("/api/v1/hr/performance/me/reviews/self").set(as("viewer")).send({ cycleId, rating: 5 }).expect(400);

    const managerReview = await http().post("/api/v1/hr/reviews").set(as()).send({ employeeId, cycleId, type: "manager", rating: 5, recommendsPromotion: true, promotionNote: "Ready for senior" }).expect(201);
    expect(managerReview.body.status).toBe("draft");

    // A draft isn't visible to the employee until it's submitted.
    const beforeSubmit = await http().get("/api/v1/hr/performance/me/reviews").set(as("viewer")).expect(200);
    expect(beforeSubmit.body).toHaveLength(1); // just the self-review so far

    await http().post(`/api/v1/hr/reviews/${managerReview.body.id}/submit`).set(as()).expect(200);
    await http().post(`/api/v1/hr/reviews/${managerReview.body.id}/submit`).set(as()).expect(400);

    const afterSubmit = await http().get("/api/v1/hr/performance/me/reviews").set(as("viewer")).expect(200);
    expect(afterSubmit.body).toHaveLength(2);
    expect(afterSubmit.body.find((r: { type: string }) => r.type === "manager")).toMatchObject({ recommendsPromotion: true });
  });

  it("refuses goals and reviews on a closed cycle, and shows my own development plan", async () => {
    await http().patch(`/api/v1/hr/performance-cycles/${cycleId}`).set(as()).send({ status: "closed" }).expect(200);
    await http().post("/api/v1/hr/performance/me/goals").set(as("viewer")).send({ cycleId, title: "Too late" }).expect(400);
    await http().post("/api/v1/hr/reviews").set(as()).send({ employeeId, cycleId, type: "peer" }).expect(400);

    await http().post("/api/v1/hr/development-plans").set(as()).send({ employeeId, title: "Lead a module end to end", focusAreas: "Technical leadership" }).expect(201);
    const mine = await http().get("/api/v1/hr/performance/me/development-plan").set(as("viewer")).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ title: "Lead a module end to end", status: "active" });
  });
});
