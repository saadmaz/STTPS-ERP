import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";
import { advanceInvoiceSchedule } from "../../src/finance/ar-extras.js";

describe("Finance: recurring invoices and dunning", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${t.token("admin")}`, "x-company-id": t.companyId });
  const now = new Date();
  const monthStart = (back: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  let customer: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: monthStart(3), months: 12 }).expect(201);
    customer = (await http().post("/api/v1/crm/accounts").set(as())
      .send({ name: "Lanka Subscriptions", email: "ap@lankasubs.lk", ownerUserId: `${t.tenantId}_admin` }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("advances invoice schedules to the same day, clamped to month end", () => {
    expect(advanceInvoiceSchedule("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceInvoiceSchedule("2026-11-15", "quarterly")).toBe("2027-02-15");
    expect(advanceInvoiceSchedule("2028-02-29", "yearly")).toBe("2029-02-28");
  });

  it("generates and posts recurring invoices that are due, catching up, once", async () => {
    const r = await http().post("/api/v1/finance/recurring-invoices").set(as()).send({
      code: "SUB-1", customerId: customer, frequency: "monthly", startDate: monthStart(2),
      lines: [{ description: "Monthly support plan", qty: "1", unitPrice: "5000", taxCode: "VAT" }],
    }).expect(201);
    expect(r.body).toMatchObject({ status: "active", nextRunDate: monthStart(2), runs: 0, autoPost: true });

    const run = await http().post("/api/v1/finance/recurring-invoices/run-due").set(as()).send({}).expect(200);
    expect(run.body.created).toHaveLength(3);
    expect(run.body.failed).toEqual([]);
    expect((await http().post("/api/v1/finance/recurring-invoices/run-due").set(as()).send({}).expect(200)).body.created).toHaveLength(0);

    const updated = (await http().get(`/api/v1/finance/recurring-invoices/${r.body.id}`).set(as()).expect(200)).body;
    expect(updated).toMatchObject({ runs: 3, nextRunDate: monthStart(-1), lastInvoiceId: expect.any(String) });

    const invs = (await http().get(`/api/v1/finance/invoices?where=customerId:${customer}&limit=50`).set(as()).expect(200)).body.items
      .filter((i: { invoiceType: string }) => i.invoiceType === "recurring");
    expect(invs).toHaveLength(3);
    expect(invs.every((i: { status: string; recurringScheduleId: string }) => i.status === "posted" && i.recurringScheduleId === r.body.id)).toBe(true);
    expect(invs[0].totals).toEqual({ subtotal: 500_000, discount: 0, tax: 90_000, total: 590_000 });
  });

  it("raises dunning levels and queues a reminder email for an overdue invoice, once per level", async () => {
    const old = await http().post("/api/v1/finance/invoices").set(as()).send({
      customerId: customer, date: daysAgo(40), dueDate: daysAgo(35), lines: [{ description: "Setup fee", qty: "1", unitPrice: "2000", taxCode: "ZERO" }],
    }).expect(201);
    await http().post(`/api/v1/finance/invoices/${old.body.id}/post`).set(as()).expect(200);

    const run = await http().post("/api/v1/finance/receivables/send-reminders").set(as()).send({}).expect(200);
    const row = run.body.notified.find((n: { invoiceId: string }) => n.invoiceId === old.body.id);
    expect(row).toMatchObject({ level: 2, daysLate: 35 });
    await app.get(JobQueueService).drain();
    expect((await http().get(`/api/v1/finance/invoices/${old.body.id}`).set(as()).expect(200)).body).toMatchObject({ dunningLevel: 2 });

    const again = await http().post("/api/v1/finance/receivables/send-reminders").set(as()).send({}).expect(200);
    expect(again.body.notified.find((n: { invoiceId: string }) => n.invoiceId === old.body.id)).toBeUndefined();
  });
});
