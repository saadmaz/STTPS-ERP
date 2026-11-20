import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Quality", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["quality.inspection.view"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  let productId: string;
  let planId: string;
  let itemId: string;
  let inspectionId: string;
  let ncrId: string;

  it("creates an inspection plan with required checklist items", async () => {
    const product = await http().post("/api/v1/products/items").set(as()).send({ name: "Steel Bracket" }).expect(201);
    productId = product.body.id;

    const plan = await http().post("/api/v1/quality/inspection-plans").set(as()).send({
      code: "IQC-01", name: "Incoming bracket check", stage: "incoming", productId, sampleSize: 5,
      items: [{ seq: 1, question: "Dimensions within tolerance?" }, { seq: 2, question: "Surface finish OK?", isRequired: false }],
    }).expect(201);
    planId = plan.body.id;
    itemId = plan.body.items[0].itemId;
    expect(plan.body.items).toHaveLength(2);
    expect(plan.body.items[0]).toMatchObject({ type: "pass_fail", isRequired: true });
    expect(plan.body.items[1]).toMatchObject({ isRequired: false });
  });

  it("keeps inspection actions behind the edit permission", async () => {
    const inspection = await http().post("/api/v1/quality/inspections").set(as()).send({ planId }).expect(201);
    await http().post(`/api/v1/quality/inspections/${inspection.body.id}/complete`).set(as("viewer")).send({}).expect(403);
  });

  it("creates an inspection from the plan, inheriting its stage and product", async () => {
    const inspection = await http().post("/api/v1/quality/inspections").set(as()).send({ planId, qtyInspected: 20 }).expect(201);
    inspectionId = inspection.body.id;
    expect(inspection.body).toMatchObject({ number: expect.stringMatching(/^QI-\d{4}-\d{6}$/), stage: "incoming", productId, status: "planned", qtySampled: 5 });
  });

  it("fails overall when a required item fails, even if an optional one also fails", async () => {
    const completed = await http().post(`/api/v1/quality/inspections/${inspectionId}/complete`).set(as()).send({
      responses: [{ itemId, result: "fail" }],
      findings: "Out of tolerance on two units",
    }).expect(200);
    expect(completed.body).toMatchObject({ status: "completed", overallResult: "fail", conductedBy: expect.any(String) });
    expect(completed.body.conductedAt).toBeTruthy();

    await http().post(`/api/v1/quality/inspections/${inspectionId}/complete`).set(as()).send({}).expect(400); // already completed
  });

  it("passes overall when every required item passes", async () => {
    const inspection = await http().post("/api/v1/quality/inspections").set(as()).send({ planId }).expect(201);
    const completed = await http().post(`/api/v1/quality/inspections/${inspection.body.id}/complete`).set(as()).send({
      responses: [{ itemId, result: "pass" }],
    }).expect(200);
    expect(completed.body.overallResult).toBe("pass");
  });

  it("raises a non-conformance from the failed inspection, adds corrective and preventive actions, and closes it", async () => {
    const ncr = await http().post("/api/v1/quality/non-conformances").set(as()).send({
      title: "Bracket dimension failures", description: "Two units out of tolerance on IQC-01", severity: "major", inspectionId, productId,
    }).expect(201);
    ncrId = ncr.body.id;
    expect(ncr.body).toMatchObject({ number: expect.stringMatching(/^NCR-\d{4}-\d{6}$/), status: "open", raisedBy: expect.any(String) });

    const withAction = await http().post(`/api/v1/quality/non-conformances/${ncrId}/actions`).set(as()).send({
      type: "corrective", description: "Re-machine the batch", assignedTo: "user-1",
    }).expect(200);
    expect(withAction.body.status).toBe("in_progress");
    const actionId = withAction.body.actions[0].actionId;

    const actionDone = await http().post(`/api/v1/quality/non-conformances/${ncrId}/actions/${actionId}/complete`).set(as()).expect(200);
    expect(actionDone.body.actions[0]).toMatchObject({ status: "done" });
    expect(actionDone.body.actions[0].completedAt).toBeTruthy();

    const closed = await http().post(`/api/v1/quality/non-conformances/${ncrId}/close`).set(as()).send({ resolution: "Batch re-machined and re-inspected" }).expect(200);
    expect(closed.body).toMatchObject({ status: "closed", resolution: "Batch re-machined and re-inspected" });
    expect(closed.body.closedAt).toBeTruthy();

    await http().post(`/api/v1/quality/non-conformances/${ncrId}/close`).set(as()).send({}).expect(400); // already closed
  });

  it("cancels a planned inspection", async () => {
    const inspection = await http().post("/api/v1/quality/inspections").set(as()).send({ planId }).expect(201);
    const cancelled = await http().post(`/api/v1/quality/inspections/${inspection.body.id}/cancel`).set(as()).expect(200);
    expect(cancelled.body.status).toBe("cancelled");
  });

  it("refuses an inspection against an inactive plan", async () => {
    await http().patch(`/api/v1/quality/inspection-plans/${planId}`).set(as()).send({ isActive: false }).expect(200);
    await http().post("/api/v1/quality/inspections").set(as()).send({ planId }).expect(400);
  });
});
