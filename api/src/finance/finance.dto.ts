import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { ACCOUNT_TYPES, AccountType } from "./finance.models.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const CURRENCY = /^[A-Z]{3}$/;

export class CreateAccountDto {
  @ApiProperty({ example: "6250" }) @IsString() @Length(1, 20) @Matches(/^[A-Za-z0-9][A-Za-z0-9.-]*$/) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty({ enum: ACCOUNT_TYPES }) @IsIn(ACCOUNT_TYPES) type!: AccountType;
  @IsOptional() @IsString() @MaxLength(40) subtype?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsBoolean() isGroup?: boolean;
  @IsOptional() @IsBoolean() isControl?: boolean;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsIn(["active", "inactive"]) status?: "active" | "inactive";
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
export class UpdateAccountDto extends PartialType(CreateAccountDto) {}

export class JournalLineDto {
  @ApiProperty() @IsString() accountId!: string;
  @ApiPropertyOptional({ example: "1500.00" }) @IsOptional() @Matches(MONEY) debit?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) credit?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsIn(["customer", "supplier", "employee"]) partyType?: "customer" | "supplier" | "employee";
  @IsOptional() @IsString() partyId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() costCentreId?: string;
  @IsOptional() @IsString() projectId?: string;
}

export class CreateJournalDto {
  @ApiProperty({ example: "2026-11-30" }) @IsISO8601({ strict: true }) date!: string;
  @IsOptional() @IsString() @MaxLength(500) memo?: string;
  @ApiProperty({ type: [JournalLineDto] }) @IsArray() @ArrayMinSize(2) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines!: JournalLineDto[];
}
export class UpdateJournalDto extends PartialType(CreateJournalDto) {}

export class ReverseJournalDto {
  @ApiPropertyOptional({ description: "Defaults to the original date" }) @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsString() @MaxLength(500) memo?: string;
}

export class FinanceSettingsDto {
  @IsOptional() @IsBoolean() autoInvoiceDeliveries?: boolean;
  @IsOptional() @Matches(CURRENCY) baseCurrency?: string;
  @ApiPropertyOptional({ description: "Account id per posting role" }) @IsOptional() @IsObject() accounts?: Record<string, string>;
}

export class SetupFinanceDto {
  @IsOptional() @Matches(CURRENCY) baseCurrency?: string;
}
