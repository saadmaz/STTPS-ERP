import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Sales analytics", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  let warehouse: string;
  let product: string;
  let customer: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    warehouse = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "WH", name: "Main" }).expect(201)).body.id;
    await http().put("/api/v1/sales/settings").set(as()).send({ defaultWarehouseId: warehouse }).expect(200);
    product = (await http().post("/api/v1/products/items").set(as()).send({ name: "Widget", salesPrice: "1000", purchasePrice: "400" }).expect(201)).body.id;
    const adj = await http().post("/api/v1/inventory/adjustments").set(as()).send({ warehouseId: warehouse, reason: "opening_balance", lines: [{ productId: product, qty: "10", unitCost: "400" }] }).expect(201);
    await http().post(`/api/v1/inventory/adjustments/${adj.body.id}/submit`).set(as()).expect(200);
    customer = (await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Big Spender Co", creditLimit: "50000000" }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("requires the analytics permission", async () => {
    await http().get("/api/v1/sales/analytics").set(as("viewer")).expect(403);
  });

  it("computes revenue, margin, and per-product/customer/rep breakdowns, and quote conversion", async () => {
    const quote = await http().post("/api/v1/sales/quotes").set(as()).send({ accountId: customer, lines: [{ productId: product, qty: "10" }] }).expect(201);
    await http().post(`/api/v1/sales/quotes/${quote.body.id}/submit`).set(as()).expect(200);
    const sent = await http().post(`/api/v1/sales/quotes/${quote.body.id}/send`).set(as()).expect(200);
    const token = sent.body.link.split("/q/")[1];
    await http().post(`/api/v1/public/quotes/${token}/accept`).send({}).expect(200);
    const order = await http().post(`/api/v1/sales/quotes/${quote.body.id}/convert`).set(as()).send({}).expect(200);
    await http().post(`/api/v1/sales/orders/${order.body.id}/confirm`).set(as()).expect(200);

    const summary = await http().get("/api/v1/sales/analytics").set(as()).expect(200);
    // 10 units at 1000 (-> 100000 minor), no discount: revenue (pre-tax net) = 1,000,000; cost = 10 * 40000 = 400,000; margin = 600,000.
    expect(summary.body).toMatchObject({ orderCount: 1, revenue: 1_000_000, averageOrderValue: 1_000_000, margin: 600_000, marginPct: 6000 });
    expect(summary.body.byProduct[0]).toMatchObject({ productId: product, revenue: 1_000_000, margin: 600_000 });
    expect(summary.body.byCustomer[0]).toMatchObject({ accountId: customer, revenue: 1_000_000 });
    expect(summary.body.byRep[0]).toMatchObject({ orders: 1, revenue: 1_000_000 });
    expect(summary.body.quotes).toMatchObject({ sent: 1, converted: 1, conversionRatePct: 10_000 });
  });
});
