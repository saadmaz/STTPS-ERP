import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
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

const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const QTY = /^\d{1,12}(\.\d{1,3})?$/;
const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const CURRENCY = /^[A-Z]{3}$/;

export class BankDto {
  @IsOptional() @IsString() @MaxLength(80) bankName?: string;
  @IsOptional() @IsString() @MaxLength(120) accountName?: string;
  @IsOptional() @IsString() @MaxLength(40) accountNo?: string;
  @IsOptional() @IsString() @MaxLength(80) branch?: string;
  @IsOptional() @IsString() @MaxLength(20) swift?: string;
}

export class CertificationDto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsISO8601({ strict: true }) expiresOn?: string;
}

export class CreateSupplierDto {
  @ApiPropertyOptional({ description: "Blank to number automatically (SUP-000001)" }) @IsOptional() @IsString() @Length(1, 30) @Matches(CODE) code?: string;
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsIn(["active", "on_hold", "blocked"]) status?: "active" | "on_hold" | "blocked";
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsObject() address?: { line1?: string; city?: string; country?: string };
  @IsOptional() @IsString() @MaxLength(40) taxId?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
  @IsOptional() @ValidateNested() @Type(() => BankDto) bank?: BankDto;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CertificationDto) certifications?: CertificationDto[];
  @IsOptional() @IsBoolean() preferred?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(365) leadTimeDays?: number;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}
export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class RequisitionLineDto {
  @IsOptional() @IsString() productId?: string;
  @ApiPropertyOptional({ description: "Required when there is no product (services, one-off items)" }) @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiProperty({ example: "5" }) @Matches(QTY) qty!: string;
  @IsOptional() @IsString() @MaxLength(12) uom?: string;
  @IsOptional() @Matches(MONEY) estimatedPrice?: string;
  @IsOptional() @IsString() suggestedSupplierId?: string;
}

export class CreateRequisitionDto {
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() costCentreId?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsISO8601({ strict: true }) requiredDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) justification?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @ApiProperty({ type: [RequisitionLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => RequisitionLineDto) lines!: RequisitionLineDto[];
}
export class UpdateRequisitionDto extends PartialType(CreateRequisitionDto) {}

export class CreateRfqDto {
  @IsOptional() @IsString() requisitionId?: string;
  @ApiPropertyOptional({ type: [RequisitionLineDto], description: "Required without a requisition" })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => RequisitionLineDto) lines?: RequisitionLineDto[];
  @ApiProperty() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) supplierIds!: string[];
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
}
export class UpdateRfqDto {
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
}

export class RfqQuoteDto {
  @IsString() supplierId!: string;
  @ApiProperty({ description: "Unit price per requisition line id", example: { a1b2c3d4: "1250.00" } }) @IsObject() prices!: Record<string, string>;
  @IsOptional() @IsInt() @Min(0) @Max(365) leadTimeDays?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class AwardDto {
  @IsString() supplierId!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() warehouseId?: string;
}

export class PurchaseLineDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ example: "10" }) @Matches(QTY) qty!: string;
  @ApiPropertyOptional({ description: "Defaults to the product's purchase price" }) @IsOptional() @Matches(MONEY) unitPrice?: string;
  @IsOptional() @IsString() @MaxLength(20) taxCode?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty() @IsString() supplierId!: string;
  @IsOptional() @IsString() requisitionId?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsISO8601({ strict: true }) expectedDate?: string;
  @ApiProperty() @IsString() warehouseId!: string;
  @ApiProperty({ type: [PurchaseLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PurchaseLineDto) lines!: PurchaseLineDto[];
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}
export class UpdatePurchaseOrderDto extends PartialType(CreatePurchaseOrderDto) {}

export class SupplierConfirmDto {
  @IsOptional() @IsString() @MaxLength(80) supplierReference?: string;
  @IsOptional() @IsISO8601({ strict: true }) expectedDate?: string;
}

export class ReceiptLineDto {
  @IsString() orderLineId!: string;
  @ApiProperty({ example: "10" }) @Matches(QTY) received!: string;
  @ApiPropertyOptional({ description: "Rejected at inspection (part of received)" }) @IsOptional() @Matches(QTY) rejected?: string;
  @IsOptional() @IsString() @MaxLength(300) rejectReason?: string;
  @IsOptional() @IsString() @MaxLength(60) lotNo?: string;
  @IsOptional() @IsISO8601({ strict: true }) expiryDate?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) serialNos?: string[];
  @IsOptional() @IsString() locationId?: string;
}

export class CreateReceiptDto {
  @ApiProperty() @IsString() orderId!: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsString() @MaxLength(80) supplierDeliveryNote?: string;
  @ApiProperty({ type: [ReceiptLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ReceiptLineDto) lines!: ReceiptLineDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateReceiptDto {
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateSupplierReturnDto {
  @ApiProperty() @IsString() receiptId!: string;
  @ApiProperty() @IsString() @Length(1, 500) reason!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SupplierReturnLineDto) lines!: SupplierReturnLineDto[];
}
export class SupplierReturnLineDto {
  @IsInt() @Min(0) receiptLineIndex!: number;
  @Matches(QTY) qty!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) serialNos?: string[];
}
export class UpdateSupplierReturnDto {
  @IsOptional() @IsString() @Length(1, 500) reason?: string;
}

export class ReasonDto {
  @IsString() @Length(1, 500) reason!: string;
}
