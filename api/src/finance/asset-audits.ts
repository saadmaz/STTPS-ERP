import { ApiProperty, PartialType } from "@nestjs/swagger";
import { BadRequestException, Body, Controller, HttpCode, Injectable, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";
import { FirestoreService } from "../firestore/firestore.service.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { validated } from "../platform/crud/master-data.controller.js";
import { toMinor } from "../platform/data/money.js";
import { BaseDoc, NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { ASSET_COLLECTIONS, FixedAssetService } from "./assets.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);

export const ASSET_AUDIT_COLLECTIONS = { audits: "assetAudits", repairs: "assetRepairs" } as const;
export const AUDIT_STATUSES = ["planning", "in_progress", "completed"] as const;
export const FINDING_RESULTS = ["found", "missing", "damaged"] as const;
export const REPAIR_STATUSES = ["reported", "in_progress", "completed"] as const;

// ─── Model ────────────────────────────────────────────────────────────────────

export interface AuditFinding {
  assetId: string;
  result: (typeof FINDING_RESULTS)[number];
  notes: string | null;
  recordedAt: string;
  recordedBy: string;
}

/** A physical count of assets expected in a branch or department (blueprint §15 "audits" and "missing assets"). */
export interface AssetAuditDoc extends BaseDoc {
  name: string;
  scheduledDate: string;
  branchId: string | null;
  departmentId: string | null;
  status: (typeof AUDIT_STATUSES)[number];
  findings: AuditFinding[];
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
}

/** A lightweight repair log against an asset; the full work-order flow belongs to the later Maintenance module. */
export interface RepairDoc extends BaseDoc {
  assetId: string;
  reportedDate: string;
  description: string;
  cost: number | null;
  status: (typeof REPAIR_STATUSES)[number];
  completedDate: string | null;
  notes: string | null;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class CreateAssetAuditDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty() @IsISO8601({ strict: true }) scheduledDate!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateAssetAuditDto extends PartialType(CreateAssetAuditDto) {}

export class AddFindingDto {
  @ApiProperty() @IsString() assetId!: string;
  @ApiProperty({ enum: FINDING_RESULTS }) @IsIn(FINDING_RESULTS) result!: (typeof FINDING_RESULTS)[number];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreateRepairDto {
  @ApiProperty() @IsString() assetId!: string;
  @ApiProperty() @IsISO8601({ strict: true }) reportedDate!: string;
  @ApiProperty() @IsString() @Length(1, 500) description!: string;
  @IsOptional() @Matches(MONEY) cost?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateRepairDto extends PartialType(CreateRepairDto) {}

export class CompleteRepairDto {
  @IsOptional() @IsISO8601({ strict: true }) completedDate?: string;
  @IsOptional() @Matches(MONEY) cost?: string;
}

// ─── Services ─────────────────────────────────────────────────────────────────

@Injectable()
export class AssetAuditService extends MasterDataService<AssetAuditDoc, CreateAssetAuditDto, UpdateAssetAuditDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly assets: FixedAssetService) {
    super(fs, audit, unique, { module: "assets", entity: "audit", label: "Asset audit", collection: ASSET_AUDIT_COLLECTIONS.audits, route: "/assets/audits", customFields: false });
  }

  protected toNew(dto: CreateAssetAuditDto): NewDoc<AssetAuditDoc> {
    return { name: dto.name, scheduledDate: dto.scheduledDate.slice(0, 10), branchId: orNull(dto.branchId), departmentId: orNull(dto.departmentId), status: "planning", findings: [], completedAt: null, completedBy: null, notes: orNull(dto.notes) };
  }

  /** Records a count result and keeps the asset's own missing flag in sync. */
  async addFinding(ctx: RequestContext, id: string, dto: AddFindingDto): Promise<AssetAuditDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status === "completed") throw new BadRequestException("This audit is already completed");
    const asset = await this.assets.repo.get(ctx, dto.assetId);
    const finding: AuditFinding = { assetId: dto.assetId, result: dto.result, notes: orNull(dto.notes), recordedAt: new Date().toISOString(), recordedBy: ctx.userId };
    const findings = [...before.findings.filter((f) => f.assetId !== dto.assetId), finding];
    if (dto.result === "missing" && !asset.isMissing) await this.assets.reportMissing(ctx, dto.assetId, { notes: `Found missing during audit "${before.name}"` });
    if (dto.result !== "missing" && asset.isMissing) await this.assets.recoverFound(ctx, dto.assetId);
    return (await this.repo.update(ctx, id, { findings, status: before.status === "planning" ? "in_progress" : before.status } as Patch<AssetAuditDoc>)).after;
  }

  async complete(ctx: RequestContext, id: string): Promise<AssetAuditDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status === "completed") throw new BadRequestException("Already completed");
    return (await this.repo.update(ctx, id, { status: "completed", completedAt: new Date().toISOString(), completedBy: ctx.userId } as Patch<AssetAuditDoc>)).after;
  }

  protected searchEntry(doc: AssetAuditDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.status };
  }
}

@Injectable()
export class RepairService extends MasterDataService<RepairDoc, CreateRepairDto, UpdateRepairDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "assets", entity: "repair", label: "Repair", collection: ASSET_AUDIT_COLLECTIONS.repairs, route: "/assets/repairs",
      filterFields: ["assetId", "status"], references: [{ field: "assetId", collection: ASSET_COLLECTIONS.assets, label: "Asset" }], customFields: false,
    });
  }

  protected toNew(dto: CreateRepairDto): NewDoc<RepairDoc> {
    return { assetId: dto.assetId, reportedDate: dto.reportedDate.slice(0, 10), description: dto.description, cost: dto.cost ? toMinor(dto.cost, "LKR") : null, status: "reported", completedDate: null, notes: orNull(dto.notes) };
  }

  async complete(ctx: RequestContext, id: string, dto: CompleteRepairDto): Promise<RepairDoc> {
    const before = await this.repo.get(ctx, id);
    if (before.status === "completed") throw new BadRequestException("Already completed");
    return (await this.repo.update(ctx, id, {
      status: "completed", completedDate: dto.completedDate?.slice(0, 10) ?? today(), cost: dto.cost ? toMinor(dto.cost, "LKR") : before.cost,
    } as Patch<RepairDoc>)).after;
  }

  protected searchEntry(doc: RepairDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.description, subtitle: doc.status };
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags("Assets")
@ApiBearerAuth()
@RequireModule("assets")
@Controller("assets")
export class AssetAuditsController {
  constructor(private readonly audits: AssetAuditService, private readonly repairs: RepairService) {}

  @Post("audits/:id/findings")
  @HttpCode(200)
  @RequirePermission("assets.audit.edit")
  @ApiOperation({ summary: "Records one asset's count result; a missing or recovered result updates the asset itself" })
  addFinding(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(AddFindingDto)) dto: AddFindingDto) {
    return this.audits.addFinding(ctx, id, dto);
  }

  @Post("audits/:id/complete")
  @HttpCode(200)
  @RequirePermission("assets.audit.edit")
  completeAudit(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.audits.complete(ctx, id);
  }

  @Post("repairs/:id/complete")
  @HttpCode(200)
  @RequirePermission("assets.repair.edit")
  completeRepair(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CompleteRepairDto)) dto: CompleteRepairDto) {
    return this.repairs.complete(ctx, id, dto);
  }
}
