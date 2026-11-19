import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const QTY = /^\d{1,12}(\.\d{1,3})?$/;
const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const PCT = /^\d{1,3}(\.\d{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;

export class SalesLineDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ example: "2" }) @Matches(QTY) qty!: string;
  @ApiPropertyOptional({ description: "Defaults to the price from price lists and discount rules" }) @IsOptional() @Matches(MONEY) unitPrice?: string;
  @ApiPropertyOptional({ example: "5" }) @IsOptional() @Matches(PCT) discountPct?: string;
  @IsOptional() @IsString() @MaxLength(20) taxCode?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ description: "Orders only: warehouse to ship from" }) @IsOptional() @IsString() warehouseId?: string;
}

export class CreateQuoteDto {
  @ApiProperty() @IsString() accountId!: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsISO8601({ strict: true }) validUntil?: string;
  @ApiProperty({ type: [SalesLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SalesLineDto) lines!: SalesLineDto[];
  @IsOptional() @IsString() @MaxLength(5000) terms?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsString() ownerUserId?: string;
}
export class UpdateQuoteDto extends PartialType(CreateQuoteDto) {}

export class CreateOrderDto {
  @ApiProperty() @IsString() accountId!: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() @MaxLength(80) customerReference?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsISO8601({ strict: true }) requestedDate?: string;
  @ApiPropertyOptional({ description: "Default warehouse for lines" }) @IsOptional() @IsString() warehouseId?: string;
  @ApiProperty({ type: [SalesLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SalesLineDto) lines!: SalesLineDto[];
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsString() ownerUserId?: string;
}
export class UpdateOrderDto extends PartialType(CreateOrderDto) {}

export class DeliveryLineDto {
  @IsString() orderLineId!: string;
  @Matches(QTY) qty!: string;
  @IsOptional() @IsString() @MaxLength(60) lotNo?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) serialNos?: string[];
}

export class CreateDeliveryDto {
  @ApiProperty() @IsString() orderId!: string;
  @ApiPropertyOptional({ description: "Defaults to everything reserved and not yet delivered" })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => DeliveryLineDto) lines?: DeliveryLineDto[];
  @IsOptional() @IsString() @MaxLength(80) carrier?: string;
  @IsOptional() @IsString() @MaxLength(80) trackingNo?: string;
}
export class UpdateDeliveryDto {
  @IsOptional() @IsString() @MaxLength(80) carrier?: string;
  @IsOptional() @IsString() @MaxLength(80) trackingNo?: string;
}

export class DeliverDto {
  @ApiProperty({ description: "Who signed for it" }) @IsString() @Length(1, 120) receivedBy!: string;
}

export class FailDeliveryDto {
  @IsString() @Length(1, 500) reason!: string;
}

export class ReturnLineDto {
  @IsInt() @Min(0) deliveryLineIndex!: number;
  @Matches(QTY) qty!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) serialNos?: string[];
  @IsOptional() @IsIn(["resellable", "damaged"]) condition?: "resellable" | "damaged";
}

export class CreateReturnDto {
  @ApiProperty() @IsString() deliveryId!: string;
  @ApiProperty() @IsString() @Length(1, 500) reason!: string;
  @ApiProperty({ type: [ReturnLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ReturnLineDto) lines!: ReturnLineDto[];
}
export class UpdateReturnDto {
  @IsOptional() @IsString() @Length(1, 500) reason?: string;
}

export class TaxRateDto {
  @IsString() @Length(1, 20) code!: string;
  @IsString() @Length(1, 60) name!: string;
  @Matches(PCT) rate!: string;
}

export class SalesSettingsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => TaxRateDto) taxRates?: TaxRateDto[];
  @IsOptional() @IsString() defaultTaxCode?: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) quoteValidityDays?: number;
  @IsOptional() @Matches(PCT) discountApprovalPct?: string;
  @IsOptional() @IsString() @MaxLength(5000) defaultTerms?: string;
  @IsOptional() @IsString() defaultWarehouseId?: string;
}

export class BillingScheduleEntryDto {
  @ApiProperty() @IsString() @Length(1, 120) label!: string;
  @ApiProperty({ enum: ["deposit", "milestone"] }) @IsIn(["deposit", "milestone"]) kind!: "deposit" | "milestone";
  @ApiProperty({ enum: ["percent", "amount"] }) @IsIn(["percent", "amount"]) basis!: "percent" | "amount";
  @ApiProperty({ description: "A percentage (e.g. \"25\") of the order's net total, or a fixed amount in the order currency" }) @Matches(MONEY) value!: string;
  @IsOptional() @IsString() @MaxLength(20) taxCode?: string;
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
}

export class SetBillingScheduleDto {
  @ApiProperty({ type: [BillingScheduleEntryDto] })
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => BillingScheduleEntryDto)
  entries!: BillingScheduleEntryDto[];
}

export class CommentDto {
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class CancelDto {
  @IsString() @Length(1, 500) reason!: string;
}
