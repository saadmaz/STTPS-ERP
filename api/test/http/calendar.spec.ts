import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Calendar", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  const viewerId = () => `${t.tenantId}_viewer`;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
  });
  afterAll(async () => {
    await app?.close();
  });

  let eventId: string;

  it("creates a daily recurring event and expands its occurrences in a date range", async () => {
    const event = await http().post("/api/v1/calendar/events").set(as()).send({
      title: "Standup", startAt: "2026-12-01T09:00:00.000Z", endAt: "2026-12-01T09:15:00.000Z",
      attendeeIds: [viewerId()], recurrence: { frequency: "daily", interval: 1, until: "2026-12-05" },
    }).expect(201);
    eventId = event.body.id;
    expect(event.body.attendees).toEqual([{ userId: viewerId(), status: "invited" }]);

    const mine = await http().get("/api/v1/calendar/mine?from=2026-12-01&to=2026-12-31").set(as()).expect(200);
    const standups = mine.body.filter((i: { title: string }) => i.title === "Standup");
    // Dec 1 through Dec 5 inclusive, daily = 5 occurrences; the rule stops after `until`.
    expect(standups).toHaveLength(5);
    expect(standups[0].start).toBe("2026-12-01T09:00:00.000Z");
    expect(standups[4].start).toBe("2026-12-05T09:00:00.000Z");
  });

  it("shows the event to an invited attendee, who can RSVP", async () => {
    const mine = await http().get("/api/v1/calendar/mine?from=2026-12-01&to=2026-12-31").set(as("viewer")).expect(200);
    expect(mine.body.filter((i: { title: string }) => i.title === "Standup")).toHaveLength(5);

    const rsvped = await http().post(`/api/v1/calendar/events/${eventId}/rsvp`).set(as("viewer")).send({ status: "accepted" }).expect(200);
    expect(rsvped.body.attendees[0]).toMatchObject({ userId: viewerId(), status: "accepted" });

    await http().post(`/api/v1/calendar/events/${eventId}/rsvp`).set(as("outsider")).send({ status: "accepted" }).expect(403);
  });

  it("picks up a task's due date on my calendar", async () => {
    const task = await http().post("/api/v1/tasks").set(as()).send({ title: "Ship the release", dueDate: "2026-12-03" }).expect(201);
    const mine = await http().get("/api/v1/calendar/mine?from=2026-12-01&to=2026-12-31").set(as()).expect(200);
    const item = mine.body.find((i: { type: string; id: string }) => i.type === "task" && i.id === task.body.id);
    expect(item).toMatchObject({ title: "Ship the release", start: "2026-12-03" });
  });

  it("cancels the event, which then disappears from the calendar, and keeps that behind a permission", async () => {
    await http().post(`/api/v1/calendar/events/${eventId}/cancel`).set(as("viewer")).expect(403);
    const cancelled = await http().post(`/api/v1/calendar/events/${eventId}/cancel`).set(as()).expect(200);
    expect(cancelled.body.status).toBe("cancelled");

    const mine = await http().get("/api/v1/calendar/mine?from=2026-12-01&to=2026-12-31").set(as()).expect(200);
    expect(mine.body.filter((i: { title: string }) => i.title === "Standup")).toHaveLength(0);
  });

  it("shows the shared company calendar, gating shift and leave sections behind their own view permissions", async () => {
    await http().post("/api/v1/calendar/events").set(as()).send({ title: "All-hands", startAt: "2026-12-10T10:00:00.000Z", endAt: "2026-12-10T11:00:00.000Z" }).expect(201);

    const asAdmin = await http().get("/api/v1/calendar?from=2026-12-01&to=2026-12-31").set(as()).expect(200);
    expect(asAdmin.body.some((i: { title: string }) => i.title === "All-hands")).toBe(true);

    // The viewer has no hr permissions, but the company calendar is still reachable and simply omits those sections.
    const asViewer = await http().get("/api/v1/calendar?from=2026-12-01&to=2026-12-31").set(as("viewer")).expect(200);
    expect(asViewer.body.some((i: { title: string }) => i.title === "All-hands")).toBe(true);
    expect(asViewer.body.some((i: { type: string }) => i.type === "shift" || i.type === "leave")).toBe(false);
  });
});
