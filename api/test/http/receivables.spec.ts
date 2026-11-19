import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";
import { toBase } from "../../src/finance/ar.services.js";

describe("Finance: receivables from invoice to cash", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${t.token("admin")}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  let warehouse: string;
  let tile: string;
  let customer: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    for (const a of (await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200)).body.items) acct[a.code] = a.id;
    await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: `${daysAgo(120).slice(0, 7)}-01`, months: 12 }).expect(201);
    warehouse = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "WH", name: "Main" }).expect(201)).body.id;
    await http().put("/api/v1/sales/settings").set(as()).send({ defaultWarehouseId: warehouse }).expect(200);
    tile = (await http().post("/api/v1/products/items").set(as()).send({ name: "Tile", salesPrice: "1000" }).expect(201)).body.id;
    const adj = await http().post("/api/v1/inventory/adjustments").set(as()).send({ warehouseId: warehouse, reason: "opening_balance", lines: [{ productId: tile, qty: "100", unitCost: "400" }] }).expect(201);
    await http().post(`/api/v1/inventory/adjustments/${adj.body.id}/submit`).set(as()).expect(200);
    customer = (await http().post("/api/v1/crm/accounts").set(as()).send({ name: "Perera Hardware", creditLimit: "100000000", paymentTermsDays: 30 }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  const balanceOf = async (code: string) => (await http().get(`/api/v1/finance/reports/trial-balance?to=${month}`).set(as()).expect(200)).body.lines.find((l: { code: string }) => l.code === code)?.balance ?? 0;
  const dispatch = async (qty: string) => {
    const order = await http().post("/api/v1/sales/orders").set(as()).send({ accountId: customer, lines: [{ productId: tile, qty }] }).expect(201);
    await http().post(`/api/v1/sales/orders/${order.body.id}/confirm`).set(as()).expect(200);
    const dn = await http().post("/api/v1/sales/deliveries").set(as()).send({ orderId: order.body.id }).expect(201);
    await http().post(`/api/v1/sales/deliveries/${dn.body.id}/dispatch`).set(as()).expect(200);
    await app.get(JobQueueService).drain();
    return dn.body.id as string;
  };

  it("converts foreign amounts to base exactly", () => {
    expect(toBase(10_000, "1", "LKR", "LKR")).toBe(10_000);
    expect(toBase(10_000, "300.125", "USD", "LKR")).toBe(3_001_250);
    expect(toBase(333, "0.5", "USD", "LKR")).toBe(167);
  });

  let invoiceId: string;
  let deliveryId: string;

  it("invoices a dispatched delivery once and posts receivables, revenue and tax", async () => {
    deliveryId = await dispatch("5");
    expect(await balanceOf("5100")).toBe(5 * 40_000);
    const inv = await http().post(`/api/v1/finance/invoices/from-delivery/${deliveryId}`).set(as()).expect(200);
    expect(inv.body).toMatchObject({ number: expect.stringMatching(/^INV-\d{4}-\d{6}$/), kind: "invoice", status: "draft", customerId: customer, deliveryId, balanceDue: 590_000 });
    expect(inv.body.totals).toEqual({ subtotal: 500_000, discount: 0, tax: 90_000, total: 590_000 });
    expect(inv.body.dueDate > today).toBe(true);
    await http().post(`/api/v1/finance/invoices/from-delivery/${deliveryId}`).set(as()).expect(400);
    const posted = await http().post(`/api/v1/finance/invoices/${inv.body.id}/post`).set(as()).expect(200);
    expect(posted.body).toMatchObject({ status: "posted", baseTotal: 590_000, journalId: expect.any(String) });
    expect(await balanceOf("1200")).toBe(590_000);
    expect(await balanceOf("4100")).toBe(500_000);
    expect(await balanceOf("2200")).toBe(90_000);
    await http().patch(`/api/v1/finance/invoices/${inv.body.id}`).set(as()).send({ notes: "x" }).expect(400);
    invoiceId = inv.body.id;
  });

  it("settles the oldest invoices first and keeps overpayments on account", async () => {
    const old = await http().post("/api/v1/finance/invoices").set(as()).send({
      customerId: customer, date: daysAgo(75), dueDate: daysAgo(45), lines: [{ description: "Site survey", qty: "1", unitPrice: "1000", taxCode: "ZERO" }],
    }).expect(201);
    await http().post(`/api/v1/finance/invoices/${old.body.id}/post`).set(as()).expect(200);

    const r1 = await http().post("/api/v1/finance/receipts").set(as()).send({ customerId: customer, amount: "3000", reference: "TT-1" }).expect(201);
    expect(r1.body).toMatchObject({ number: expect.stringMatching(/^RCT-/), unallocated: 0 });
    expect(r1.body.allocations).toEqual([{ invoiceId: old.body.id, amount: 100_000 }, { invoiceId, amount: 200_000 }]);
    expect((await http().get(`/api/v1/finance/invoices/${old.body.id}`).set(as()).expect(200)).body.status).toBe("paid");
    expect((await http().get(`/api/v1/finance/invoices/${invoiceId}`).set(as()).expect(200)).body).toMatchObject({ status: "partially_paid", balanceDue: 390_000 });
    expect(await balanceOf("1120")).toBe(300_000);

    await http().post("/api/v1/finance/receipts").set(as()).send({ customerId: customer, amount: "100", allocations: [{ invoiceId, amount: "5000" }] }).expect(400);
    const r2 = await http().post("/api/v1/finance/receipts").set(as()).send({ customerId: customer, amount: "5000" }).expect(201);
    expect(r2.body).toMatchObject({ unallocated: 110_000, allocations: [{ invoiceId, amount: 390_000 }] });
    expect((await http().get(`/api/v1/finance/invoices/${invoiceId}`).set(as()).expect(200)).body.status).toBe("paid");
    expect(await balanceOf("1200")).toBe(-110_000);
  });

  it("ages open balances by how late they are", async () => {
    const late = await http().post("/api/v1/finance/invoices").set(as()).send({
      customerId: customer, date: daysAgo(80), dueDate: daysAgo(50), lines: [{ description: "Consulting", qty: "2", unitPrice: "2500", taxCode: "ZERO" }],
    }).expect(201);
    await http().post(`/api/v1/finance/invoices/${late.body.id}/post`).set(as()).expect(200);
    const ageing = (await http().get("/api/v1/finance/receivables/ageing").set(as()).expect(200)).body;
    const row = ageing.lines.find((l: { customerId: string }) => l.customerId === customer);
    expect(row).toMatchObject({ buckets: { current: 0, "1-30": 0, "31-60": 500_000, "61-90": 0, "90+": 0 }, credits: 110_000, total: 390_000 });
  });

  it("credits, applies credit notes and writes off what is left", async () => {
    const late = (await http().get(`/api/v1/finance/invoices?where=customerId:${customer}&limit=50`).set(as()).expect(200)).body.items
      .find((i: { lines: { description: string }[] }) => i.lines[0]?.description === "Consulting");
    const cn = await http().post("/api/v1/finance/invoices").set(as()).send({
      customerId: customer, kind: "credit_note", creditedInvoiceId: late.id, lines: [{ description: "Discount agreed", qty: "1", unitPrice: "1000", taxCode: "ZERO" }],
    }).expect(201);
    expect(cn.body.number).toMatch(/^CN-/);
    await http().post(`/api/v1/finance/invoices/${cn.body.id}/post`).set(as()).expect(200);
    expect(await balanceOf("4200")).toBe(-100_000);
    await http().post(`/api/v1/finance/invoices/${cn.body.id}/apply-credit`).set(as()).send({ invoiceId: late.id, amount: "2000" }).expect(400);
    const applied = await http().post(`/api/v1/finance/invoices/${cn.body.id}/apply-credit`).set(as()).send({ invoiceId: late.id, amount: "1000" }).expect(200);
    expect(applied.body.creditNote.status).toBe("paid");
    expect(applied.body.invoice).toMatchObject({ status: "partially_paid", balanceDue: 400_000 });

    const bad = await http().post("/api/v1/finance/accounts").set(as()).send({ code: "6800", name: "Bad debts", type: "expense", parentId: acct["6000"] }).expect(201);
    const wo = await http().post(`/api/v1/finance/invoices/${late.id}/write-off`).set(as()).send({ accountId: bad.body.id, reason: "Customer dispute" }).expect(200);
    expect(wo.body).toMatchObject({ status: "written_off", balanceDue: 0 });
    expect(await balanceOf("6800")).toBe(400_000);
  });

  it("produces a statement with a running balance", async () => {
    const st = (await http().get(`/api/v1/finance/receivables/statement/${customer}`).set(as()).expect(200)).body;
    expect(st.customer.name).toBe("Perera Hardware");
    // Invoices 5,900 + 1,000 + 5,000; credit note 1,000; receipts 8,000; write-off 4,000 → 1,100 in credit.
    expect(st.balance).toBe(-110_000);
    expect(st.lines.at(-1).balance).toBe(-110_000);
  });

  it("invoices deliveries and credits returns automatically when switched on", async () => {
    await http().put("/api/v1/finance/settings").set(as()).send({ autoInvoiceDeliveries: true }).expect(200);
    const dn = await dispatch("2");
    const invs = (await http().get(`/api/v1/finance/invoices?where=status:posted&limit=50`).set(as()).expect(200)).body.items.filter((i: { deliveryId: string }) => i.deliveryId === dn);
    expect(invs).toHaveLength(1);
    expect(invs[0].totals.total).toBe(236_000);

    const ret = await http().post("/api/v1/sales/returns").set(as()).send({ deliveryId: dn, reason: "Wrong colour", lines: [{ deliveryLineIndex: 0, qty: "1", condition: "resellable" }] }).expect(201);
    await http().post(`/api/v1/sales/returns/${ret.body.id}/approve`).set(as()).expect(200);
    await http().post(`/api/v1/sales/returns/${ret.body.id}/receive`).set(as()).expect(200);
    await app.get(JobQueueService).drain();
    const cns = (await http().get("/api/v1/finance/invoices?where=kind:credit_note&limit=50").set(as()).expect(200)).body.items.filter((i: { returnId: string }) => i.returnId === ret.body.id);
    expect(cns).toHaveLength(1);
    expect(cns[0]).toMatchObject({ status: "posted", creditedInvoiceId: invs[0].id, totals: { total: 118_000 } });
  });
});
