import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("POS", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  let warehouseId: string;
  let productId: string;
  let terminalId: string;
  let customerId: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["pos.sale.view"]);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    const month = new Date().toISOString().slice(0, 7);
    await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: `${month}-01`, months: 12 }).expect(201);

    warehouseId = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "SHOP", name: "Shop floor" }).expect(201)).body.id;
    productId = (await http().post("/api/v1/products/items").set(as()).send({ name: "T-shirt", salesPrice: "1000", taxCategory: "VAT" }).expect(201)).body.id;
    const adj = await http().post("/api/v1/inventory/adjustments").set(as()).send({ warehouseId, reason: "opening_balance", lines: [{ productId, qty: "50", unitCost: "400" }] }).expect(201);
    await http().post(`/api/v1/inventory/adjustments/${adj.body.id}/submit`).set(as()).expect(200);

    terminalId = (await http().post("/api/v1/pos/terminals").set(as()).send({ code: "T1", name: "Front till", warehouseId }).expect(201)).body.id;
    customerId = (await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Walk-in regular" }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  const stock = async (p: string) => (await http().get(`/api/v1/inventory/stock/${p}`).set(as()).expect(200)).body;

  let shiftId: string;

  it("opens a shift and refuses a second open shift on the same terminal", async () => {
    const shift = await http().post("/api/v1/pos/shifts").set(as()).send({ terminalId, openingCash: "10000" }).expect(201);
    shiftId = shift.body.id;
    expect(shift.body).toMatchObject({ status: "open", openingCash: 1_000_000, cashierId: expect.any(String) });
    await http().post("/api/v1/pos/shifts").set(as()).send({ terminalId, openingCash: "5000" }).expect(400);
  });

  let saleId: string;
  let lineId: string;

  it("rings up a walk-in sale, deducts stock and posts cash, revenue and tax", async () => {
    expect(await stock(productId)).toMatchObject({ onHand: 50_000 });
    const sale = await http().post("/api/v1/pos/sales").set(as()).send({
      shiftId, lines: [{ productId, qty: "3" }], payments: [{ method: "cash", amount: "3540" }],
    }).expect(201);
    saleId = sale.body.id;
    lineId = sale.body.lines[0].lineId;
    expect(sale.body).toMatchObject({ number: expect.stringMatching(/^POS-\d{4}-\d{6}$/), status: "completed" });
    expect(sale.body.lines[0]).toMatchObject({ qty: 3000, unitPrice: 100_000, taxRate: 1800, net: 300_000, tax: 54_000, total: 354_000 });
    expect(sale.body.totals.total).toBe(354_000);
    await http().post("/api/v1/pos/sales").set(as()).send({ shiftId, lines: [{ productId, qty: "1" }], payments: [{ method: "cash", amount: "1" }] }).expect(400); // wrong amount
    expect(await stock(productId)).toMatchObject({ onHand: 47_000 });
  });

  it("keeps sale actions behind the edit permission", async () => {
    await http().post(`/api/v1/pos/sales/${saleId}/refund`).set(as("viewer")).send({ lines: [{ lineId, qty: "1" }], method: "cash" }).expect(403);
  });

  it("earns loyalty points on an account sale and lets a later sale redeem them", async () => {
    // 10 units * LKR 1000 + 18% VAT = LKR 11,800 = 1,180,000 minor units; 1 point per LKR 100 (10,000 minor units) = 118 points.
    const earn = await http().post("/api/v1/pos/sales").set(as()).send({
      shiftId, accountId: customerId, lines: [{ productId, qty: "10" }], payments: [{ method: "cash", amount: "11800" }],
    }).expect(201);
    expect(earn.body.totals.total).toBe(1_180_000);
    expect(earn.body.loyaltyPointsEarned).toBe(118);

    // 1 unit = LKR 1000 + 18% VAT = LKR 1180 = 118,000 minor units; redeem 50 points (50 minor units) off that.
    const redeem = await http().post("/api/v1/pos/sales").set(as()).send({
      shiftId, accountId: customerId, lines: [{ productId, qty: "1" }], payments: [{ method: "cash", amount: "1179.50" }], redeemPoints: 50,
    }).expect(201);
    expect(redeem.body.loyaltyPointsRedeemed).toBe(50);
    expect(redeem.body.payments[0].amount).toBe(117_950);
  });

  it("refunds part of a sale, restoring stock and reversing revenue", async () => {
    const before = await stock(productId);
    const refunded = await http().post(`/api/v1/pos/sales/${saleId}/refund`).set(as()).send({ lines: [{ lineId, qty: "1" }], method: "cash" }).expect(200);
    expect(refunded.body.status).toBe("partially_refunded");
    expect(await stock(productId)).toMatchObject({ onHand: before.onHand + 1_000 });
  });

  it("voids a sale within the still-open shift, reversing stock and cash", async () => {
    const before = await stock(productId);
    const sale = await http().post("/api/v1/pos/sales").set(as()).send({ shiftId, lines: [{ productId, qty: "2" }], payments: [{ method: "cash", amount: "2360" }] }).expect(201);
    const voided = await http().post(`/api/v1/pos/sales/${sale.body.id}/void`).set(as()).expect(200);
    expect(voided.body.status).toBe("voided");
    expect(await stock(productId)).toMatchObject({ onHand: before.onHand });
    await http().post(`/api/v1/pos/sales/${sale.body.id}/void`).set(as()).expect(400); // already voided
  });

  it("closes the shift, reconciling counted cash", async () => {
    const closed = await http().post(`/api/v1/pos/shifts/${shiftId}/close`).set(as()).send({ closingCash: "0" }).expect(200);
    expect(closed.body.status).toBe("closed");
    expect(closed.body.expectedCash).toBeGreaterThan(closed.body.openingCash);
    expect(closed.body.variance).toBe(closed.body.closingCash - closed.body.expectedCash);
    await http().post("/api/v1/pos/shifts").set(as()).send({ terminalId, openingCash: "0" }).expect(201); // the terminal is free again
  });
});
