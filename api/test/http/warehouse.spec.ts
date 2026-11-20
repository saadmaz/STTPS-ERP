import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";

describe("Warehouse", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  const drain = () => app.get(JobQueueService).drain();

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["warehouse.task.view"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  let warehouseId: string;
  let productId: string;
  let locationId: string;

  it("creates a manual task and runs it through assign, start and complete", async () => {
    warehouseId = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "WH1", name: "Main" }).expect(201)).body.id;
    locationId = (await http().post("/api/v1/inventory/locations").set(as()).send({ warehouseId, code: "A-01-01", zone: "A" }).expect(201)).body.id;
    productId = (await http().post("/api/v1/products/items").set(as()).send({ name: "Pallet of tiles" }).expect(201)).body.id;

    const task = await http().post("/api/v1/warehouse/tasks").set(as()).send({ type: "count", warehouseId, productId, qty: 50 }).expect(201);
    expect(task.body).toMatchObject({ number: expect.stringMatching(/^WT-\d{4}-\d{6}$/), status: "pending", type: "count" });

    await http().post(`/api/v1/warehouse/tasks/${task.body.id}/assign`).set(as("viewer")).send({ assignedTo: "x" }).expect(403);
    const assigned = await http().post(`/api/v1/warehouse/tasks/${task.body.id}/assign`).set(as()).send({ assignedTo: `${t.tenantId}_viewer` }).expect(200);
    expect(assigned.body.assignedTo).toBe(`${t.tenantId}_viewer`);

    const started = await http().post(`/api/v1/warehouse/tasks/${task.body.id}/start`).set(as()).expect(200);
    expect(started.body.status).toBe("in_progress");

    const scanned = await http().post("/api/v1/warehouse/tasks/scan").set(as()).send({ code: task.body.number }).expect(200);
    expect(scanned.body.id).toBe(task.body.id);
    await http().post("/api/v1/warehouse/tasks/scan").set(as()).send({ code: "NOT-A-CODE" }).expect(404);

    const completed = await http().post(`/api/v1/warehouse/tasks/${task.body.id}/complete`).set(as()).send({ locationId }).expect(200);
    expect(completed.body).toMatchObject({ status: "completed", locationId });
    expect(completed.body.completedAt).toBeTruthy();

    await http().post(`/api/v1/warehouse/tasks/${task.body.id}/start`).set(as()).expect(400); // already completed
  });

  it("cancels a pending task", async () => {
    const task = await http().post("/api/v1/warehouse/tasks").set(as()).send({ type: "count", warehouseId, productId, qty: 1 }).expect(201);
    const cancelled = await http().post(`/api/v1/warehouse/tasks/${task.body.id}/cancel`).set(as()).expect(200);
    expect(cancelled.body.status).toBe("cancelled");
  });

  it("creates a put-away task automatically when a purchase order's goods are received and posted", async () => {
    await http().post("/api/v1/warehouse/put-away-rules").set(as()).send({ warehouseId, productId, targetLocationId: locationId }).expect(201);

    const supplier = (await http().post("/api/v1/procurement/suppliers").set(as()).send({ name: "Tile Supplier" }).expect(201)).body.id;
    const order = await http().post("/api/v1/procurement/orders").set(as()).send({ supplierId: supplier, warehouseId, lines: [{ productId, qty: "100", unitPrice: "500" }] }).expect(201);
    await http().post(`/api/v1/procurement/orders/${order.body.id}/submit`).set(as()).expect(200);

    const orderLineId = order.body.lines[0].lineId;
    const receipt = await http().post("/api/v1/procurement/receipts").set(as()).send({ orderId: order.body.id, lines: [{ orderLineId, received: "100" }] }).expect(201);
    await http().post(`/api/v1/procurement/receipts/${receipt.body.id}/post`).set(as()).expect(200);
    await drain();

    const tasks = await http().get("/api/v1/warehouse/tasks").set(as()).query({ where: "type:putaway" }).expect(200);
    const putaway = tasks.body.items.find((x: { productId: string }) => x.productId === productId);
    expect(putaway).toMatchObject({ type: "putaway", warehouseId, productId, qty: 100_000, locationId, status: "pending" });
    expect(putaway.reference).toMatchObject({ entityType: "procurement.goodsReceipt", entityId: receipt.body.id });
  });

  it("creates a pick task automatically when a sales order is confirmed", async () => {
    await http().put("/api/v1/sales/settings").set(as()).send({ defaultWarehouseId: warehouseId }).expect(200);
    const adj = await http().post("/api/v1/inventory/adjustments").set(as()).send({ warehouseId, reason: "opening_balance", lines: [{ productId, qty: "20", unitCost: "400", lotNo: "LOT-1" }] }).expect(201);
    await http().post(`/api/v1/inventory/adjustments/${adj.body.id}/submit`).set(as()).expect(200);

    const customer = (await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Tile Buyer", creditLimit: "5000000" }).expect(201)).body.id;
    const order = await http().post("/api/v1/sales/orders").set(as()).send({ accountId: customer, warehouseId, lines: [{ productId, qty: "5" }] }).expect(201);
    await http().post(`/api/v1/sales/orders/${order.body.id}/confirm`).set(as()).expect(200);
    await drain();

    const tasks = await http().get("/api/v1/warehouse/tasks").set(as()).query({ where: "type:pick" }).expect(200);
    const pick = tasks.body.items.find((x: { productId: string }) => x.productId === productId);
    expect(pick).toMatchObject({ type: "pick", warehouseId, productId, qty: 5_000, status: "pending" });
    expect(pick.reference).toMatchObject({ entityType: "sales.order", entityId: order.body.id });
  });

  it("suggests a FEFO pick allocation across lots and reports a shortfall when stock runs out", async () => {
    const perishable = (await http().post("/api/v1/products/items").set(as()).send({ name: "Fresh produce crate" }).expect(201)).body.id;
    const adjOld = await http().post("/api/v1/inventory/adjustments").set(as()).send({ warehouseId, reason: "opening_balance", lines: [{ productId: perishable, qty: "10", unitCost: "100", lotNo: "OLD", expiryDate: "2026-02-01" }] }).expect(201);
    await http().post(`/api/v1/inventory/adjustments/${adjOld.body.id}/submit`).set(as()).expect(200);
    const adjNew = await http().post("/api/v1/inventory/adjustments").set(as()).send({ warehouseId, reason: "opening_balance", lines: [{ productId: perishable, qty: "10", unitCost: "100", lotNo: "NEW", expiryDate: "2026-06-01" }] }).expect(201);
    await http().post(`/api/v1/inventory/adjustments/${adjNew.body.id}/submit`).set(as()).expect(200);

    const suggestion = await http().post("/api/v1/warehouse/picking/suggest").set(as()).send({ productId: perishable, warehouseId, qty: 15, strategy: "fefo" }).expect(200);
    expect(suggestion.body).toMatchObject({ qtyRequested: 15_000, qtyAllocated: 15_000, shortfall: 0 });
    expect(suggestion.body.lines).toEqual([{ lotNo: "OLD", expiryDate: "2026-02-01", qty: 10_000 }, { lotNo: "NEW", expiryDate: "2026-06-01", qty: 5_000 }]);

    const short = await http().post("/api/v1/warehouse/picking/suggest").set(as()).send({ productId: perishable, warehouseId, qty: 100, strategy: "fefo" }).expect(200);
    expect(short.body).toMatchObject({ qtyAllocated: 20_000, shortfall: 80_000 });
  });
});
