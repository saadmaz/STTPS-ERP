import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Tasks and My Work", () => {
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

  let taskId: string;
  const viewerId = () => `${t.tenantId}_viewer`;

  it("creates a task for the viewer, who sees it under my own and updates its status", async () => {
    const task = await http().post("/api/v1/tasks").set(as()).send({ title: "Draft the proposal", assigneeId: viewerId(), priority: "high", dueDate: "2026-12-01" }).expect(201);
    taskId = task.body.id;
    expect(task.body).toMatchObject({ status: "todo", priority: "high" });

    const mine = await http().get("/api/v1/tasks/mine").set(as("viewer")).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].id).toBe(taskId);

    const updated = await http().post(`/api/v1/tasks/${taskId}/status`).set(as("viewer")).send({ status: "in_progress" }).expect(200);
    expect(updated.body.status).toBe("in_progress");

    await http().post(`/api/v1/tasks/${taskId}/status`).set(as("outsider")).send({ status: "blocked" }).expect(403);
  });

  it("tracks a checklist and completes the task", async () => {
    const withItem = await http().post(`/api/v1/tasks/${taskId}/checklist`).set(as("viewer")).send({ text: "Get sign-off from finance" }).expect(201);
    expect(withItem.body.checklist).toHaveLength(1);
    const itemId = withItem.body.checklist[0].itemId;

    const checked = await http().patch(`/api/v1/tasks/${taskId}/checklist/${itemId}`).set(as("viewer")).send({ done: true }).expect(200);
    expect(checked.body.checklist[0]).toMatchObject({ done: true });

    const done = await http().post(`/api/v1/tasks/${taskId}/status`).set(as("viewer")).send({ status: "completed" }).expect(200);
    expect(done.body.completedAt).not.toBeNull();
  });

  it("creates the next occurrence of a recurring task once it's completed", async () => {
    const task = await http().post("/api/v1/tasks").set(as()).send({ title: "Weekly report", dueDate: "2026-12-05", recurrence: { frequency: "weekly", interval: 1 } }).expect(201);
    await http().post(`/api/v1/tasks/${task.body.id}/status`).set(as()).send({ status: "completed" }).expect(200);

    const all = await http().get("/api/v1/tasks").set(as()).expect(200);
    const next = all.body.items.find((x: { title: string; dueDate: string }) => x.title === "Weekly report" && x.dueDate === "2026-12-12");
    expect(next).toMatchObject({ status: "todo" });

    await http().get("/api/v1/tasks").set(as("viewer")).expect(403);
  });

  it("logs time against a task, keeping its actual hours in sync, and lets a manager approve it", async () => {
    const logged = await http().post("/api/v1/tasks/time-entries").set(as("viewer")).send({ date: "2026-12-01", taskId, hours: "2.5", cost: "5000.00" }).expect(201);
    expect(logged.body).toMatchObject({ userId: viewerId(), hours: 2500, approved: false });

    const task = await http().get(`/api/v1/tasks/${taskId}`).set(as()).expect(200);
    expect(task.body.actualHours).toBe(2500);

    const approved = await http().post(`/api/v1/tasks/time-entries/${logged.body.id}/approve`).set(as()).send({ approve: true }).expect(200);
    expect(approved.body.approved).toBe(true);
    await http().post(`/api/v1/tasks/time-entries/${logged.body.id}/approve`).set(as("viewer")).send({ approve: true }).expect(403);

    await http().patch(`/api/v1/tasks/time-entries/${logged.body.id}`).set(as("viewer")).send({ date: "2026-12-02", hours: "3" }).expect(400);
  });
});
