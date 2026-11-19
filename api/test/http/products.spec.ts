import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";

describe("Products and pricing over HTTP", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${t.token("admin")}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
  });
  afterAll(async () => {
    await app?.close();
  });

  let tile: string;

  it("numbers products, checks units and validates bundles", async () => {
    const p = await http().post("/api/v1/products/items").set(as()).send({ name: "Floor tile 60x60", salesPrice: "1250.00", uomConversions: [{ uom: "box", factor: "4" }] }).expect(201);
    tile = p.body.id;
    expect(p.body).toMatchObject({ sku: "PRD-000001", baseUom: "pcs", salesPrice: 125000, type: "stock", uomConversions: [{ uom: "box", factor: 4000 }] });
    await http().post("/api/v1/products/items").set(as()).send({ name: "Odd", baseUom: "furlong" }).expect(400);
    await http().post("/api/v1/products/items").set(as()).send({ name: "Empty bundle", type: "bundle" }).expect(400);
    const bundle = await http().post("/api/v1/products/items").set(as()).send({ name: "Tile starter kit", type: "bundle", components: [{ productId: tile, qty: "10" }] }).expect(201);
    expect(bundle.body.components).toEqual([{ productId: tile, qty: 10000 }]);
    await http().patch(`/api/v1/products/items/${tile}`).set(as()).send({ baseUom: "kg" }).expect(400);
  });

  it("prices from the product, then the default list, then the customer's list, with quantity breaks", async () => {
    const base = await http().get(`/api/v1/products/price?productId=${tile}&qty=2`).set(as()).expect(200);
    expect(base.body).toMatchObject({ source: "product", unitPrice: 125000, lineTotal: 250000 });

    const std = await http().post("/api/v1/products/price-lists").set(as()).send({ code: "STD", name: "Standard", isDefault: true }).expect(201);
    await http().post("/api/v1/products/prices").set(as()).send({ priceListId: std.body.id, productId: tile, unitPrice: "1200" }).expect(201);
    await http().post("/api/v1/products/prices").set(as()).send({ priceListId: std.body.id, productId: tile, unitPrice: "1100", minQty: "100" }).expect(201);
    // Draft lists are not used for pricing.
    expect((await http().get(`/api/v1/products/price?productId=${tile}`).set(as()).expect(200)).body.source).toBe("product");
    const activated = await http().post(`/api/v1/products/price-lists/${std.body.id}/activate`).set(as()).expect(200);
    expect(activated.body.status).toBe("active");

    expect((await http().get(`/api/v1/products/price?productId=${tile}&qty=5`).set(as()).expect(200)).body).toMatchObject({ source: "default_price_list", unitPrice: 120000 });
    expect((await http().get(`/api/v1/products/price?productId=${tile}&qty=150`).set(as()).expect(200)).body.unitPrice).toBe(110000);

    const vip = await http().post("/api/v1/products/price-lists").set(as()).send({ code: "VIP", name: "VIP" }).expect(201);
    await http().post("/api/v1/products/prices").set(as()).send({ priceListId: vip.body.id, productId: tile, unitPrice: "999.99" }).expect(201);
    await http().post(`/api/v1/products/price-lists/${vip.body.id}/activate`).set(as()).expect(200);
    const customer = await http().post("/api/v1/crm/accounts").set(as()).send({ name: "VIP Builders", priceListId: vip.body.id, segment: "contractor" }).expect(201);
    const q = await http().get(`/api/v1/products/price?productId=${tile}&accountId=${customer.body.id}`).set(as()).expect(200);
    expect(q.body).toMatchObject({ source: "customer_price_list", unitPrice: 99999, priceListId: vip.body.id });
  });

  it("applies discount rules by priority, stopping at a non-stackable rule", async () => {
    const customer = await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Contractor Co", segment: "contractor" }).expect(201);
    await http().post("/api/v1/products/discounts").set(as()).send({ code: "SEG10", name: "Contractors 10%", kind: "percent", value: "10", scope: "segment", targetIds: ["contractor"], priority: 1, stackable: true }).expect(201);
    await http().post("/api/v1/products/discounts").set(as()).send({ code: "BULK50", name: "Bulk 50 off", kind: "amount", value: "50", scope: "product", targetIds: [tile], minQty: "10", priority: 2 }).expect(201);
    await http().post("/api/v1/products/discounts").set(as()).send({ code: "NEVER", name: "Should not apply", kind: "percent", value: "50", scope: "all", priority: 3 }).expect(201);
    await http().post("/api/v1/products/discounts").set(as()).send({ code: "BAD", name: "Bad", kind: "percent", value: "150", scope: "all" }).expect(400);

    const small = await http().get(`/api/v1/products/price?productId=${tile}&qty=1&accountId=${customer.body.id}`).set(as()).expect(200);
    // 1200.00 (default list) - 10% = 1080.00, then BULK50 needs 10+, then NEVER (non-stackable, 50%) applies.
    expect(small.body.discounts.map((d: { code: string }) => d.code)).toEqual(["SEG10", "NEVER"]);
    const bulk = await http().get(`/api/v1/products/price?productId=${tile}&qty=10&accountId=${customer.body.id}`).set(as()).expect(200);
    expect(bulk.body.discounts.map((d: { code: string }) => d.code)).toEqual(["SEG10", "BULK50"]);
    expect(bulk.body.unitPrice).toBe(120000 - 12000 - 5000);
    expect(bulk.body.lineTotal).toBe(103000 * 10);
  });

  it("routes price list activation through an approval workflow", async () => {
    const approver = `${t.tenantId}_viewer`;
    await http().post("/api/v1/workflow/definitions").set(as()).send({ code: "PL", name: "Price list approval", entityType: "products.priceList", steps: [{ name: "Pricing manager", approvers: [{ type: "user", ids: [approver] }] }] }).expect(201);
    const list = await http().post("/api/v1/products/price-lists").set(as()).send({ code: "PROMO", name: "Promo" }).expect(201);
    const pending = await http().post(`/api/v1/products/price-lists/${list.body.id}/activate`).set(as()).expect(200);
    expect(pending.body.status).toBe("pending_approval");
    await http().patch(`/api/v1/products/price-lists/${list.body.id}`).set(as()).send({ name: "Changed" }).expect(400);

    const requests = await http().get(`/api/v1/workflow/requests/for/products.priceList/${list.body.id}`).set(as()).expect(200);
    const viewerAuth = { Authorization: `Bearer ${t.token("viewer")}`, "x-company-id": t.companyId };
    await http().post(`/api/v1/workflow/requests/${requests.body[0].id}/approve`).set(viewerAuth).send({}).expect(200);
    await app.get(JobQueueService).drain();
    const after = await http().get(`/api/v1/products/price-lists/${list.body.id}`).set(as()).expect(200);
    expect(after.body.status).toBe("active");
  });
});
