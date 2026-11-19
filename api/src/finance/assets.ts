import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from "class-validator";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { validated } from "../platform/crud/master-data.controller.js";
import { fromMinor, toMinor } from "../platform/data/money.js";
import { BaseDoc, NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { AccountDoc, FINANCE_COLLECTIONS } from "./finance.models.js";
import { GeneralLedger, LineInput } from "./ledger.service.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const MONTH = /^\d{4}-\d{2}$/;
const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);

export const ASSET_COLLECTIONS = { categories: "assetCategories", assets: "fixedAssets" } as const;
type Method = "straight_line" | "declining_balance" | "none";

// ─── Model ────────────────────────────────────────────────────────────────────

export interface AssetCategoryDoc extends BaseDoc {
  code: string;
  name: string;
  assetAccountId: string;
  accumulatedAccountId: string;
  expenseAccountId: string;
  method: Method;
  usefulLifeMonths: number;
  /** Declining balance: annual rate in hundredths of a percent (2500 = 25%). */
  decliningRate: number | null;
}

export interface AssetDoc extends BaseDoc {
  code: string;
  name: string;
  categoryId: string;
  serialNo: string | null;
  branchId: string | null;
  departmentId: string | null;
  custodianId: string | null;
  location: string | null;
  acquisitionDate: string;
  inServiceDate: string;
  cost: number;
  residualValue: number;
  method: Method;
  usefulLifeMonths: number;
  decliningRate: number | null;
  accumulatedDepreciation: number;
  impairment: number;
  bookValue: number;
  /** Last month depreciated (YYYY-MM), or null. */
  lastDepreciatedPeriod: string | null;
  status: "draft" | "active" | "fully_depreciated" | "disposed";
  capitalisationJournalId: string | null;
  history: { date: string; event: string; detail: string; journalId: string | null; by: string }[];
  disposal: { date: string; proceeds: number; gainOrLoss: number; journalId: string } | null;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class CreateAssetCategoryDto {
  @ApiProperty() @IsString() @Length(1, 30) @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/) code!: string;
  @ApiProperty() @IsString() @Length(1, 120) name!: string;
  @ApiProperty() @IsString() assetAccountId!: string;
  @ApiProperty() @IsString() accumulatedAccountId!: string;
  @ApiProperty() @IsString() expenseAccountId!: string;
  @IsOptional() @IsIn(["straight_line", "declining_balance", "none"]) method?: Method;
  @ApiProperty({ example: 60 }) @IsInt() @Min(1) @Max(1200) usefulLifeMonths!: number;
  @IsOptional() @IsInt() @Min(1) @Max(10_000) decliningRate?: number;
}
export class UpdateAssetCategoryDto extends PartialType(CreateAssetCategoryDto) {}

export class CreateAssetDto {
  @ApiPropertyOptional({ description: "Blank to number automatically (FA-000001)" }) @IsOptional() @IsString() @Length(1, 30) code?: string;
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @ApiProperty() @IsString() categoryId!: string;
  @IsOptional() @IsString() @MaxLength(80) serialNo?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() custodianId?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsISO8601({ strict: true }) acquisitionDate?: string;
  @IsOptional() @IsISO8601({ strict: true }) inServiceDate?: string;
  @ApiProperty({ example: "1200000.00" }) @Matches(MONEY) cost!: string;
  @IsOptional() @Matches(MONEY) residualValue?: string;
  @ApiPropertyOptional({ description: "Defaults from the category" }) @IsOptional() @IsInt() @Min(1) @Max(1200) usefulLifeMonths?: number;
}
export class UpdateAssetDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsString() @MaxLength(80) serialNo?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
}

export class CapitaliseDto {
  @ApiPropertyOptional({ description: "Account to credit (bank, payable clearing). Omit when a supplier bill already debited the asset account." })
  @IsOptional() @IsString() creditAccountId?: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
}
export class DepreciationRunDto {
  @ApiProperty({ example: "2026-11" }) @Matches(MONTH) period!: string;
}
export class ImpairDto {
  @ApiProperty() @Matches(MONEY) amount!: string;
  @ApiProperty({ description: "Expense account for the impairment loss" }) @IsString() accountId!: string;
  @IsString() @Length(1, 500) reason!: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
}
export class DisposeDto {
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @ApiProperty({ example: "250000.00" }) @Matches(MONEY) proceeds!: string;
  @ApiPropertyOptional({ description: "Where the proceeds went; required when there are proceeds" }) @IsOptional() @IsString() proceedsAccountId?: string;
  @ApiProperty({ description: "Account for the gain or loss on disposal" }) @IsString() gainLossAccountId!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class TransferAssetDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() custodianId?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
}

// ─── Depreciation maths ───────────────────────────────────────────────────────

export const nextMonth = (p: string) => {
  const [y, m] = p.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** Depreciation for the next month, never taking book value below residual value. */
export function monthlyCharge(a: Pick<AssetDoc, "cost" | "residualValue" | "method" | "usefulLifeMonths" | "decliningRate" | "accumulatedDepreciation" | "impairment">, monthsDone: number): number {
  const book = a.cost - a.accumulatedDepreciation - a.impairment;
  const room = Math.max(0, book - a.residualValue);
  if (room === 0 || a.method === "none") return 0;
  if (a.method === "declining_balance") return Math.min(room, Math.round((book * (a.decliningRate ?? 0)) / 10_000 / 12));
  const remaining = Math.max(1, a.usefulLifeMonths - monthsDone);
  return Math.min(room, Math.round(room / remaining));
}

const monthsBetween = (fromMonth: string, toMonth: string) => {
  const [fy, fm] = fromMonth.split("-").map(Number) as [number, number];
  const [ty, tm] = toMonth.split("-").map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
};

// ─── Services ─────────────────────────────────────────────────────────────────

@Injectable()
export class AssetCategoryService extends MasterDataService<AssetCategoryDoc, CreateAssetCategoryDto, UpdateAssetCategoryDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "assets", entity: "category", label: "Asset category", collection: ASSET_COLLECTIONS.categories, route: "/assets/categories", uniqueFields: ["code"], customFields: false,
    });
  }

  protected toNew(dto: CreateAssetCategoryDto): NewDoc<AssetCategoryDoc> {
    if ((dto.method ?? "straight_line") === "declining_balance" && !dto.decliningRate) throw new BadRequestException("Give the declining-balance rate");
    return { ...dto, name: dto.name.trim(), method: dto.method ?? "straight_line", decliningRate: dto.decliningRate ?? null };
  }

  protected toPatch(dto: UpdateAssetCategoryDto): Patch<AssetCategoryDoc> {
    return { ...dto } as Patch<AssetCategoryDoc>;
  }

  protected async validate(tx: Transaction, ctx: RequestContext, next: AssetCategoryDoc): Promise<void> {
    const snaps = await tx.getAll(...[next.assetAccountId, next.accumulatedAccountId, next.expenseAccountId].map((id) => this.firestore.collection<AccountDoc>(FINANCE_COLLECTIONS.accounts).doc(id)));
    const [asset, accum, expense] = snaps.map((s) => s.data());
    const ok = (a: AccountDoc | undefined, type: string) => a && a.companyId === ctx.companyId && !a.isGroup && a.type === type;
    if (!ok(asset, "asset") || !ok(accum, "asset") || !ok(expense, "expense")) throw new BadRequestException("Choose asset accounts for cost and accumulated depreciation, and an expense account");
  }
}

@Injectable()
export class FixedAssetService extends MasterDataService<AssetDoc, CreateAssetDto & { category?: AssetCategoryDoc }, UpdateAssetDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly ledger: GeneralLedger, private readonly categories: AssetCategoryService) {
    super(fs, audit, unique, {
      module: "assets", entity: "asset", label: "Fixed asset", collection: ASSET_COLLECTIONS.assets, route: "/assets/register",
      uniqueFields: ["code"], filterFields: ["status", "categoryId", "branchId", "departmentId", "custodianId"],
      references: [{ field: "categoryId", collection: ASSET_COLLECTIONS.categories, label: "Category" }],
      large: { filters: ["status", "categoryId"], sorts: [{ field: "createdAt", direction: "desc" }, { field: "code", direction: "asc" }] },
      numbering: { field: "code", key: "fixedAsset", prefix: "FA" },
    });
  }

  async create(ctx: RequestContext, dto: CreateAssetDto & { category?: AssetCategoryDoc }): Promise<AssetDoc> {
    return super.create(ctx, { ...dto, category: await this.categories.repo.get(ctx, dto.categoryId) });
  }

  protected toNew(dto: CreateAssetDto & { category?: AssetCategoryDoc }, ctx: RequestContext): NewDoc<AssetDoc> {
    const c = dto.category!;
    const cost = toMinor(dto.cost, "LKR");
    const residual = dto.residualValue ? toMinor(dto.residualValue, "LKR") : 0;
    if (residual > cost) throw new BadRequestException("The residual value cannot exceed the cost");
    const acquired = dto.acquisitionDate?.slice(0, 10) ?? today();
    const { category: _c, cost: _cost, residualValue: _r, ...rest } = dto;
    return {
      ...rest, code: dto.code ?? "", name: dto.name.trim(), serialNo: orNull(dto.serialNo), branchId: orNull(dto.branchId), departmentId: orNull(dto.departmentId),
      custodianId: orNull(dto.custodianId), location: orNull(dto.location), acquisitionDate: acquired, inServiceDate: dto.inServiceDate?.slice(0, 10) ?? acquired,
      cost, residualValue: residual, method: c.method, usefulLifeMonths: dto.usefulLifeMonths ?? c.usefulLifeMonths, decliningRate: c.decliningRate,
      accumulatedDepreciation: 0, impairment: 0, bookValue: cost, lastDepreciatedPeriod: null, status: "draft", capitalisationJournalId: null,
      history: [{ date: acquired, event: "registered", detail: "Added to the register", journalId: null, by: ctx.userId }], disposal: null,
    };
  }

  protected toPatch(dto: UpdateAssetDto): Patch<AssetDoc> {
    return { ...dto } as Patch<AssetDoc>;
  }

  /** Puts the asset into service; posts its cost unless a supplier bill already did. */
  async capitalise(ctx: RequestContext, id: string, dto: CapitaliseDto): Promise<AssetDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const a = await this.repo.get(ctx, id, tx);
      if (a.status !== "draft") throw new BadRequestException("Already in service");
      const c = await this.categories.repo.get(ctx, a.categoryId, tx);
      const date = dto.date?.slice(0, 10) ?? a.inServiceDate;
      const plan = dto.creditAccountId
        ? await this.ledger.prepare(tx, ctx, {
            date, source: "system", memo: `Capitalise ${a.code} ${a.name}`, reference: { entityType: this.entityType, entityId: id, label: a.code },
            lines: [{ accountId: c.assetAccountId, debit: a.cost, description: a.name }, { accountId: dto.creditAccountId, credit: a.cost, description: a.name }],
          }, { withNumber: true })
        : null;
      const journal = plan?.commitNew() ?? null;
      return this.repo.applyUpdate(ctx, tx, a, {
        status: "active", capitalisationJournalId: journal?.id ?? null,
        history: [...a.history, { date, event: "capitalised", detail: journal ? `Cost ${fromMinor(a.cost, "LKR")} posted` : "Cost already posted from a bill", journalId: journal?.id ?? null, by: ctx.userId }],
      }).after;
    });
  }

  /** Planned depreciation, month by month, from where the asset is now. */
  async schedule(ctx: RequestContext, id: string) {
    const a = await this.repo.get(ctx, id);
    const start = a.lastDepreciatedPeriod ? nextMonth(a.lastDepreciatedPeriod) : a.inServiceDate.slice(0, 7);
    let done = a.lastDepreciatedPeriod ? monthsBetween(a.inServiceDate.slice(0, 7), a.lastDepreciatedPeriod) + 1 : 0;
    const sim = { ...a };
    const rows: { period: string; charge: number; accumulated: number; bookValue: number }[] = [];
    let period = start;
    for (let i = 0; i < 1200 && a.status !== "disposed"; i++) {
      const charge = monthlyCharge(sim, done);
      if (!charge) break;
      sim.accumulatedDepreciation += charge;
      done++;
      rows.push({ period, charge, accumulated: sim.accumulatedDepreciation, bookValue: sim.cost - sim.accumulatedDepreciation - sim.impairment });
      period = nextMonth(period);
    }
    return { asset: { id: a.id, code: a.code, name: a.name, method: a.method, cost: a.cost, residualValue: a.residualValue }, rows };
  }

  /**
   * Depreciates every asset in service up to the end of `period`, catching up
   * missed months, with one journal per category dated the period end.
   */
  async depreciate(ctx: RequestContext, period: string) {
    const actives = (await this.repo.collection.where("companyId", "==", ctx.companyId).where("status", "==", "active").get()).docs.map((d) => d.data()).filter((a) => !a.archivedAt);
    const byCategory = new Map<string, AssetDoc[]>();
    for (const a of actives) if (a.inServiceDate.slice(0, 7) <= period && (a.lastDepreciatedPeriod ?? "") < period) byCategory.set(a.categoryId, [...(byCategory.get(a.categoryId) ?? []), a]);
    const [y, m] = period.split("-").map(Number) as [number, number];
    const periodEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const results: { categoryId: string; journalId: string | null; assets: number; amount: number }[] = [];
    for (const [categoryId, group] of byCategory) {
      const res = await this.firestore.runTransaction(async (tx) => {
        const c = await this.categories.repo.get(ctx, categoryId, tx);
        const fresh = await this.repo.getMany(ctx, group.map((a) => a.id), tx);
        const charges = new Map<string, { charge: number; months: number }>();
        for (const a of fresh) {
          if (a.status !== "active" || (a.lastDepreciatedPeriod ?? "") >= period) continue;
          let done = a.lastDepreciatedPeriod ? monthsBetween(a.inServiceDate.slice(0, 7), a.lastDepreciatedPeriod) + 1 : 0;
          const from = a.lastDepreciatedPeriod ? nextMonth(a.lastDepreciatedPeriod) : a.inServiceDate.slice(0, 7);
          const sim = { ...a };
          let total = 0;
          for (let p = from, i = 0; p <= period && i < 1200; p = nextMonth(p), i++) {
            const charge = monthlyCharge(sim, done);
            sim.accumulatedDepreciation += charge;
            total += charge;
            done++;
          }
          charges.set(a.id, { charge: total, months: monthsBetween(from, period) + 1 });
        }
        const amount = [...charges.values()].reduce((s, x) => s + x.charge, 0);
        const plan = amount
          ? await this.ledger.prepare(tx, ctx, {
              date: periodEnd, source: "system", memo: `Depreciation ${period} · ${c.name}`, reference: { entityType: "assets.category", entityId: c.id, label: `Depreciation ${period}` },
              lines: [{ accountId: c.expenseAccountId, debit: amount, description: `Depreciation ${period}` }, { accountId: c.accumulatedAccountId, credit: amount, description: `Depreciation ${period}` }],
            }, { withNumber: true })
          : null;
        const journal = plan?.commitNew() ?? null;
        for (const a of fresh) {
          const ch = charges.get(a.id);
          if (!ch) continue;
          const accumulated = a.accumulatedDepreciation + ch.charge;
          const book = a.cost - accumulated - a.impairment;
          this.repo.applyUpdate(ctx, tx, a, {
            accumulatedDepreciation: accumulated, bookValue: book, lastDepreciatedPeriod: period, status: book <= a.residualValue && a.method !== "none" ? "fully_depreciated" : "active",
            history: ch.charge ? [...a.history, { date: periodEnd, event: "depreciated", detail: `${fromMinor(ch.charge, "LKR")} for ${ch.months} month${ch.months === 1 ? "" : "s"} to ${period}`, journalId: journal?.id ?? null, by: ctx.userId }] : a.history,
          });
        }
        return { categoryId, journalId: journal?.id ?? null, assets: charges.size, amount };
      });
      results.push(res);
    }
    return { period, categories: results, total: results.reduce((a, r) => a + r.amount, 0) };
  }

  async impair(ctx: RequestContext, id: string, dto: ImpairDto): Promise<AssetDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const a = await this.repo.get(ctx, id, tx);
      if (!["active", "fully_depreciated"].includes(a.status)) throw new BadRequestException("Only assets in service can be impaired");
      const c = await this.categories.repo.get(ctx, a.categoryId, tx);
      const amount = toMinor(dto.amount, "LKR");
      if (amount <= 0 || amount > a.bookValue) throw new BadRequestException(`At most ${fromMinor(a.bookValue, "LKR")} can be written down`);
      const date = dto.date?.slice(0, 10) ?? today();
      const plan = await this.ledger.prepare(tx, ctx, {
        date, source: "system", memo: `Impairment ${a.code}: ${dto.reason}`, reference: { entityType: this.entityType, entityId: id, label: a.code },
        lines: [{ accountId: dto.accountId, debit: amount, description: dto.reason }, { accountId: c.accumulatedAccountId, credit: amount, description: `Impairment ${a.code}` }],
      }, { withNumber: true });
      const journal = plan.commitNew();
      return this.repo.applyUpdate(ctx, tx, a, {
        impairment: a.impairment + amount, bookValue: a.bookValue - amount,
        history: [...a.history, { date, event: "impaired", detail: `${fromMinor(amount, "LKR")}: ${dto.reason}`, journalId: journal.id, by: ctx.userId }],
      }).after;
    });
  }

  /** Removes the asset: clears cost and accumulated depreciation, books proceeds and the gain or loss. */
  async dispose(ctx: RequestContext, id: string, dto: DisposeDto): Promise<AssetDoc> {
    return this.firestore.runTransaction(async (tx) => {
      const a = await this.repo.get(ctx, id, tx);
      if (!["active", "fully_depreciated"].includes(a.status)) throw new BadRequestException("Only assets in service can be disposed of");
      const c = await this.categories.repo.get(ctx, a.categoryId, tx);
      const proceeds = toMinor(dto.proceeds, "LKR");
      if (proceeds > 0 && !dto.proceedsAccountId) throw new BadRequestException("Say where the proceeds were received");
      const date = dto.date?.slice(0, 10) ?? today();
      const cleared = a.accumulatedDepreciation + a.impairment;
      const gain = proceeds - a.bookValue;
      const lines: LineInput[] = [
        { accountId: c.accumulatedAccountId, debit: cleared, description: `Dispose ${a.code}` },
        { accountId: c.assetAccountId, credit: a.cost, description: `Dispose ${a.code}` },
      ];
      if (proceeds) lines.push({ accountId: dto.proceedsAccountId!, debit: proceeds, description: `Proceeds ${a.code}` });
      if (gain) lines.push({ accountId: dto.gainLossAccountId, credit: gain, description: gain > 0 ? "Gain on disposal" : "Loss on disposal" });
      const plan = await this.ledger.prepare(tx, ctx, { date, source: "system", memo: `Disposal ${a.code} ${a.name}`, reference: { entityType: this.entityType, entityId: id, label: a.code }, lines }, { withNumber: true });
      const journal = plan.commitNew();
      return this.repo.applyUpdate(ctx, tx, a, {
        status: "disposed", bookValue: 0, disposal: { date, proceeds, gainOrLoss: gain, journalId: journal.id },
        history: [...a.history, { date, event: "disposed", detail: `${gain >= 0 ? "Gain" : "Loss"} ${fromMinor(Math.abs(gain), "LKR")}${dto.reason ? `: ${dto.reason}` : ""}`, journalId: journal.id, by: ctx.userId }],
      }).after;
    });
  }

  /** Moves the asset to another branch, department, custodian or location. */
  async transfer(ctx: RequestContext, id: string, dto: TransferAssetDto): Promise<AssetDoc> {
    const a = await this.repo.get(ctx, id);
    if (a.status === "disposed") throw new BadRequestException("Disposed assets cannot move");
    const patch: Patch<AssetDoc> = {};
    const changes: string[] = [];
    for (const k of ["branchId", "departmentId", "custodianId", "location"] as const) {
      if (dto[k] !== undefined && dto[k] !== a[k]) {
        (patch as Record<string, unknown>)[k] = dto[k] || null;
        changes.push(`${k.replace(/Id$/, "")}: ${a[k] ?? "—"} → ${dto[k] || "—"}`);
      }
    }
    if (!changes.length) throw new BadRequestException("Nothing to change");
    return (await this.repo.update(ctx, id, { ...patch, history: [...a.history, { date: dto.date?.slice(0, 10) ?? today(), event: "transferred", detail: changes.join("; "), journalId: null, by: ctx.userId }] })).after;
  }

  protected searchEntry(doc: AssetDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.code} ${doc.name}`, subtitle: doc.status, keywords: [doc.serialNo, doc.location] };
  }
}

@ApiTags("Assets")
@ApiBearerAuth()
@RequireModule("assets")
@Controller("assets")
export class AssetsController {
  constructor(private readonly assets: FixedAssetService) {}

  @Post("register/:id/capitalise")
  @HttpCode(200)
  @RequirePermission("assets.asset.edit")
  capitalise(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CapitaliseDto)) dto: CapitaliseDto) {
    return this.assets.capitalise(ctx, id, dto);
  }

  @Get("register/:id/schedule")
  @RequirePermission("assets.asset.view")
  schedule(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.assets.schedule(ctx, id);
  }

  @Post("depreciation-run")
  @HttpCode(200)
  @RequirePermission("assets.asset.edit")
  @ApiOperation({ summary: "Depreciate every asset in service up to the end of the period (catching up missed months)" })
  depreciate(@Ctx() ctx: RequestContext, @Body(validated(DepreciationRunDto)) dto: DepreciationRunDto) {
    return this.assets.depreciate(ctx, dto.period);
  }

  @Post("register/:id/impair")
  @HttpCode(200)
  @RequirePermission("assets.asset.edit")
  impair(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ImpairDto)) dto: ImpairDto) {
    return this.assets.impair(ctx, id, dto);
  }

  @Post("register/:id/dispose")
  @HttpCode(200)
  @RequirePermission("assets.asset.delete")
  dispose(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(DisposeDto)) dto: DisposeDto) {
    return this.assets.dispose(ctx, id, dto);
  }

  @Post("register/:id/transfer")
  @HttpCode(200)
  @RequirePermission("assets.asset.edit")
  transfer(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(TransferAssetDto)) dto: TransferAssetDto) {
    return this.assets.transfer(ctx, id, dto);
  }
}
