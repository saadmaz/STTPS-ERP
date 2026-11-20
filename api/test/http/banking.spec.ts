import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { parseAmount, parseCsv, parseDate, parseOfx } from "../../src/finance/bank.services.js";

describe("Finance: banking, statements and reconciliation", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${t.token("admin")}`, "x-company-id": t.companyId });
  const acct: Record<string, string> = {};
  const day = (n: number) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCDate(n);
    return d.toISOString().slice(0, 10);
  };
  const month = day(1).slice(0, 7);

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, []);
    await http().post("/api/v1/finance/setup").set(as()).send({}).expect(200);
    for (const a of (await http().get("/api/v1/finance/accounts?limit=200").set(as()).expect(200)).body.items) acct[a.code] = a.id;
    await http().post("/api/v1/org/fiscal-years").set(as()).send({ code: "FY", startDate: `${month}-01`, months: 12 }).expect(201);
    const journal = async (date: string, dr: string, cr: string, amount: string, memo: string) => {
      const j = await http().post("/api/v1/finance/journals").set(as()).send({ date, memo, lines: [{ accountId: acct[dr], debit: amount, description: memo }, { accountId: acct[cr], credit: amount, description: memo }] }).expect(201);
      await http().post(`/api/v1/finance/journals/${j.body.id}/post`).set(as()).expect(200);
    };
    await journal(day(1), "1120", "3100", "100000", "Capital");
    await journal(day(3), "6200", "1120", "2000", "Rent");
    await journal(day(6), "1120", "4300", "750", "Sundry income");
  });
  afterAll(async () => {
    await app?.close();
  });

  it("reads amounts, dates and statement files", () => {
    expect(parseAmount("1,234.50")).toBe(123_450);
    expect(parseAmount("(12.00)")).toBe(-1_200);
    expect(parseAmount("25.00 DR")).toBe(-2_500);
    expect(parseDate("19/11/2026", "DMY")).toBe("2026-11-19");
    expect(parseDate("11/19/2026", "MDY")).toBe("2026-11-19");
    expect(parseDate("20261119120000")).toBe("2026-11-19");
    const csv = parseCsv('Date;Narration;Amount\n2026-11-02;"Payment, thanks";-10.5\n', "YMD");
    expect(csv).toEqual([{ date: "2026-11-02", description: "Payment, thanks", reference: null, amount: -1_050 }]);
    const ofx = parseOfx("<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103<TRNAMT>-99.90<FITID>A1<NAME>Fuel</STMTTRN></OFX>");
    expect(ofx).toEqual([{ date: "2026-11-03", description: "Fuel", reference: "A1", amount: -9_990 }]);
    expect(() => parseCsv("Foo,Bar\n1,2")).toThrow("date column");
  });

  it("transfers between bank and cash", async () => {
    await http().post("/api/v1/finance/bank/transfers").set(as()).send({ fromAccountId: acct["1120"], toAccountId: acct["1110"], amount: "5000", date: day(4) }).expect(200);
    await http().post("/api/v1/finance/bank/transfers").set(as()).send({ fromAccountId: acct["1120"], toAccountId: acct["6200"], amount: "1" }).expect(400);
    const accounts = (await http().get("/api/v1/finance/bank/accounts").set(as()).expect(200)).body;
    expect(accounts.find((a: { code: string }) => a.code === "1110").balance).toBe(500_000);
    expect(accounts.find((a: { code: string }) => a.code === "1120").balance).toBe(10_000_000 - 200_000 - 500_000 + 75_000);
  });

  it("imports a statement, matches exact amounts and skips duplicates", async () => {
    const csv = [
      "Date,Description,Debit,Credit,Reference",
      `${day(1)},Capital deposit,,"100,000.00",DEP1`,
      `${day(4)},Cheque 1001,2000.00,,CHQ1001`,
      `${day(4)},Transfer to petty cash,5000.00,,`,
      `${day(5)},Service charge,25.00,,`,
    ].join("\n");
    const res = await http().post("/api/v1/finance/bank/statements").set(as()).send({ accountId: acct["1120"], format: "csv", content: csv }).expect(200);
    expect(res.body).toMatchObject({ imported: 4, duplicates: 0, matched: 3 });
    const again = await http().post("/api/v1/finance/bank/statements").set(as()).send({ accountId: acct["1120"], format: "csv", content: csv }).expect(200);
    expect(again.body).toMatchObject({ imported: 0, duplicates: 4, matched: 0 });
    await http().post("/api/v1/finance/bank/statements").set(as()).send({ accountId: acct["6200"], format: "csv", content: csv }).expect(400);

    const unmatched = (await http().get(`/api/v1/finance/bank/${acct["1120"]}/lines?status=unmatched`).set(as()).expect(200)).body;
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]).toMatchObject({ description: "Service charge", amount: -2_500 });
    const created = await http().post(`/api/v1/finance/bank/lines/${unmatched[0].id}/create`).set(as()).send({ accountId: acct["6500"] }).expect(200);
    expect(created.body.line).toMatchObject({ status: "matched", matchedBy: "created" });
    expect((await http().get(`/api/v1/finance/reports/trial-balance?to=${month}`).set(as()).expect(200)).body.lines.find((l: { code: string }) => l.code === "6500").balance).toBe(2_500);
  });

  it("matches manually and reconciles to the statement balance", async () => {
    const ofx = `<OFX><STMTTRN><DTPOSTED>${day(7).replace(/-/g, "")}<TRNAMT>750.00<FITID>X9<NAME>Sundry</STMTTRN></OFX>`;
    const imported = await http().post("/api/v1/finance/bank/statements").set(as()).send({ accountId: acct["1120"], format: "ofx", content: ofx }).expect(200);
    expect(imported.body.matched).toBe(1);
    const line = (await http().get(`/api/v1/finance/bank/${acct["1120"]}/lines?status=matched`).set(as()).expect(200)).body.find((l: { reference: string }) => l.reference === "X9");
    await http().post(`/api/v1/finance/bank/lines/${line.id}/unmatch`).set(as()).expect(200);
    const entries = (await http().get(`/api/v1/finance/bank/${acct["1120"]}/unmatched-entries`).set(as()).expect(200)).body;
    expect(entries.map((e: { amount: number }) => e.amount)).toEqual([75_000]);
    await http().post(`/api/v1/finance/bank/lines/${line.id}/match`).set(as()).send({ entryIds: [entries[0].id] }).expect(200);
    await http().post(`/api/v1/finance/bank/lines/${line.id}/match`).set(as()).send({ entryIds: [entries[0].id] }).expect(400);

    // A cheque written but not yet presented stays outstanding.
    const j = await http().post("/api/v1/finance/journals").set(as()).send({ date: day(8), lines: [{ accountId: acct["6300"], debit: "300" }, { accountId: acct["1120"], credit: "300" }] }).expect(201);
    await http().post(`/api/v1/finance/journals/${j.body.id}/post`).set(as()).expect(200);

    const wrong = await http().post("/api/v1/finance/bank/reconciliations").set(as()).send({ accountId: acct["1120"], statementDate: day(9), statementBalance: "93000" }).expect(400);
    expect(wrong.body.message).toContain("93725");
    const rec = await http().post("/api/v1/finance/bank/reconciliations").set(as()).send({ accountId: acct["1120"], statementDate: day(9), statementBalance: "93725.00" }).expect(200);
    expect(rec.body).toMatchObject({ clearedBalance: 9_372_500, bookBalance: 9_342_500 });
    expect(rec.body.outstanding.map((o: { amount: number }) => o.amount)).toEqual([-30_000]);
    await http().post(`/api/v1/finance/bank/lines/${line.id}/unmatch`).set(as()).expect(400);
    const history = (await http().get(`/api/v1/finance/bank/${acct["1120"]}/reconciliations`).set(as()).expect(200)).body;
    expect(history).toHaveLength(1);
  });
});
