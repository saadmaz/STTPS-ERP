import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min, ValidateNested,
} from "class-validator";
import { PAYMENT_METHODS } from "./pos.models.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const QTY = /^\d{1,12}(\.\d{1,3})?$/;
const PCT = /^\d{1,3}(\.\d{1,2})?$/;

export class CreateTerminalDto {
  @ApiProperty() @IsString() @Length(1, 30) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty() @IsString() warehouseId!: string;
  @IsOptional() @IsString() branchId?: string;
}
export class UpdateTerminalDto extends PartialType(CreateTerminalDto) {}

export class OpenShiftDto {
  @ApiProperty() @IsString() terminalId!: string;
  @ApiProperty({ example: "5000" }) @Matches(MONEY) openingCash!: string;
}

export class CloseShiftDto {
  @ApiProperty({ example: "48500" }) @Matches(MONEY) closingCash!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class PosSaleLineDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ example: "2" }) @Matches(QTY) qty!: string;
  @ApiPropertyOptional({ description: "Defaults to the product's sales price" }) @IsOptional() @Matches(MONEY) unitPrice?: string;
  @ApiPropertyOptional({ example: "10" }) @IsOptional() @Matches(PCT) discountPct?: string;
  @IsOptional() @IsString() @MaxLength(20) taxCode?: string;
}

export class PosPaymentDto {
  @ApiProperty({ enum: PAYMENT_METHODS }) @IsIn(PAYMENT_METHODS) method!: (typeof PAYMENT_METHODS)[number];
  @ApiProperty({ example: "5000" }) @Matches(MONEY) amount!: string;
}

export class CreatePosSaleDto {
  @ApiProperty() @IsString() shiftId!: string;
  @IsOptional() @IsString() accountId?: string;
  @ApiProperty({ type: [PosSaleLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PosSaleLineDto) lines!: PosSaleLineDto[];
  @ApiProperty({ type: [PosPaymentDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => PosPaymentDto) payments!: PosPaymentDto[];
  @ApiPropertyOptional({ description: "Loyalty points to redeem against this sale" }) @IsOptional() @IsInt() @Min(0) redeemPoints?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class RefundLineDto {
  @ApiProperty() @IsString() lineId!: string;
  @ApiProperty({ example: "1" }) @Matches(QTY) qty!: string;
}

export class RefundSaleDto {
  @ApiProperty({ type: [RefundLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => RefundLineDto) lines!: RefundLineDto[];
  @ApiProperty({ enum: PAYMENT_METHODS }) @IsIn(PAYMENT_METHODS) method!: (typeof PAYMENT_METHODS)[number];
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

/** Shifts and sales have no editable fields once created — everything changes through a dedicated action instead. */
export class NoUpdateDto {}
