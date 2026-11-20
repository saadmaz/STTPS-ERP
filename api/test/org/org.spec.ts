import { describe, expect, it } from "vitest";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { AuditService } from "../../src/platform/audit/audit.service.js";
import { UniqueService } from "../../src/platform/data/unique.service.js";
import {
  buildPeriods,
  CostCentreService,
  DepartmentService,
  ExchangeRateService,
  FiscalYearService,
  invertRate,
} from "../../src/org/org.services.js";
import { firestore, testContext } from "../helpers.js";

function services() {
  const fs = firestore();
  const audit = new AuditService(fs);
  const unique = new UniqueService(fs);
  return {
    costCentres: new CostCentreService(fs, audit, unique),
    departments: new DepartmentService(fs, audit, unique),
    fiscal: new FiscalYearService(fs, audit, unique),
    rates: new ExchangeRateService(fs, audit, unique),
  };
}

describe("org master data", () => {
  it("rejects duplicate codes case-insensitively but allows renaming a code", async () => {
    const { costCentres } = services();
    const ctx = testContext();
    const a = await costCentres.create(ctx, { code: "OPS", name: "Operations" });
    await expect(costCentres.create(ctx, { code: "ops", name: "Other" })).rejects.toBeInstanceOf(ConflictException);
    await costCentres.update(ctx, a.id, { code: "OPS2" });
    const again = await costCentres.create(ctx, { code: "OPS", name: "Reused after rename" });
    expect(again.code).toBe("OPS");
    // The same code is free in another company.
    await expect(costCentres.create(testContext(), { code: "OPS2", name: "Elsewhere" })).resolves.toBeTruthy();
  });

  it("rejects hierarchy cycles and unknown references", async () => {
    const { costCentres, departments } = services();
    const ctx = testContext();
    const root = await costCentres.create(ctx, { code: "ROOT", name: "Root" });
    const child = await costCentres.create(ctx, { code: "CHILD", name: "Child", parentId: root.id });
    await expect(costCentres.update(ctx, root.id, { parentId: child.id })).rejects.toBeInstanceOf(BadRequestException);
    await expect(departments.create(ctx, { code: "D1", name: "Dept", branchId: "missing" })).rejects.toThrow("Branch not found");
    const foreign = await costCentres.create(testContext(), { code: "X", name: "Other company" });
    await expect(departments.create(ctx, { code: "D2", name: "Dept", costCentreId: foreign.id })).rejects.toThrow("Cost centre not found");
  });

  it("writes an audit entry per change", async () => {
    const { costCentres } = services();
    const ctx = testContext();
    const cc = await costCentres.create(ctx, { code: "A", name: "A" });
    await costCentres.update(ctx, cc.id, { name: "B" });
    await costCentres.archive(ctx, cc.id, "merged");
    const history = await costCentres.history(ctx, cc.id);
    expect(history.map((h) => h.action)).toEqual(["archived", "updated", "created"]);
    expect(history[0]!.reason).toBe("merged");
    expect(history[1]).toMatchObject({ before: { name: "A" }, after: { name: "B" } });
  });
});

describe("fiscal calendar", () => {
  it("builds monthly periods across a year boundary", () => {
    const periods = buildPeriods("2026-04-01", 12);
    expect(periods[0]).toMatchObject({ number: 1, startDate: "2026-04-01", endDate: "2026-04-30", name: "Apr 2026" });
    expect(periods[10]).toMatchObject({ startDate: "2027-02-01", endDate: "2027-02-28" });
    expect(periods[11]!.endDate).toBe("2027-03-31");
  });

  it("rejects overlapping years and enforces period status for postings", async () => {
    const { fiscal } = services();
    const ctx = testContext({ allPermissions: false, permissions: new Set() });
    const year = await fiscal.create(ctx, { code: "FY26", startDate: "2026-04-01" });
    await expect(fiscal.create(ctx, { code: "FY26B", startDate: "2027-01-01" })).rejects.toThrow("Overlaps fiscal year FY26");

    expect((await fiscal.assertPostable(ctx, "2026-11-19")).name).toBe("Nov 2026");
    await expect(fiscal.assertPostable(ctx, "2028-01-01")).rejects.toThrow("No fiscal period");

    await fiscal.setPeriodStatus(ctx, year.id, 8, "soft_closed");
    await expect(fiscal.assertPostable(ctx, "2026-11-19")).rejects.toBeInstanceOf(ForbiddenException);
    const closer = { ...ctx, permissions: new Set(["org.fiscalYear.close"]) };
    expect((await fiscal.assertPostable(closer, "2026-11-19")).status).toBe("soft_closed");

    await fiscal.setPeriodStatus(ctx, year.id, 8, "locked");
    await expect(fiscal.assertPostable(closer, "2026-11-19")).rejects.toThrow("locked");
  });
});

describe("exchange rates", () => {
  it("finds the latest effective rate and falls back to the inverse pair", async () => {
    const { rates } = services();
    const ctx = testContext();
    await rates.create(ctx, { fromCurrency: "USD", toCurrency: "LKR", rate: "300", effectiveDate: "2026-01-01" });
    await rates.create(ctx, { fromCurrency: "USD", toCurrency: "LKR", rate: "297.5", effectiveDate: "2026-06-01" });
    expect(await rates.rateOn(ctx, "USD", "LKR", "2026-03-15")).toBe("300");
    expect(await rates.rateOn(ctx, "USD", "LKR", "2026-11-19")).toBe("297.5");
    expect(await rates.rateOn(ctx, "LKR", "USD", "2026-11-19")).toBe(invertRate("297.5"));
    expect(await rates.rateOn(ctx, "USD", "LKR", "2025-12-31")).toBeNull();
    expect(await rates.rateOn(ctx, "LKR", "LKR", "2026-11-19")).toBe("1");
  });

  it("inverts rates exactly", () => {
    expect(invertRate("4")).toBe("0.25");
    expect(invertRate("297.5")).toBe("0.0033613445");
    expect(invertRate("0.5")).toBe("2");
  });
});
