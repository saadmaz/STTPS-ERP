import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsUUID, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── BOM ──────────────────────────────────────────────────────────────────────

export class BOMLineDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() qty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() scrapPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPhantom?: boolean;
  @ApiProperty() @IsNumber() lineNumber: number;
}

export class CreateBOMDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiProperty() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() version?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() baseQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() validTo?: string;
  @ApiProperty({ type: [BOMLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => BOMLineDto) lines: BOMLineDto[];
}

// ── Work Center ───────────────────────────────────────────────────────────────

export class CreateWorkCenterDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() capacity?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() efficiency?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() costRate?: number;
}

// ── Routing ───────────────────────────────────────────────────────────────────

export class RoutingOperationDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() workCenterId?: string;
  @ApiProperty() @IsNumber() sequence: number;
  @ApiProperty() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() setupTime?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() runTime?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() queueTime?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
}

export class CreateRoutingDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: [RoutingOperationDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => RoutingOperationDto) operations: RoutingOperationDto[];
}

// ── Production Order ──────────────────────────────────────────────────────────

export class ProductionComponentDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() requiredQty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiProperty() @IsNumber() lineNumber: number;
}

export class CreateProductionOrderDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() bomId?: string;
  @ApiProperty() @IsString() number: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() plannedQty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() plannedStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() plannedEnd?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [ProductionComponentDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ProductionComponentDto) components: ProductionComponentDto[];
}

export class RecordProductionDto {
  @ApiProperty() @Type(() => Number) @IsNumber() producedQty: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() scrapQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() warehouseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ── MRP ───────────────────────────────────────────────────────────────────────

export class RunMRPDto {
  @ApiProperty() @IsString() reference: string;
  @ApiPropertyOptional() @IsOptional() @IsString() planType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
