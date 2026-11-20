import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Manufacturing: MRP", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["manufacturing.mrpRun.view"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  let finishedGoodId: string;
  let componentId: string;
  let bomId: string;
  let orderId: string;
  let runId: string;

  it("sets up a manufactured product with an active BOM, and confirms a sales order creating open demand", async () => {
    finishedGoodId = (await http().post("/api/v1/products/items").set(as()).send({ name: "Assembled Widget", type: "manufactured" }).expect(201)).body.id;
    componentId = (await http().post("/api/v1/products/items").set(as()).send({ name: "Widget part" }).expect(201)).body.id;

    const bom = await http().post("/api/v1/manufacturing/boms").set(as()).send({
      productId: finishedGoodId, effectiveFrom: "2026-01-01", lines: [{ componentProductId: componentId, qty: 2 }],
    }).expect(201);
    bomId = bom.body.id;
    await http().post(`/api/v1/manufacturing/boms/${bomId}/activate`).set(as()).expect(200);

    const warehouseId = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "WH1", name: "Main" }).expect(201)).body.id;
    await http().put("/api/v1/sales/settings").set(as()).send({ defaultWarehouseId: warehouseId }).expect(200);
    const customerId = (await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Acme Co", creditLimit: "5000000" }).expect(201)).body.id;

    const order = await http().post("/api/v1/sales/orders").set(as()).send({ accountId: customerId, warehouseId, lines: [{ productId: finishedGoodId, qty: "10" }] }).expect(201);
    orderId = order.body.id;
    const confirmed = await http().post(`/api/v1/sales/orders/${orderId}/confirm`).set(as()).expect(200);
    expect(confirmed.body.status).toBe("confirmed");
    expect(confirmed.body.lines[0].reserved).toBe(0); // no stock yet, fully backordered
  });

  it("runs MRP, nets demand against zero stock and plans production and a component purchase", async () => {
    const run = await http().post("/api/v1/manufacturing/mrp-runs").set(as()).send({}).expect(201);
    runId = run.body.id;
    expect(run.body.demand).toEqual([{ productId: finishedGoodId, source: "salesOrder", sourceId: orderId, dueDate: expect.any(String), qty: 10000 }]);
    expect(run.body.plannedProduction).toMatchObject([{ productId: finishedGoodId, qty: 10000, bomId, status: "suggested" }]);
    expect(run.body.plannedPurchases).toMatchObject([{ productId: componentId, qty: 20000, status: "suggested" }]); // 10 units * 2 per unit, no scrap
  });

  it("keeps convert and dismiss behind the edit permission", async () => {
    const run = await http().get(`/api/v1/manufacturing/mrp-runs/${runId}`).set(as()).expect(200);
    const lineId = run.body.plannedProduction[0].lineId;
    await http().post(`/api/v1/manufacturing/mrp-runs/${runId}/production/${lineId}/convert`).set(as("viewer")).expect(403);
  });

  it("converts the planned production line into a real production order", async () => {
    const run = await http().get(`/api/v1/manufacturing/mrp-runs/${runId}`).set(as()).expect(200);
    const lineId = run.body.plannedProduction[0].lineId;
    const converted = await http().post(`/api/v1/manufacturing/mrp-runs/${runId}/production/${lineId}/convert`).set(as()).expect(200);
    expect(converted.body.plannedProduction[0].status).toBe("converted");
    const productionOrderId = converted.body.plannedProduction[0].productionOrderId;
    const po = await http().get(`/api/v1/manufacturing/production-orders/${productionOrderId}`).set(as()).expect(200);
    expect(po.body).toMatchObject({ productId: finishedGoodId, bomId, qtyPlanned: 10000, status: "planned" });

    await http().post(`/api/v1/manufacturing/mrp-runs/${runId}/production/${lineId}/convert`).set(as()).expect(400); // already converted
  });

  it("converts the planned purchase line into a purchase requisition", async () => {
    const run = await http().get(`/api/v1/manufacturing/mrp-runs/${runId}`).set(as()).expect(200);
    const lineId = run.body.plannedPurchases[0].lineId;
    const converted = await http().post(`/api/v1/manufacturing/mrp-runs/${runId}/purchases/${lineId}/convert`).set(as()).expect(200);
    expect(converted.body.plannedPurchases[0].status).toBe("converted");
    const requisitionId = converted.body.plannedPurchases[0].requisitionId;
    const req = await http().get(`/api/v1/procurement/requisitions/${requisitionId}`).set(as()).expect(200);
    expect(req.body.lines[0]).toMatchObject({ productId: componentId, qty: 20000 });
  });

  it("feeds demand forecasts into MRP alongside sales orders, and lets a suggested line be dismissed", async () => {
    const period = new Date().toISOString().slice(0, 7);
    const forecast = await http().post("/api/v1/manufacturing/demand-forecasts").set(as()).send({ productId: componentId, period, qty: 5 }).expect(201);
    expect(forecast.body.qty).toBe(5000);

    // The production order created above already fully covers the finished good's demand, so this run plans
    // nothing further for it; the only new shortage is the forecast demand for the (unBOM'd) component.
    const run = await http().post("/api/v1/manufacturing/mrp-runs").set(as()).send({}).expect(201);
    expect(run.body.plannedProduction).toEqual([]);
    const purchaseLine = run.body.plannedPurchases.find((p: { productId: string }) => p.productId === componentId);
    expect(purchaseLine).toMatchObject({ qty: 5000, status: "suggested" });

    const dismissed = await http().post(`/api/v1/manufacturing/mrp-runs/${run.body.id}/purchases/${purchaseLine.lineId}/dismiss`).set(as()).expect(200);
    expect(dismissed.body.plannedPurchases.find((p: { lineId: string }) => p.lineId === purchaseLine.lineId).status).toBe("dismissed");
    await http().post(`/api/v1/manufacturing/mrp-runs/${run.body.id}/purchases/${purchaseLine.lineId}/convert`).set(as()).expect(400);
  });
});
