import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Logistics and fleet", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  let warehouseId: string;
  let productId: string;
  let customerId: string;
  let vehicleId: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["logistics.route.view"]);
    warehouseId = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "WH1", name: "Main" }).expect(201)).body.id;
    productId = (await http().post("/api/v1/products/items").set(as()).send({ name: "Gas cylinder" }).expect(201)).body.id;
    const adj = await http().post("/api/v1/inventory/adjustments").set(as()).send({ warehouseId, reason: "opening_balance", lines: [{ productId, qty: "20", unitCost: "1000" }] }).expect(201);
    await http().post(`/api/v1/inventory/adjustments/${adj.body.id}/submit`).set(as()).expect(200);
    await http().put("/api/v1/sales/settings").set(as()).send({ defaultWarehouseId: warehouseId }).expect(200);
    customerId = (await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Gas Depot", creditLimit: "5000000" }).expect(201)).body.id;

    vehicleId = (await http().post("/api/v1/logistics/vehicles").set(as()).send({ code: "V1", name: "Delivery van", type: "van", registrationNo: "CAB-1234" }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("logs fuel and keeps the vehicle's odometer current", async () => {
    const log = await http().post("/api/v1/logistics/fuel-logs").set(as()).send({ vehicleId, date: "2026-01-05", odometerKm: 15000, litres: "40", cost: "12000" }).expect(201);
    expect(log.body).toMatchObject({ litres: 40_000, cost: 1_200_000 });
    expect((await http().get(`/api/v1/logistics/vehicles/${vehicleId}`).set(as()).expect(200)).body.odometerKm).toBe(15000);

    await http().post("/api/v1/logistics/fuel-logs").set(as()).send({ vehicleId, date: "2026-01-10", odometerKm: 14000, litres: "35", cost: "10500" }).expect(201);
    expect((await http().get(`/api/v1/logistics/vehicles/${vehicleId}`).set(as()).expect(200)).body.odometerKm).toBe(15000); // a lower reading never moves it backwards
  });

  let routeId: string;
  let stopId: string;
  let deliveryId: string;

  it("builds a route over an existing sales delivery, dispatches it and confirms proof of delivery", async () => {
    const order = await http().post("/api/v1/sales/orders").set(as()).send({ accountId: customerId, warehouseId, lines: [{ productId, qty: "5" }] }).expect(201);
    await http().post(`/api/v1/sales/orders/${order.body.id}/confirm`).set(as()).expect(200);
    const delivery = await http().post("/api/v1/sales/deliveries").set(as()).send({ orderId: order.body.id }).expect(201);
    deliveryId = delivery.body.id;
    await http().post(`/api/v1/sales/deliveries/${deliveryId}/pick`).set(as()).expect(200);
    await http().post(`/api/v1/sales/deliveries/${deliveryId}/pack`).set(as()).expect(200);

    const route = await http().post("/api/v1/logistics/routes").set(as()).send({ vehicleId, date: "2026-01-06", stops: [{ deliveryId }] }).expect(201);
    routeId = route.body.id;
    stopId = route.body.stops[0].stopId;
    expect(route.body).toMatchObject({ number: expect.stringMatching(/^RT-\d{4}-\d{6}$/), status: "planned" });
    expect(route.body.stops[0]).toMatchObject({ deliveryId, sequence: 1, status: "pending" });

    await http().post(`/api/v1/logistics/routes/${routeId}/dispatch`).set(as("viewer")).expect(403);
    const dispatched = await http().post(`/api/v1/logistics/routes/${routeId}/dispatch`).set(as()).expect(200);
    expect(dispatched.body.status).toBe("dispatched");
    expect((await http().get(`/api/v1/sales/deliveries/${deliveryId}`).set(as()).expect(200)).body.status).toBe("dispatched");

    const arrived = await http().post(`/api/v1/logistics/routes/${routeId}/stops/arrive`).set(as()).send({ stopId }).expect(200);
    expect(arrived.body.stops[0].status).toBe("arrived");
    expect(arrived.body.status).toBe("in_progress");

    const completed = await http().post(`/api/v1/logistics/routes/${routeId}/stops/complete`).set(as()).send({ stopId, receivedBy: "A. Silva" }).expect(200);
    expect(completed.body.stops[0]).toMatchObject({ status: "delivered" });
    expect(completed.body.status).toBe("completed"); // every stop settled
    expect((await http().get(`/api/v1/sales/deliveries/${deliveryId}`).set(as()).expect(200)).body).toMatchObject({ status: "delivered", receivedBy: "A. Silva" });

    await http().post(`/api/v1/logistics/routes/${routeId}/stops/complete`).set(as()).send({ stopId, receivedBy: "x" }).expect(400); // already delivered
  });

  it("fails a stop when the delivery cannot be completed", async () => {
    const order = await http().post("/api/v1/sales/orders").set(as()).send({ accountId: customerId, warehouseId, lines: [{ productId, qty: "2" }] }).expect(201);
    await http().post(`/api/v1/sales/orders/${order.body.id}/confirm`).set(as()).expect(200);
    const delivery = await http().post("/api/v1/sales/deliveries").set(as()).send({ orderId: order.body.id }).expect(201);
    await http().post(`/api/v1/sales/deliveries/${delivery.body.id}/pick`).set(as()).expect(200);
    await http().post(`/api/v1/sales/deliveries/${delivery.body.id}/pack`).set(as()).expect(200);

    const route = await http().post("/api/v1/logistics/routes").set(as()).send({ vehicleId, date: "2026-01-07", stops: [{ deliveryId: delivery.body.id }] }).expect(201);
    await http().post(`/api/v1/logistics/routes/${route.body.id}/dispatch`).set(as()).expect(200);
    const failed = await http().post(`/api/v1/logistics/routes/${route.body.id}/stops/fail`).set(as()).send({ stopId: route.body.stops[0].stopId, reason: "Customer not present" }).expect(200);
    expect(failed.body.stops[0]).toMatchObject({ status: "failed", failureReason: "Customer not present" });
    expect(failed.body.status).toBe("completed");
    expect((await http().get(`/api/v1/sales/deliveries/${delivery.body.id}`).set(as()).expect(200)).body).toMatchObject({ status: "failed", exception: "Customer not present" });
  });

  it("cancels a route that has not been dispatched yet, and refuses to cancel once it has", async () => {
    const order = await http().post("/api/v1/sales/orders").set(as()).send({ accountId: customerId, warehouseId, lines: [{ productId, qty: "1" }] }).expect(201);
    await http().post(`/api/v1/sales/orders/${order.body.id}/confirm`).set(as()).expect(200);
    const delivery = await http().post("/api/v1/sales/deliveries").set(as()).send({ orderId: order.body.id }).expect(201);
    await http().post(`/api/v1/sales/deliveries/${delivery.body.id}/pick`).set(as()).expect(200);
    await http().post(`/api/v1/sales/deliveries/${delivery.body.id}/pack`).set(as()).expect(200);

    const route = await http().post("/api/v1/logistics/routes").set(as()).send({ vehicleId, date: "2026-01-08", stops: [{ deliveryId: delivery.body.id }] }).expect(201);
    const cancelled = await http().post(`/api/v1/logistics/routes/${route.body.id}/cancel`).set(as()).expect(200);
    expect(cancelled.body.status).toBe("cancelled");

    const another = await http().post("/api/v1/logistics/routes").set(as()).send({ vehicleId, date: "2026-01-09", stops: [{ deliveryId: delivery.body.id }] }).expect(201);
    await http().post(`/api/v1/logistics/routes/${another.body.id}/dispatch`).set(as()).expect(200);
    await http().post(`/api/v1/logistics/routes/${another.body.id}/cancel`).set(as()).expect(400);
  });
});
