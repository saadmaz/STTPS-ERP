import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const QTY = /^-?\d{1,12}(\.\d{1,3})?$/;
const MONEY = /^\d{1,13}(\.\d{1,4})?$/;

export class CreateWarehouseDto {
  @ApiProperty() @IsString() @Length(1, 20) @Matches(CODE) code!: string;
  @ApiProperty() @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsIn(["main", "store", "transit", "virtual"]) type?: "main" | "store" | "transit" | "virtual";
  @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional({ description: "Override the company's negative stock policy" }) @IsOptional() @IsBoolean() allowNegative?: boolean | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}

export class CreateLocationDto {
  @ApiProperty() @IsString() warehouseId!: string;
  @ApiProperty({ example: "A-01-03" }) @IsString() @Length(1, 30) @Matches(CODE) code!: string;
  @IsOptional() @IsString() @MaxLength(40) zone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateLocationDto extends PartialType(CreateLocationDto) {}

export class LineDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ example: "5", description: "Signed for adjustments (negative to remove)" }) @Matches(QTY) qty!: string;
  @IsOptional() @IsString() @MaxLength(60) lotNo?: string;
  @IsOptional() @IsISO8601({ strict: true }) expiryDate?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) serialNos?: string[];
  @ApiPropertyOptional({ description: "Cost per unit for stock added (defaults to the current average)" }) @IsOptional() @Matches(MONEY) unitCost?: string;
}

export class CreateAdjustmentDto {
  @ApiProperty() @IsString() warehouseId!: string;
  @ApiProperty({ example: "damaged" }) @IsString() @Length(1, 40) reason!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @ApiProperty({ type: [LineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineDto) lines!: LineDto[];
}
export class UpdateAdjustmentDto extends PartialType(CreateAdjustmentDto) {}

export class CreateTransferDto {
  @ApiProperty() @IsString() fromWarehouseId!: string;
  @ApiProperty() @IsString() toWarehouseId!: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @ApiProperty({ type: [LineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineDto) lines!: LineDto[];
}
export class UpdateTransferDto extends PartialType(CreateTransferDto) {}

export class StartCountDto {
  @ApiProperty() @IsString() warehouseId!: string;
  @ApiPropertyOptional({ description: "Limit to these products (cycle count); all stocked products when empty" })
  @IsOptional() @IsArray() @ArrayMaxSize(400) @IsString({ each: true }) productIds?: string[];
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CountEntryDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() lotNo?: string;
  @Matches(/^\d{1,12}(\.\d{1,3})?$/) counted!: string;
}

export class RecordCountDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(400) @ValidateNested({ each: true }) @Type(() => CountEntryDto) entries!: CountEntryDto[];
}

export class InventorySettingsDto {
  @IsOptional() @IsBoolean() allowNegative?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) adjustmentReasons?: string[];
}

export class ReorderDto {
  @ApiProperty({ example: "20" }) @Matches(/^\d{1,12}(\.\d{1,3})?$/) reorderPoint!: string;
  @IsOptional() @Matches(/^\d{1,12}(\.\d{1,3})?$/) safetyStock?: string;
  @IsOptional() @Matches(/^\d{1,12}(\.\d{1,3})?$/) reorderQty?: string;
}
