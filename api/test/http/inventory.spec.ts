import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";
import { EventBusService } from "../../src/platform/events/event-bus.service.js";

describe("Inventory over HTTP", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (user: "admin" | "viewer" = "admin") => ({ Authorization: `Bearer ${t.token(user)}`, "x-company-id": t.companyId });
  let main: string;
  let store: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    main = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "MAIN", name: "Main warehouse" }).expect(201)).body.id;
    store = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "STORE", name: "Colombo store", type: "store" }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  const product = async (body: object) => (await http().post("/api/v1/products/items").set(as()).send(body).expect(201)).body.id as string;
  const adjust = async (warehouseId: string, lines: object[], reason = "opening_balance", expect = 200) => {
    const adj = await http().post("/api/v1/inventory/adjustments").set(as()).send({ warehouseId, reason, lines }).expect(201);
    return http().post(`/api/v1/inventory/adjustments/${adj.body.id}/submit`).set(as()).expect(expect);
  };
  const position = async (productId: string) => (await http().get(`/api/v1/inventory/stock/${productId}`).set(as()).expect(200)).body;

  it("values receipts at weighted average cost and issues at that average", async () => {
    const p = await product({ name: "Cement 50kg", costingMethod: "average" });
    await adjust(main, [{ productId: p, qty: "10", unitCost: "100" }]);
    await adjust(main, [{ productId: p, qty: "30", unitCost: "200" }]);
    let s = await position(p);
    expect(s).toMatchObject({ onHand: 40000, value: 700000, avgCost: 17500 });
    const out = await adjust(main, [{ productId: p, qty: "-4" }], "damaged");
    expect(out.body.status).toBe("posted");
    s = await position(p);
    expect(s).toMatchObject({ onHand: 36000, value: 630000, avgCost: 17500 });
    const ledger = await http().get(`/api/v1/inventory/movements?productId=${p}`).set(as()).expect(200);
    expect(ledger.body.items.map((m: { qty: number; value: number }) => [m.qty, m.value])).toEqual([[-4000, -70000], [30000, 600000], [10000, 100000]]);
    expect(ledger.body.items[0].number).toMatch(/^MV-\d{4}-\d{6}$/);
  });

  it("costs issues from the oldest FIFO layers", async () => {
    const p = await product({ name: "Paint 4L", costingMethod: "fifo" });
    await adjust(main, [{ productId: p, qty: "5", unitCost: "10" }]);
    await adjust(main, [{ productId: p, qty: "5", unitCost: "20" }]);
    const out = await adjust(main, [{ productId: p, qty: "-7" }], "damaged");
    expect(out.status).toBe(200);
    const ledger = await http().get(`/api/v1/inventory/movements?productId=${p}&limit=1`).set(as()).expect(200);
    expect(ledger.body.items[0]).toMatchObject({ qty: -7000, value: -(5 * 1000 + 2 * 2000) });
    expect(await position(p)).toMatchObject({ onHand: 3000, value: 6000 });
  });

  it("blocks negative stock unless the warehouse allows it", async () => {
    const p = await product({ name: "Steel bar" });
    await adjust(main, [{ productId: p, qty: "2", unitCost: "50" }]);
    const fail = await adjust(main, [{ productId: p, qty: "-3" }], "damaged", 400);
    expect(fail.body.message).toContain("Not enough");
    await http().patch(`/api/v1/inventory/warehouses/${main}`).set(as()).send({ allowNegative: true }).expect(200);
    await adjust(main, [{ productId: p, qty: "-3" }], "damaged");
    expect((await position(p)).onHand).toBe(-1000);
    await http().patch(`/api/v1/inventory/warehouses/${main}`).set(as()).send({ allowNegative: false }).expect(200);
  });

  it("enforces lots, expiry and serial numbers", async () => {
    const lotted = await product({ name: "Adhesive", trackLots: true, trackExpiry: true });
    await adjust(main, [{ productId: lotted, qty: "5" }], "opening_balance", 400);
    await adjust(main, [{ productId: lotted, qty: "5", lotNo: "L1" }], "opening_balance", 400);
    await adjust(main, [{ productId: lotted, qty: "5", lotNo: "L1", expiryDate: "2026-12-01" }]);
    const expiring = await http().get("/api/v1/inventory/reports/expiring?days=3650").set(as()).expect(200);
    expect(expiring.body.find((b: { productId: string }) => b.productId === lotted)).toMatchObject({ lotNo: "L1", onHand: 5000 });

    const serial = await product({ name: "Generator", trackSerials: true });
    await adjust(main, [{ productId: serial, qty: "2", serialNos: ["G1"] }], "opening_balance", 400);
    await adjust(main, [{ productId: serial, qty: "2", serialNos: ["G1", "G2"], unitCost: "1000" }]);
    await adjust(main, [{ productId: serial, qty: "1", serialNos: ["G1"] }], "found", 400);
    await adjust(main, [{ productId: serial, qty: "-1", serialNos: ["G9"] }], "lost", 400);
    await adjust(main, [{ productId: serial, qty: "-1", serialNos: ["G2"] }], "lost");
  });

  it("moves stock through transit between warehouses", async () => {
    const p = await product({ name: "Tile adhesive" });
    await adjust(main, [{ productId: p, qty: "10", unitCost: "30" }]);
    const trf = await http().post("/api/v1/inventory/transfers").set(as()).send({ fromWarehouseId: main, toWarehouseId: store, lines: [{ productId: p, qty: "4" }] }).expect(201);
    await http().post(`/api/v1/inventory/transfers/${trf.body.id}/ship`).set(as()).expect(200);
    expect(await position(p)).toMatchObject({ onHand: 6000, inTransit: 4000, value: 30000 });
    await http().post(`/api/v1/inventory/transfers/${trf.body.id}/receive`).set(as()).expect(200);
    expect(await position(p)).toMatchObject({ onHand: 10000, inTransit: 0, value: 30000 });
    const atStore = await http().get(`/api/v1/inventory/stock?productId=${p}&warehouseId=${store}`).set(as()).expect(200);
    expect(atStore.body[0].onHand).toBe(4000);
    await http().post(`/api/v1/inventory/transfers/${trf.body.id}/receive`).set(as()).expect(400);
  });

  it("locks a warehouse during a count and posts the differences", async () => {
    const p = await product({ name: "Grout" });
    await adjust(store, [{ productId: p, qty: "20", unitCost: "5" }]);
    const count = await http().post("/api/v1/inventory/counts").set(as()).send({ warehouseId: store, productIds: [p] }).expect(201);
    expect(count.body.lines[0]).toMatchObject({ productId: p, expected: 20000 });
    await adjust(store, [{ productId: p, qty: "1" }], "found", 400);
    await http().post("/api/v1/inventory/counts").set(as()).send({ warehouseId: store }).expect(400);
    await http().put(`/api/v1/inventory/counts/${count.body.id}/entries`).set(as()).send({ entries: [{ productId: p, counted: "18" }] }).expect(200);
    const posted = await http().post(`/api/v1/inventory/counts/${count.body.id}/post`).set(as()).expect(200);
    expect(posted.body.status).toBe("posted");
    expect((await position(p)).onHand).toBe(18000);
    await adjust(store, [{ productId: p, qty: "1" }], "found");
  });

  it("sends large adjustments for approval and posts when approved", async () => {
    const p = await product({ name: "Copper wire" });
    await adjust(main, [{ productId: p, qty: "100", unitCost: "100" }]);
    await http().post("/api/v1/workflow/definitions").set(as()).send({
      code: "ADJ-BIG", name: "Large write-offs", entityType: "inventory.adjustment",
      conditions: [{ fact: "estimatedValue", op: "gte", value: 100000 }],
      steps: [{ name: "Finance", approvers: [{ type: "user", ids: [`${t.tenantId}_viewer`] }] }],
    }).expect(201);
    const small = await adjust(main, [{ productId: p, qty: "-1" }], "damaged");
    expect(small.body.status).toBe("posted");
    const big = await adjust(main, [{ productId: p, qty: "-20" }], "write_off");
    expect(big.body.status).toBe("pending_approval");
    expect((await position(p)).onHand).toBe(99000);
    const req = await http().get(`/api/v1/workflow/requests/for/inventory.adjustment/${big.body.id}`).set(as()).expect(200);
    await http().post(`/api/v1/workflow/requests/${req.body[0].id}/approve`).set(as("viewer")).send({}).expect(200);
    await app.get(JobQueueService).drain();
    expect((await position(p)).onHand).toBe(79000);
    expect((await http().get(`/api/v1/inventory/adjustments/${big.body.id}`).set(as()).expect(200)).body.status).toBe("posted");
  });

  it("flags low stock against the reorder point and publishes an event", async () => {
    const seen: string[] = [];
    app.get(EventBusService).subscribe("LowStock", `test.low.${Date.now()}`, async (e) => void seen.push(e.entityId));
    const p = await product({ name: "Sand bag" });
    await adjust(main, [{ productId: p, qty: "10", unitCost: "1" }]);
    await http().put(`/api/v1/inventory/stock/${p}/reorder`).set(as()).send({ reorderPoint: "5", reorderQty: "20" }).expect(200);
    await adjust(main, [{ productId: p, qty: "-6" }], "damaged");
    await app.get(JobQueueService).drain();
    expect(seen).toContain(p);
    const reorder = await http().get("/api/v1/inventory/reports/reorder").set(as()).expect(200);
    expect(reorder.body.find((r: { productId: string }) => r.productId === p)).toMatchObject({ available: 4000, suggestedQty: 20000 });
  });

  it("refuses stock for service products", async () => {
    const svc = await product({ name: "Installation", type: "service" });
    const res = await adjust(main, [{ productId: svc, qty: "1" }], "opening_balance", 400);
    expect(res.body.message).toContain("holds no stock");
  });
});
