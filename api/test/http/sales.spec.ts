import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { computeLine, totalsOf } from "../../src/sales/sales.services.js";

describe("Sales: lead to cash, up to delivery and returns", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${t.token("admin")}`, "x-company-id": t.companyId });
  let warehouse: string;
  let tile: string;
  let install: string;
  let customer: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    warehouse = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "WH", name: "Main" }).expect(201)).body.id;
    await http().put("/api/v1/sales/settings").set(as()).send({ defaultWarehouseId: warehouse }).expect(200);
    tile = (await http().post("/api/v1/products/items").set(as()).send({ name: "Tile", salesPrice: "1000" }).expect(201)).body.id;
    install = (await http().post("/api/v1/products/items").set(as()).send({ name: "Installation", type: "service", salesPrice: "5000", taxCategory: "ZERO" }).expect(201)).body.id;
    const adj = await http().post("/api/v1/inventory/adjustments").set(as()).send({ warehouseId: warehouse, reason: "opening_balance", lines: [{ productId: tile, qty: "10", unitCost: "400" }] }).expect(201);
    await http().post(`/api/v1/inventory/adjustments/${adj.body.id}/submit`).set(as()).expect(200);
    customer = (await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Silva Builders", creditLimit: "10000" }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  const stock = async () => (await http().get(`/api/v1/inventory/stock/${tile}`).set(as()).expect(200)).body;

  it("computes line discounts and tax exactly", () => {
    const line = computeLine({ lineId: "a", productId: "p", description: "x", qty: 3000, unitPrice: 33333, discountPct: 1000, taxCode: "VAT", taxRate: 1800 });
    expect(line).toMatchObject({ net: 89999, tax: 16200, total: 106199 });
    expect(totalsOf([line])).toEqual({ subtotal: 99999, discount: 10000, tax: 16200, total: 106199 });
  });

  let orderId: string;

  it("quotes, sends a private link the customer accepts, and converts to an order", async () => {
    const q = await http().post("/api/v1/sales/quotes").set(as()).send({ accountId: customer, lines: [{ productId: tile, qty: "12" }, { productId: install, qty: "1" }] }).expect(201);
    expect(q.body).toMatchObject({ number: expect.stringMatching(/^QT-\d{4}-\d{6}$/), status: "draft", currency: "LKR" });
    expect(q.body.lines[0]).toMatchObject({ unitPrice: 100000, taxRate: 1800, net: 1200000, tax: 216000 });
    expect(q.body.lines[1]).toMatchObject({ taxRate: 0, total: 500000 });
    expect(q.body.totals.total).toBe(1200000 + 216000 + 500000);

    await http().post(`/api/v1/sales/quotes/${q.body.id}/send`).set(as()).expect(400);
    expect((await http().post(`/api/v1/sales/quotes/${q.body.id}/submit`).set(as()).expect(200)).body.status).toBe("approved");
    const sent = await http().post(`/api/v1/sales/quotes/${q.body.id}/send`).set(as()).expect(200);
    const token = sent.body.link.split("/q/")[1];

    const pub = await http().get(`/api/v1/public/quotes/${token}`).expect(200);
    expect(pub.body).toMatchObject({ number: q.body.number, customer: { name: "Silva Builders" }, status: "sent" });
    expect(pub.body).not.toHaveProperty("notes");
    expect(pub.body).not.toHaveProperty("ownerUserId");
    await http().get("/api/v1/public/quotes/not-a-real-token").expect(404);

    await http().post(`/api/v1/public/quotes/${token}/accept`).send({ comment: "Go ahead" }).expect(200);
    await http().post(`/api/v1/public/quotes/${token}/reject`).send({}).expect(400);

    const order = await http().post(`/api/v1/sales/quotes/${q.body.id}/convert`).set(as()).send({}).expect(200);
    expect(order.body).toMatchObject({ status: "draft", quoteId: q.body.id, warehouseId: warehouse });
    expect(order.body.totals.total).toBe(q.body.totals.total);
    orderId = order.body.id;
    const quote = await http().get(`/api/v1/sales/quotes/${q.body.id}`).set(as()).expect(200);
    expect(quote.body).toMatchObject({ status: "converted", orderId });
  });

  it("blocks orders over the credit limit without an approval workflow", async () => {
    const res = await http().post(`/api/v1/sales/orders/${orderId}/confirm`).set(as()).expect(400);
    expect(res.body.message).toContain("credit limit");
    await http().patch(`/api/v1/crm/accounts/${customer}`).set(as()).send({ creditLimit: "5000000" }).expect(200);
  });

  it("confirms with partial reservation, delivers what is reserved and backorders the rest", async () => {
    const confirmed = await http().post(`/api/v1/sales/orders/${orderId}/confirm`).set(as()).expect(200);
    expect(confirmed.body.status).toBe("confirmed");
    expect(confirmed.body.lines.map((l: { reserved: number }) => l.reserved)).toEqual([10000, 0]);
    expect(await stock()).toMatchObject({ onHand: 10000, reserved: 10000, available: 0 });

    const dn = await http().post("/api/v1/sales/deliveries").set(as()).send({ orderId }).expect(201);
    expect(dn.body.lines.map((l: { qty: number }) => l.qty)).toEqual([10000, 1000]);
    await http().post(`/api/v1/sales/deliveries/${dn.body.id}/pick`).set(as()).expect(200);
    await http().post(`/api/v1/sales/deliveries/${dn.body.id}/pack`).set(as()).expect(200);
    const sent = await http().post(`/api/v1/sales/deliveries/${dn.body.id}/dispatch`).set(as()).expect(200);
    expect(sent.body.lines[0].unitCost).toBe(40000);
    expect(await stock()).toMatchObject({ onHand: 0, reserved: 0 });

    const order = await http().get(`/api/v1/sales/orders/${orderId}`).set(as()).expect(200);
    expect(order.body.status).toBe("partially_delivered");
    expect(order.body.lines.map((l: { delivered: number }) => l.delivered)).toEqual([10000, 1000]);
    await http().post("/api/v1/sales/deliveries").set(as()).send({ orderId }).expect(400);

    // More stock arrives: reserve the shortage and ship it.
    const adj = await http().post("/api/v1/inventory/adjustments").set(as()).send({ warehouseId: warehouse, reason: "found", lines: [{ productId: tile, qty: "5", unitCost: "400" }] }).expect(201);
    await http().post(`/api/v1/inventory/adjustments/${adj.body.id}/submit`).set(as()).expect(200);
    await http().post(`/api/v1/sales/orders/${orderId}/reserve`).set(as()).expect(200);
    const dn2 = await http().post("/api/v1/sales/deliveries").set(as()).send({ orderId }).expect(201);
    expect(dn2.body.lines.map((l: { qty: number }) => l.qty)).toEqual([2000]);
    await http().post(`/api/v1/sales/deliveries/${dn2.body.id}/dispatch`).set(as()).expect(200);
    expect((await http().get(`/api/v1/sales/orders/${orderId}`).set(as()).expect(200)).body.status).toBe("delivered");
    const pod = await http().post(`/api/v1/sales/deliveries/${dn2.body.id}/deliver`).set(as()).send({ receivedBy: "Site manager" }).expect(200);
    expect(pod.body).toMatchObject({ status: "delivered", receivedBy: "Site manager" });

    const related = await http().get(`/api/v1/records/sales.order/${orderId}/related`).set(as()).expect(200);
    expect(related.body.filter((r: { entityType: string }) => r.entityType === "sales.delivery")).toHaveLength(2);
    (globalThis as Record<string, unknown>).firstDelivery = dn.body.id;
  });

  it("takes returns back into stock at the cost they left with", async () => {
    const deliveryId = (globalThis as Record<string, unknown>).firstDelivery as string;
    await http().post("/api/v1/sales/returns").set(as()).send({ deliveryId, reason: "Wrong colour", lines: [{ deliveryLineIndex: 0, qty: "11" }] }).expect(400);
    const rma = await http().post("/api/v1/sales/returns").set(as()).send({ deliveryId, reason: "Wrong colour", lines: [{ deliveryLineIndex: 0, qty: "2" }] }).expect(201);
    await http().post(`/api/v1/sales/returns/${rma.body.id}/receive`).set(as()).expect(400);
    await http().post(`/api/v1/sales/returns/${rma.body.id}/approve`).set(as()).expect(200);
    await http().post(`/api/v1/sales/returns/${rma.body.id}/receive`).set(as()).expect(200);
    expect(await stock()).toMatchObject({ onHand: 5000, value: 200000 });
    const order = await http().get(`/api/v1/sales/orders/${orderId}`).set(as()).expect(200);
    expect(order.body.lines[0].returned).toBe(2000);
  });

  it("cancels an order and gives back its reservation", async () => {
    const o = await http().post("/api/v1/sales/orders").set(as()).send({ accountId: customer, lines: [{ productId: tile, qty: "3" }] }).expect(201);
    await http().post(`/api/v1/sales/orders/${o.body.id}/confirm`).set(as()).expect(200);
    expect((await stock()).reserved).toBe(3000);
    await http().post(`/api/v1/sales/orders/${o.body.id}/cancel`).set(as()).send({ reason: "Customer changed mind" }).expect(200);
    expect((await stock()).reserved).toBe(0);
  });
});
