import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";
import { EventBusService } from "../../src/platform/events/event-bus.service.js";

describe("Procurement: requisition to receipt", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  let warehouse: string;
  let cement: string;
  let steel: string;
  let acme: string;
  let lanka: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["procurement.order.view", "procurement.requisition.view"]);
    warehouse = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "WH", name: "Main" }).expect(201)).body.id;
    cement = (await http().post("/api/v1/products/items").set(as()).send({ name: "Cement 50kg", purchasePrice: "2000", taxCategory: "ZERO" }).expect(201)).body.id;
    steel = (await http().post("/api/v1/products/items").set(as()).send({ name: "Steel bar", purchasePrice: "500" }).expect(201)).body.id;
    acme = (await http().post("/api/v1/procurement/suppliers").set(as()).send({ name: "Acme Supplies", leadTimeDays: 7 }).expect(201)).body.id;
    lanka = (await http().post("/api/v1/procurement/suppliers").set(as()).send({ name: "Lanka Hardware" }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  const stock = async (p: string) => (await http().get(`/api/v1/inventory/stock/${p}`).set(as()).expect(200)).body;

  it("numbers suppliers and refuses orders to blocked ones", async () => {
    const s = await http().get(`/api/v1/procurement/suppliers/${acme}`).set(as()).expect(200);
    expect(s.body).toMatchObject({ code: expect.stringMatching(/^SUP-\d{6}$/), status: "active", currency: "LKR", performanceScore: null });
    const blocked = (await http().post("/api/v1/procurement/suppliers").set(as()).send({ name: "Bad Co", status: "blocked" }).expect(201)).body.id;
    const res = await http().post("/api/v1/procurement/orders").set(as()).send({ supplierId: blocked, warehouseId: warehouse, lines: [{ productId: cement, qty: "1" }] }).expect(400);
    expect(res.body.message).toContain("blocked");
  });

  let rfqId: string;
  let requisitionId: string;

  it("routes requisitions over a threshold for approval", async () => {
    await http().post("/api/v1/workflow/definitions").set(as()).send({
      code: "PR-BIG", name: "Large requisitions", entityType: "procurement.requisition",
      conditions: [{ fact: "amount", op: "gte", value: 10_000_000 }],
      steps: [{ name: "Head of procurement", approvers: [{ type: "user", ids: [`${t.tenantId}_viewer`] }] }],
    }).expect(201);

    const small = await http().post("/api/v1/procurement/requisitions").set(as()).send({ lines: [{ productId: cement, qty: "10" }] }).expect(201);
    expect(small.body).toMatchObject({ number: expect.stringMatching(/^PR-\d{4}-\d{6}$/), estimatedTotal: 2_000_000, status: "draft" });
    expect((await http().post(`/api/v1/procurement/requisitions/${small.body.id}/submit`).set(as()).expect(200)).body.status).toBe("approved");

    const big = await http().post("/api/v1/procurement/requisitions").set(as()).send({
      justification: "Site B foundations",
      lines: [{ productId: cement, qty: "100" }, { productId: steel, qty: "200" }],
    }).expect(201);
    expect(big.body.estimatedTotal).toBe(100 * 200_000 + 200 * 50_000);
    expect((await http().post(`/api/v1/procurement/requisitions/${big.body.id}/submit`).set(as()).expect(200)).body.status).toBe("pending_approval");
    await http().patch(`/api/v1/procurement/requisitions/${big.body.id}`).set(as()).send({ justification: "x" }).expect(400);
    const req = await http().get(`/api/v1/workflow/requests/for/procurement.requisition/${big.body.id}`).set(as()).expect(200);
    await http().post(`/api/v1/workflow/requests/${req.body[0].id}/approve`).set(as("viewer")).send({}).expect(200);
    await app.get(JobQueueService).drain();
    expect((await http().get(`/api/v1/procurement/requisitions/${big.body.id}`).set(as()).expect(200)).body.status).toBe("approved");
    requisitionId = big.body.id;
  });

  it("collects quotes, compares them and needs a reason to skip the cheapest", async () => {
    const rfq = await http().post("/api/v1/procurement/rfqs").set(as()).send({ requisitionId, supplierIds: [acme, lanka] }).expect(201);
    expect(rfq.body).toMatchObject({ number: expect.stringMatching(/^RFQ-/), status: "open" });
    const [l1, l2] = rfq.body.lines.map((l: { lineId: string }) => l.lineId);
    await http().post(`/api/v1/procurement/rfqs/${rfq.body.id}/quotes`).set(as()).send({ supplierId: acme, prices: { [l1]: "1900", [l2]: "520" }, leadTimeDays: 5 }).expect(200);
    await http().post(`/api/v1/procurement/rfqs/${rfq.body.id}/quotes`).set(as()).send({ supplierId: lanka, prices: { [l1]: "1950", [l2]: "480" } }).expect(200);
    const outsider = (await http().post("/api/v1/procurement/suppliers").set(as()).send({ name: "Not invited" }).expect(201)).body.id;
    await http().post(`/api/v1/procurement/rfqs/${rfq.body.id}/quotes`).set(as()).send({ supplierId: outsider, prices: { [l1]: "1" } }).expect(400);

    const cmp = await http().get(`/api/v1/procurement/rfqs/${rfq.body.id}/compare`).set(as()).expect(200);
    // Acme 100×1900 + 200×520 = 294,000; Lanka 100×1950 + 200×480 = 291,000.
    expect(cmp.body.map((c: { supplierId: string; total: number }) => [c.supplierId, c.total])).toEqual([[lanka, 29_100_000], [acme, 29_400_000]]);
    const noReason = await http().post(`/api/v1/procurement/rfqs/${rfq.body.id}/award`).set(as()).send({ supplierId: acme, warehouseId: warehouse }).expect(400);
    expect(noReason.body.message).toContain("cheapest");
    rfqId = rfq.body.id;
  });

  let orderId: string;

  it("awards to a draft order, approves it and counts the quantities on order", async () => {
    const awarded = await http().post(`/api/v1/procurement/rfqs/${rfqId}/award`).set(as()).send({ supplierId: acme, warehouseId: warehouse, reason: "Faster delivery" }).expect(200);
    const order = awarded.body.order;
    expect(order).toMatchObject({ number: expect.stringMatching(/^PO-\d{4}-\d{6}$/), status: "draft", supplierId: acme, requisitionId, rfqId, paymentTermsDays: 30 });
    expect(order.lines[0]).toMatchObject({ unitPrice: 190_000, taxRate: 0, net: 19_000_000, tax: 0 });
    expect(order.lines[1]).toMatchObject({ unitPrice: 52_000, taxRate: 1800, net: 10_400_000, tax: 1_872_000 });
    expect(order.totals).toEqual({ subtotal: 29_400_000, tax: 1_872_000, total: 31_272_000 });
    expect(order.expectedDate).toBeTruthy();
    expect((await http().get(`/api/v1/procurement/requisitions/${requisitionId}`).set(as()).expect(200)).body).toMatchObject({ status: "ordered", orderIds: [order.id] });
    expect((await http().get(`/api/v1/procurement/rfqs/${rfqId}`).set(as()).expect(200)).body).toMatchObject({ status: "awarded", orderId: order.id });

    expect((await http().post(`/api/v1/procurement/orders/${order.id}/submit`).set(as()).expect(200)).body.status).toBe("approved");
    expect(await stock(cement)).toMatchObject({ onHand: 0, onOrder: 100_000 });
    expect(await stock(steel)).toMatchObject({ onOrder: 200_000 });

    await http().patch(`/api/v1/procurement/orders/${order.id}`).set(as()).send({ notes: "late change" }).expect(400);
    const amended = await http().post(`/api/v1/procurement/orders/${order.id}/amend`).set(as()).expect(200);
    expect(amended.body).toMatchObject({ status: "draft", amendment: 1 });
    expect(await stock(cement)).toMatchObject({ onOrder: 0 });
    await http().patch(`/api/v1/procurement/orders/${order.id}`).set(as()).send({ lines: [{ productId: cement, qty: "100", unitPrice: "1900" }, { productId: steel, qty: "200", unitPrice: "520" }], notes: "Deliver to gate 2" }).expect(200);
    await http().post(`/api/v1/procurement/orders/${order.id}/submit`).set(as()).expect(200);
    await http().post(`/api/v1/procurement/orders/${order.id}/send`).set(as()).expect(200);
    const confirmed = await http().post(`/api/v1/procurement/orders/${order.id}/confirm`).set(as()).send({ supplierReference: "ACME-SO-77" }).expect(200);
    expect(confirmed.body).toMatchObject({ status: "confirmed", supplierReference: "ACME-SO-77" });
    expect(await stock(cement)).toMatchObject({ onOrder: 100_000 });
    orderId = order.id;
  });

  let receiptId: string;

  it("receives part of the order with inspection rejects, at the order price", async () => {
    const events: { lines: { accepted: number; unitPrice: number }[] }[] = [];
    app.get(EventBusService).subscribe("GoodsReceived", `test.grn.${Date.now()}`, async (e) => void events.push(e.payload as never));
    const order = (await http().get(`/api/v1/procurement/orders/${orderId}`).set(as()).expect(200)).body;
    const [c, s] = order.lines.map((l: { lineId: string }) => l.lineId);

    await http().post("/api/v1/procurement/receipts").set(as()).send({ orderId, lines: [{ orderLineId: c, received: "101" }] }).expect(400);
    await http().post("/api/v1/procurement/receipts").set(as()).send({ orderId, lines: [{ orderLineId: c, received: "10", rejected: "2" }] }).expect(400);

    const grn = await http().post("/api/v1/procurement/receipts").set(as()).send({
      orderId, supplierDeliveryNote: "DN-5531",
      lines: [{ orderLineId: c, received: "60", rejected: "5", rejectReason: "Torn bags" }, { orderLineId: s, received: "200" }],
    }).expect(201);
    expect(grn.body).toMatchObject({ number: expect.stringMatching(/^GRN-/), status: "draft" });
    expect(await stock(cement)).toMatchObject({ onHand: 0 });

    const posted = await http().post(`/api/v1/procurement/receipts/${grn.body.id}/post`).set(as()).expect(200);
    expect(posted.body.status).toBe("posted");
    expect(posted.body.lines[0]).toMatchObject({ accepted: 55_000, unitCost: 190_000 });
    await http().post(`/api/v1/procurement/receipts/${grn.body.id}/post`).set(as()).expect(400);
    expect(await stock(cement)).toMatchObject({ onHand: 55_000, onOrder: 45_000, value: 55 * 190_000 });
    expect(await stock(steel)).toMatchObject({ onHand: 200_000, onOrder: 0 });

    const after = (await http().get(`/api/v1/procurement/orders/${orderId}`).set(as()).expect(200)).body;
    expect(after.status).toBe("partially_received");
    expect(after.lines[0]).toMatchObject({ received: 60_000, rejected: 5_000 });
    const supplier = (await http().get(`/api/v1/procurement/suppliers/${acme}`).set(as()).expect(200)).body;
    expect(supplier).toMatchObject({ receiptsCount: 1, onTimeCount: 1, acceptedQty: 255_000, receivedQty: 260_000 });
    expect(supplier.performanceScore).toBe(Math.round((0.5 + (255 / 260) * 0.5) * 100));

    await app.get(JobQueueService).drain();
    expect(events.at(-1)?.lines.map((l) => [l.accepted, l.unitPrice])).toEqual([[55_000, 190_000], [200_000, 52_000]]);
    receiptId = grn.body.id;
  });

  it("returns goods to the supplier at cost", async () => {
    const res = await http().post("/api/v1/procurement/returns").set(as()).send({ receiptId, reason: "Cracked", lines: [{ receiptLineIndex: 0, qty: "56" }] }).expect(400);
    expect(res.body.message).toContain("At most 55");
    const ret = await http().post("/api/v1/procurement/returns").set(as()).send({ receiptId, reason: "Cracked", lines: [{ receiptLineIndex: 0, qty: "5" }] }).expect(201);
    expect(ret.body).toMatchObject({ number: expect.stringMatching(/^SRN-/), status: "draft" });
    expect((await http().post(`/api/v1/procurement/returns/${ret.body.id}/ship`).set(as()).expect(200)).body.status).toBe("shipped");
    expect(await stock(cement)).toMatchObject({ onHand: 50_000, value: 50 * 190_000 });
    const order = (await http().get(`/api/v1/procurement/orders/${orderId}`).set(as()).expect(200)).body;
    expect(order.lines[0].returned).toBe(5_000);
  });

  it("closes a part-received order and takes the rest off order", async () => {
    const closed = await http().post(`/api/v1/procurement/orders/${orderId}/cancel`).set(as()).send({ reason: "Supplier out of stock" }).expect(200);
    expect(closed.body.status).toBe("closed");
    expect(await stock(cement)).toMatchObject({ onOrder: 0 });
    await http().post("/api/v1/procurement/receipts").set(as()).send({ orderId, lines: [{ orderLineId: closed.body.lines[0].lineId, received: "1" }] }).expect(400);
  });

  it("reports spend, price variance and supplier performance", async () => {
    const a = (await http().get("/api/v1/procurement/analytics").set(as()).expect(200)).body;
    expect(a.orders).toBe(1);
    expect(a.totalSpend).toBe(29_400_000);
    expect(a.openCommitment).toBe(0);
    const acmeRow = a.suppliers.find((s: { supplierId: string }) => s.supplierId === acme);
    expect(acmeRow).toMatchObject({ spend: 29_400_000, onTimeRate: 1, averageLeadTimeDays: 0 });
    // Cement bought at 1,900 against a standard 2,000: 100 × -100 = -10,000.
    expect(a.priceVariance.find((p: { productId: string }) => p.productId === cement)).toMatchObject({ standardPrice: 200_000, minPrice: 190_000, variance: -1_000_000 });
    await http().get("/api/v1/procurement/analytics").set(as("viewer")).expect(403);
  });

  it("lets a viewer read orders but not raise them", async () => {
    await http().get("/api/v1/procurement/orders").set(as("viewer")).expect(200);
    await http().post("/api/v1/procurement/orders").set(as("viewer")).send({ supplierId: acme, warehouseId: warehouse, lines: [{ productId: cement, qty: "1" }] }).expect(403);
  });
});
