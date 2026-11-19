import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";

describe("Finance: payables from bill to payment", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  let supplier: string;
  let cement: string;
  let orderId: string;
  let receiptId: string;
  let orderLineId: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["finance.bill.view", "finance.bill.create", "finance.bill.edit"]);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    for (const a of (await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200)).body.items) acct[a.code] = a.id;
    await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: `${month}-01`, months: 12 }).expect(201);
    const wh = (await http().post("/api/v1/inventory/warehouses").set(as()).send({ code: "WH", name: "Main" }).expect(201)).body.id;
    cement = (await http().post("/api/v1/products/items").set(as()).send({ name: "Cement", purchasePrice: "2000" }).expect(201)).body.id;
    supplier = (await http().post("/api/v1/procurement/suppliers").set(as()).send({ name: "Acme Supplies", paymentTermsDays: 45 }).expect(201)).body.id;
    const po = await http().post("/api/v1/procurement/orders").set(as()).send({ supplierId: supplier, warehouseId: wh, lines: [{ productId: cement, qty: "10" }] }).expect(201);
    await http().post(`/api/v1/procurement/orders/${po.body.id}/submit`).set(as()).expect(200);
    orderId = po.body.id;
    orderLineId = po.body.lines[0].lineId;
    const grn = await http().post("/api/v1/procurement/receipts").set(as()).send({ orderId, lines: [{ orderLineId, received: "10", rejected: "2", rejectReason: "Wet" }] }).expect(201);
    await http().post(`/api/v1/procurement/receipts/${grn.body.id}/post`).set(as()).expect(200);
    receiptId = grn.body.id;
    await app.get(JobQueueService).drain();
  });
  afterAll(async () => {
    await app?.close();
  });

  const balanceOf = async (code: string) => (await http().get(`/api/v1/finance/reports/trial-balance?to=${month}`).set(as()).expect(200)).body.lines.find((l: { code: string }) => l.code === code)?.balance ?? 0;

  let billId: string;

  it("bills a goods receipt at the order price and clears goods received not invoiced", async () => {
    expect(await balanceOf("1300")).toBe(8 * 200_000);
    expect(await balanceOf("2150")).toBe(8 * 200_000);
    const bill = await http().post(`/api/v1/finance/bills/from-receipt/${receiptId}`).set(as("viewer")).send({ supplierInvoiceNo: "ACME-1001" }).expect(200);
    expect(bill.body).toMatchObject({ number: expect.stringMatching(/^BILL-/), status: "draft", orderId, receiptId, match: { status: "matched", issues: [] } });
    expect(bill.body.totals).toEqual({ subtotal: 1_600_000, tax: 288_000, total: 1_888_000 });
    expect(bill.body.dueDate > today).toBe(true);
    const dup = await http().post(`/api/v1/finance/bills/from-receipt/${receiptId}`).set(as()).send({ supplierInvoiceNo: "acme-1001" }).expect(409);
    expect(JSON.stringify(dup.body)).toContain("supplierInvoiceKey");
    await http().post(`/api/v1/finance/bills/${bill.body.id}/post`).set(as("viewer")).send({}).expect(200);
    expect(await balanceOf("2150")).toBe(0);
    expect(await balanceOf("1400")).toBe(288_000);
    expect(await balanceOf("2100")).toBe(1_888_000);
    billId = bill.body.id;
  });

  it("holds bills that do not match until someone with override rights gives a reason", async () => {
    const over = await http().post("/api/v1/finance/bills").set(as("viewer")).send({
      supplierId: supplier, supplierInvoiceNo: "ACME-1002", orderId, lines: [{ orderLineId, qty: "2", unitPrice: "2100" }],
    }).expect(201);
    expect(over.body.match.status).toBe("variance");
    expect(over.body.match.issues).toEqual([expect.stringContaining("billed at 2100.00, ordered at 2000.00"), expect.stringContaining("10 billed but 8 received")]);
    const blocked = await http().post(`/api/v1/finance/bills/${over.body.id}/post`).set(as("viewer")).send({}).expect(400);
    expect(blocked.body.message).toContain("does not match");
    await http().post(`/api/v1/finance/bills/${over.body.id}/post`).set(as("viewer")).send({ overrideReason: "Agreed" }).expect(403);
    await http().post(`/api/v1/finance/bills/${over.body.id}/post`).set(as()).send({ overrideReason: "Late delivery of rejected bags agreed" }).expect(200);
    expect(await balanceOf("5300")).toBe(2 * 10_000);
    expect(await balanceOf("2150")).toBe(-2 * 200_000);
  });

  it("books expense bills, debit notes and pays due bills in one run", async () => {
    await http().post("/api/v1/finance/bills").set(as()).send({ supplierId: supplier, supplierInvoiceNo: "R-1", lines: [{ description: "Office rent", qty: "1", unitPrice: "1000" }] }).expect(400);
    const rent = await http().post("/api/v1/finance/bills").set(as()).send({
      supplierId: supplier, supplierInvoiceNo: "R-1", dueDate: today, lines: [{ description: "Office rent", qty: "1", unitPrice: "50000", taxCode: "ZERO", accountId: acct["6200"] }],
    }).expect(201);
    expect(rent.body.match.status).toBe("not_applicable");
    await http().post(`/api/v1/finance/bills/${rent.body.id}/post`).set(as()).send({}).expect(200);
    expect(await balanceOf("6200")).toBe(5_000_000);

    const dn = await http().post("/api/v1/finance/bills").set(as()).send({
      supplierId: supplier, supplierInvoiceNo: "CR-7", kind: "debit_note", creditedBillId: rent.body.id, lines: [{ description: "Rent rebate", qty: "1", unitPrice: "5000", taxCode: "ZERO", accountId: acct["6200"] }],
    }).expect(201);
    expect(dn.body.number).toMatch(/^DN-/);
    await http().post(`/api/v1/finance/bills/${dn.body.id}/post`).set(as()).send({}).expect(200);
    const applied = await http().post(`/api/v1/finance/bills/${dn.body.id}/apply-debit`).set(as()).send({ billId: rent.body.id, amount: "5000" }).expect(200);
    expect(applied.body.bill).toMatchObject({ status: "partially_paid", balanceDue: 4_500_000 });
    expect(await balanceOf("6200")).toBe(4_500_000);

    const due = (await http().get("/api/v1/finance/payables/due").set(as()).expect(200)).body;
    expect(due.map((b: { id: string }) => b.id)).toEqual([rent.body.id]);
    const ageing = (await http().get("/api/v1/finance/payables/ageing").set(as()).expect(200)).body;
    expect(ageing.lines[0]).toMatchObject({ supplierId: supplier, total: 1_888_000 + 495_600 + 4_500_000 });

    const run = await http().post("/api/v1/finance/payments/run").set(as()).send({ billIds: [billId, rent.body.id] }).expect(200);
    expect(run.body.payments).toHaveLength(1);
    expect(run.body.payments[0]).toMatchObject({ number: expect.stringMatching(/^PAY-/), amount: 1_888_000 + 4_500_000, unallocated: 0, runId: run.body.runId });
    expect((await http().get(`/api/v1/finance/bills/${billId}`).set(as()).expect(200)).body.status).toBe("paid");
    expect(await balanceOf("1120")).toBe(-(1_888_000 + 4_500_000));
    expect(await balanceOf("2100")).toBe(495_600);
  });

  it("keeps advances on account and shows a supplier statement", async () => {
    const pay = await http().post("/api/v1/finance/payments").set(as()).send({ supplierId: supplier, amount: "10000", reference: "CHQ 55" }).expect(201);
    expect(pay.body).toMatchObject({ allocations: [{ amount: 495_600 }], unallocated: 504_400 });
    expect(await balanceOf("2100")).toBe(-504_400);
    const st = (await http().get(`/api/v1/finance/payables/statement/${supplier}`).set(as()).expect(200)).body;
    expect(st.balance).toBe(-504_400);
    expect(st.lines.map((l: { type: string }) => l.type)).toEqual(expect.arrayContaining(["bill", "debit_note", "payment"]));
  });

  it("resolves a bill's tax rate by its own date, so a scheduled change applies only from its effective date", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await http().put("/api/v1/sales/settings").set(as()).send({
      taxRates: [{ code: "VAT", name: "VAT 18%", rate: "18", effectiveRates: [{ rate: "20", effectiveDate: tomorrow }] }, { code: "ZERO", name: "Zero rated", rate: "0" }],
    }).expect(200);
    const current = await http().post("/api/v1/finance/bills").set(as()).send({ supplierId: supplier, supplierInvoiceNo: "R-2", lines: [{ description: "Office rent", qty: "1", unitPrice: "1000", taxCode: "VAT", accountId: acct["6200"] }] }).expect(201);
    expect(current.body.lines[0]).toMatchObject({ taxRate: 1800, tax: 18_000 });
    const scheduled = await http().post("/api/v1/finance/bills").set(as()).send({ supplierId: supplier, supplierInvoiceNo: "R-3", date: tomorrow, lines: [{ description: "Office rent", qty: "1", unitPrice: "1000", taxCode: "VAT", accountId: acct["6200"] }] }).expect(201);
    expect(scheduled.body.lines[0]).toMatchObject({ taxRate: 2000, tax: 20_000 });
    await http().put("/api/v1/sales/settings").set(as()).send({ taxRates: [{ code: "VAT", name: "VAT 18%", rate: "18" }, { code: "ZERO", name: "Zero rated", rate: "0" }] }).expect(200);
  });
});
