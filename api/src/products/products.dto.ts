import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { COSTING_METHODS, DISCOUNT_SCOPES, PRODUCT_TYPES, UOM_KINDS } from "./products.models.js";

const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const QTY = /^\d{1,12}(\.\d{1,3})?$/;
const CURRENCY = /^[A-Z]{3}$/;

export class CreateCategoryDto {
  @ApiProperty() @IsString() @Length(1, 30) @Matches(CODE) code!: string;
  @ApiProperty() @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CreateUomDto {
  @ApiProperty({ example: "pcs" }) @IsString() @Length(1, 12) @Matches(CODE) code!: string;
  @ApiProperty({ example: "Pieces" }) @IsString() @Length(1, 60) name!: string;
  @ApiProperty({ enum: UOM_KINDS }) @IsIn(UOM_KINDS) kind!: (typeof UOM_KINDS)[number];
  @IsOptional() @IsBoolean() wholeOnly?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateUomDto extends PartialType(CreateUomDto) {}

export class UomConversionDto {
  @IsString() @Length(1, 12) uom!: string;
  @ApiProperty({ example: "12", description: "Base units in one of this unit" }) @Matches(QTY) factor!: string;
}

export class BundleComponentDto {
  @IsString() productId!: string;
  @ApiProperty({ example: "2" }) @Matches(QTY) qty!: string;
}

export class DimensionsDto {
  @IsInt() @Min(0) length!: number;
  @IsInt() @Min(0) width!: number;
  @IsInt() @Min(0) height!: number;
}

export class CreateProductDto {
  @ApiPropertyOptional({ description: "Leave blank to number automatically (PRD-000001)" })
  @IsOptional() @IsString() @Length(1, 40) @Matches(CODE) sku?: string;
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional({ enum: PRODUCT_TYPES }) @IsOptional() @IsIn(PRODUCT_TYPES) type?: (typeof PRODUCT_TYPES)[number];
  @IsOptional() @IsIn(["active", "inactive", "discontinued"]) status?: "active" | "inactive" | "discontinued";
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @ApiPropertyOptional({ example: "pcs" }) @IsOptional() @IsString() @Length(1, 12) baseUom?: string;
  @IsOptional() @IsString() @Length(1, 12) salesUom?: string;
  @IsOptional() @IsString() @Length(1, 12) purchaseUom?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => UomConversionDto) uomConversions?: UomConversionDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) barcodes?: string[];
  @IsOptional() @IsString() @MaxLength(40) taxCategory?: string;
  @IsOptional() @IsIn(COSTING_METHODS) costingMethod?: (typeof COSTING_METHODS)[number];
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @Matches(MONEY) salesPrice?: string;
  @IsOptional() @Matches(MONEY) purchasePrice?: string;
  @IsOptional() @Matches(MONEY) standardCost?: string;
  @IsOptional() @IsString() preferredSupplierId?: string;
  @IsOptional() @IsInt() @Min(0) weightGrams?: number;
  @IsOptional() @ValidateNested() @Type(() => DimensionsDto) dimensionsCm?: DimensionsDto;
  @IsOptional() @IsInt() @Min(0) @Max(600) warrantyMonths?: number;
  @IsOptional() @IsBoolean() trackLots?: boolean;
  @IsOptional() @IsBoolean() trackSerials?: boolean;
  @IsOptional() @IsBoolean() trackExpiry?: boolean;
  @IsOptional() @IsString() parentProductId?: string;
  @IsOptional() @IsObject() attributes?: Record<string, string>;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => BundleComponentDto) components?: BundleComponentDto[];
  @IsOptional() @IsBoolean() isSellable?: boolean;
  @IsOptional() @IsBoolean() isPurchasable?: boolean;
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class CreatePriceListDto {
  @ApiProperty() @IsString() @Length(1, 30) @Matches(CODE) code!: string;
  @ApiProperty() @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsIn(["sales", "purchase"]) kind?: "sales" | "purchase";
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsISO8601({ strict: true }) validFrom?: string;
  @IsOptional() @IsISO8601({ strict: true }) validTo?: string;
}
export class UpdatePriceListDto extends PartialType(CreatePriceListDto) {}

export class CreatePriceListItemDto {
  @ApiProperty() @IsString() priceListId!: string;
  @ApiProperty() @IsString() productId!: string;
  @ApiPropertyOptional({ example: "10", description: "Quantity break; 0 or blank for the base price" }) @IsOptional() @Matches(QTY) minQty?: string;
  @ApiProperty({ example: "1250.00" }) @Matches(MONEY) unitPrice!: string;
  @IsOptional() @IsISO8601({ strict: true }) validFrom?: string;
  @IsOptional() @IsISO8601({ strict: true }) validTo?: string;
}
export class UpdatePriceListItemDto extends PartialType(CreatePriceListItemDto) {}

export class CreateDiscountRuleDto {
  @ApiProperty() @IsString() @Length(1, 30) @Matches(CODE) code!: string;
  @ApiProperty() @IsString() @Length(1, 120) name!: string;
  @ApiProperty({ enum: ["percent", "amount"] }) @IsIn(["percent", "amount"]) kind!: "percent" | "amount";
  @ApiProperty({ example: "12.5", description: "Percent, or an amount per base unit" }) @Matches(MONEY) value!: string;
  @ApiProperty({ enum: DISCOUNT_SCOPES }) @IsIn(DISCOUNT_SCOPES) scope!: (typeof DISCOUNT_SCOPES)[number];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) targetIds?: string[];
  @IsOptional() @Matches(QTY) minQty?: string;
  @IsOptional() @IsISO8601({ strict: true }) validFrom?: string;
  @IsOptional() @IsISO8601({ strict: true }) validTo?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) priority?: number;
  @IsOptional() @IsBoolean() stackable?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateDiscountRuleDto extends PartialType(CreateDiscountRuleDto) {}

export class PriceQueryDto {
  @ApiProperty() @IsString() productId!: string;
  @IsOptional() @IsString() accountId?: string;
  @ApiPropertyOptional({ example: "5" }) @IsOptional() @Matches(QTY) qty?: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
}
