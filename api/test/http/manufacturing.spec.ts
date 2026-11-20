import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Manufacturing", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["manufacturing.productionOrder.view"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  let finishedGoodId: string;
  let componentId: string;
  let workCentreId: string;
  let bomId: string;
  let routingId: string;
  let orderId: string;

  it("sets up a product, a work centre, an active BOM and an active routing", async () => {
    const finished = await http().post("/api/v1/products/items").set(as()).send({ name: "Assembled Widget" }).expect(201);
    finishedGoodId = finished.body.id;
    const component = await http().post("/api/v1/products/items").set(as()).send({ name: "Widget part" }).expect(201);
    componentId = component.body.id;

    const wc = await http().post("/api/v1/manufacturing/work-centres").set(as()).send({ code: "WC1", name: "Assembly line" }).expect(201);
    workCentreId = wc.body.id;

    const empty = await http().post("/api/v1/manufacturing/boms").set(as()).send({ productId: finishedGoodId, effectiveFrom: "2026-01-01" }).expect(201);
    expect(empty.body.lines).toEqual([]);
    await http().post(`/api/v1/manufacturing/boms/${empty.body.id}/activate`).set(as()).expect(400); // no lines yet

    const bom = await http().post("/api/v1/manufacturing/boms").set(as()).send({
      productId: finishedGoodId, effectiveFrom: "2026-01-01",
      lines: [{ componentProductId: componentId, qty: 2, scrapPct: 10 }],
    }).expect(201);
    bomId = bom.body.id;
    expect(bom.body.revision).toBe(2); // the empty one above took revision 1
    await http().post(`/api/v1/manufacturing/boms/${bomId}/activate`).set(as()).expect(200);

    const routing = await http().post("/api/v1/manufacturing/routings").set(as()).send({
      productId: finishedGoodId, operations: [{ seq: 1, name: "Assemble", workCentreId, runMinutesPerUnit: 5 }],
    }).expect(201);
    routingId = routing.body.id;
    await http().post(`/api/v1/manufacturing/routings/${routingId}/activate`).set(as()).expect(200);
  });

  it("creates a production order that resolves the active BOM and routing and computes required materials with scrap", async () => {
    const order = await http().post("/api/v1/manufacturing/production-orders").set(as()).send({ productId: finishedGoodId, qtyPlanned: 10 }).expect(201);
    orderId = order.body.id;
    expect(order.body.number).toMatch(/^PO-MFG-/);
    expect(order.body.status).toBe("planned");
    expect(order.body.bomId).toBe(bomId);
    expect(order.body.routingId).toBe(routingId);
    expect(order.body.materials).toEqual([{ componentProductId: componentId, qtyRequired: 22000, qtyIssued: 0 }]);
    expect(order.body.operations).toEqual([
      { seq: 1, name: "Assemble", workCentreId, machineId: null, status: "pending", actualMinutes: 0, downtimeMinutes: 0 },
    ]);
  });

  it("keeps production actions behind the edit permission", async () => {
    await http().post(`/api/v1/manufacturing/production-orders/${orderId}/release`).set(as("viewer")).expect(403);
  });

  it("releases, starts, tracks partial output, downtime and an operation, then completes on full output", async () => {
    const released = await http().post(`/api/v1/manufacturing/production-orders/${orderId}/release`).set(as()).expect(200);
    expect(released.body.status).toBe("released");

    const started = await http().post(`/api/v1/manufacturing/production-orders/${orderId}/start`).set(as()).expect(200);
    expect(started.body.status).toBe("in_progress");
    expect(started.body.actualStart).toBeTruthy();

    const partial = await http().post(`/api/v1/manufacturing/production-orders/${orderId}/output`).set(as()).send({ qtyGood: 6 }).expect(200);
    expect(partial.body.status).toBe("in_progress");
    expect(partial.body.qtyProduced).toBe(6000);
    expect(partial.body.materials[0].qtyIssued).toBe(13200); // 60% of the 22-unit requirement

    await http().post(`/api/v1/manufacturing/production-orders/${orderId}/downtime`).set(as()).send({ seq: 1, minutes: 15 }).expect(200);
    const opDone = await http().post(`/api/v1/manufacturing/production-orders/${orderId}/operations/complete`).set(as()).send({ seq: 1, actualMinutes: 55 }).expect(200);
    expect(opDone.body.operations[0]).toMatchObject({ status: "completed", actualMinutes: 55, downtimeMinutes: 15 });

    const done = await http().post(`/api/v1/manufacturing/production-orders/${orderId}/output`).set(as()).send({ qtyGood: 4 }).expect(200);
    expect(done.body).toMatchObject({ status: "completed", qtyProduced: 10000, qtyScrapped: 0 });
    expect(done.body.actualEnd).toBeTruthy();
    expect(done.body.materials[0].qtyIssued).toBe(22000); // fully issued

    await http().post(`/api/v1/manufacturing/production-orders/${orderId}/output`).set(as()).send({ qtyGood: 1 }).expect(400);
    await http().post(`/api/v1/manufacturing/production-orders/${orderId}/cancel`).set(as()).expect(400);
  });

  it("cancels a planned order", async () => {
    const order = await http().post("/api/v1/manufacturing/production-orders").set(as()).send({ productId: finishedGoodId, qtyPlanned: 5 }).expect(201);
    const cancelled = await http().post(`/api/v1/manufacturing/production-orders/${order.body.id}/cancel`).set(as()).expect(200);
    expect(cancelled.body.status).toBe("cancelled");
  });

  it("refuses a production order when there is no active BOM for the product", async () => {
    const other = await http().post("/api/v1/products/items").set(as()).send({ name: "No BOM yet" }).expect(201);
    await http().post("/api/v1/manufacturing/production-orders").set(as()).send({ productId: other.body.id, qtyPlanned: 1 }).expect(400);
  });
});
