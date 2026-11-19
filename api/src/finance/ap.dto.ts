import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from "class-validator";

const QTY = /^\d{1,12}(\.\d{1,3})?$/;
const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const CURRENCY = /^[A-Z]{3}$/;

export class BillLineDto {
  @IsOptional() @IsString() orderLineId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiProperty({ example: "10" }) @Matches(QTY) qty!: string;
  @ApiProperty({ example: "1900.00" }) @Matches(MONEY) unitPrice!: string;
  @IsOptional() @IsString() @MaxLength(20) taxCode?: string;
  @ApiPropertyOptional({ description: "Expense account; required for lines not received into stock" }) @IsOptional() @IsString() accountId?: string;
}

export class CreateBillDto {
  @ApiProperty() @IsString() supplierId!: string;
  @ApiProperty({ description: "The supplier's invoice number" }) @IsString() @Length(1, 60) supplierInvoiceNo!: string;
  @IsOptional() @IsIn(["bill", "debit_note"]) kind?: "bill" | "debit_note";
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() creditedBillId?: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @ApiProperty({ type: [BillLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => BillLineDto) lines!: BillLineDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateBillDto {
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => BillLineDto) lines?: BillLineDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class BillFromReceiptDto {
  @IsString() @Length(1, 60) supplierInvoiceNo!: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
}

export class PostBillDto {
  @ApiPropertyOptional({ description: "Required to post a bill that does not match its order and receipts" }) @IsOptional() @IsString() @MaxLength(500) overrideReason?: string;
}

export class PaymentAllocationDto {
  @IsString() billId!: string;
  @Matches(MONEY) amount!: string;
}

export class CreatePaymentDto {
  @ApiProperty() @IsString() supplierId!: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @ApiProperty({ example: "25000.00" }) @Matches(MONEY) amount!: string;
  @IsOptional() @IsString() bankAccountId?: string;
  @IsOptional() @IsIn(["bank_transfer", "cash", "cheque", "card", "other"]) method?: "bank_transfer" | "cash" | "cheque" | "card" | "other";
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PaymentAllocationDto) allocations?: PaymentAllocationDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdatePaymentDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class PaymentRunDto {
  @ApiProperty({ description: "Bills to pay in full (their open balance)" }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsString({ each: true }) billIds!: string[];
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsString() bankAccountId?: string;
  @IsOptional() @IsIn(["bank_transfer", "cash", "cheque", "card", "other"]) method?: "bank_transfer" | "cash" | "cheque" | "card" | "other";
}

export class ApplyDebitDto {
  @IsString() billId!: string;
  @Matches(MONEY) amount!: string;
}
