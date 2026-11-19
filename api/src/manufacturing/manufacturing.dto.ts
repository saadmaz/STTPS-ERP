import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString,
  Length, Max, MaxLength, Min, ValidateNested,
} from "class-validator";
import { MACHINE_STATUSES } from "./manufacturing.models.js";

export class CreateWorkCentreDto {
  @ApiProperty() @IsString() @Length(1, 30) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(24) capacityHoursPerDay?: number;
}
export class UpdateWorkCentreDto extends PartialType(CreateWorkCentreDto) {}

export class CreateMachineDto {
  @ApiProperty() @IsString() @Length(1, 30) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty() @IsString() workCentreId!: string;
  @ApiPropertyOptional({ enum: MACHINE_STATUSES }) @IsOptional() @IsIn(MACHINE_STATUSES) status?: (typeof MACHINE_STATUSES)[number];
}
export class UpdateMachineDto extends PartialType(CreateMachineDto) {}

export class BomLineDto {
  @ApiProperty() @IsString() componentProductId!: string;
  @ApiProperty() @IsNumber() @Min(0.001) qty!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) scrapPct?: number;
  @IsOptional() @IsBoolean() isAlternate?: boolean;
  @IsOptional() @IsString() alternateGroup?: string;
  @IsOptional() @IsNumber() @Min(0) laborMinutes?: number;
}

export class CreateBomDto {
  @ApiProperty() @IsString() productId!: string;
  @IsOptional() @IsInt() @Min(1) revision?: number;
  @ApiProperty() @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @ApiPropertyOptional({ type: [BomLineDto], description: "Can be added afterwards; a production order needs at least one before it can use this BOM" })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => BomLineDto) lines?: BomLineDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateBomDto extends PartialType(CreateBomDto) {}

export class RoutingOperationDto {
  @ApiProperty() @IsInt() @Min(1) seq!: number;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty() @IsString() workCentreId!: string;
  @IsOptional() @IsNumber() @Min(0) setupMinutes?: number;
  @ApiProperty() @IsNumber() @Min(0) runMinutesPerUnit!: number;
}

export class CreateRoutingDto {
  @ApiProperty() @IsString() productId!: string;
  @IsOptional() @IsInt() @Min(1) revision?: number;
  @ApiPropertyOptional({ type: [RoutingOperationDto], description: "Can be added afterwards" })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => RoutingOperationDto) operations?: RoutingOperationDto[];
}
export class UpdateRoutingDto extends PartialType(CreateRoutingDto) {}

export class CreateProductionOrderDto {
  @ApiProperty() @IsString() productId!: string;
  @IsOptional() @IsString() bomId?: string;
  @IsOptional() @IsString() routingId?: string;
  @ApiProperty() @IsNumber() @Min(0.001) qtyPlanned!: number;
  @IsOptional() @IsDateString() scheduledStart?: string;
  @IsOptional() @IsDateString() scheduledEnd?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateProductionOrderDto extends PartialType(CreateProductionOrderDto) {}

export class RecordOutputDto {
  @ApiProperty() @IsNumber() @Min(0) qtyGood!: number;
  @IsOptional() @IsNumber() @Min(0) qtyScrap?: number;
}

export class LogDowntimeDto {
  @ApiProperty() @IsInt() seq!: number;
  @ApiProperty() @IsInt() @Min(1) minutes!: number;
}

export class CompleteOperationDto {
  @ApiProperty() @IsInt() seq!: number;
  @ApiProperty() @IsNumber() @Min(0) actualMinutes!: number;
}
