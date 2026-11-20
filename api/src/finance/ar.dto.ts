import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from "class-validator";

const QTY = /^\d{1,12}(\.\d{1,3})?$/;
const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const PCT = /^\d{1,3}(\.\d{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;

export class InvoiceLineDto {
  @IsOptional() @IsString() productId?: string;
  @ApiPropertyOptional({ description: "Defaults to the product name" }) @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiProperty({ example: "2" }) @Matches(QTY) qty!: string;
  @ApiProperty({ example: "1500.00" }) @Matches(MONEY) unitPrice!: string;
  @IsOptional() @Matches(PCT) discountPct?: string;
  @IsOptional() @IsString() @MaxLength(20) taxCode?: string;
  @ApiPropertyOptional({ description: "Income account; defaults to the revenue posting rule" }) @IsOptional() @IsString() accountId?: string;
}

export class CreateInvoiceDto {
  @ApiProperty() @IsString() customerId!: string;
  @IsOptional() @IsIn(["invoice", "credit_note"]) kind?: "invoice" | "credit_note";
  @ApiPropertyOptional({ description: "Deposit invoices post to customer deposits instead of revenue; milestone and recurring are plain revenue invoices" })
  @IsOptional() @IsIn(["standard", "deposit", "milestone", "recurring"]) invoiceType?: "standard" | "deposit" | "milestone" | "recurring";
  @ApiPropertyOptional({ description: "The order this deposit or milestone invoice belongs to" }) @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() scheduleEntryId?: string;
  @IsOptional() @IsString() recurringScheduleId?: string;
  @IsOptional() @IsString() creditedInvoiceId?: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsString() @MaxLength(80) customerReference?: string;
  @ApiProperty({ type: [InvoiceLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto) lines!: InvoiceLineDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateInvoiceDto {
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
  @IsOptional() @IsString() @MaxLength(80) customerReference?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto) lines?: InvoiceLineDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class AllocationDto {
  @IsString() invoiceId!: string;
  @Matches(MONEY) amount!: string;
}

export class CreateReceiptDto {
  @ApiProperty() @IsString() customerId!: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @ApiProperty({ example: "25000.00" }) @Matches(MONEY) amount!: string;
  @ApiPropertyOptional({ description: "Bank or cash account; defaults to the bank posting rule" }) @IsOptional() @IsString() bankAccountId?: string;
  @IsOptional() @IsIn(["bank_transfer", "cash", "cheque", "card", "other"]) method?: "bank_transfer" | "cash" | "cheque" | "card" | "other";
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @ApiPropertyOptional({ type: [AllocationDto], description: "Omit to settle the oldest open invoices first" })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => AllocationDto) allocations?: AllocationDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateReceiptDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ApplyCreditDto {
  @IsString() invoiceId!: string;
  @Matches(MONEY) amount!: string;
}

export class ApplyDepositDto {
  @ApiProperty({ description: "The invoice to apply this fully-paid deposit to" }) @IsString() invoiceId!: string;
}

export class WriteOffDto {
  @ApiProperty({ description: "Expense account for bad debts" }) @IsString() accountId!: string;
  @IsString() @Length(1, 500) reason!: string;
}
