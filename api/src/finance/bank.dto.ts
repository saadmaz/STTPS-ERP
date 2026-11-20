import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const SIGNED_MONEY = /^-?\d{1,13}(\.\d{1,4})?$/;

export class TransferDto {
  @ApiProperty() @IsString() fromAccountId!: string;
  @ApiProperty() @IsString() toAccountId!: string;
  @ApiProperty({ example: "50000.00" }) @Matches(MONEY) amount!: string;
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsOptional() @IsString() @MaxLength(200) memo?: string;
}

export class ImportStatementDto {
  @ApiProperty() @IsString() accountId!: string;
  @ApiProperty({ enum: ["csv", "ofx"] }) @IsIn(["csv", "ofx"]) format!: "csv" | "ofx";
  @ApiProperty({ description: "The file's text. CSV needs a header with date, description and amount (or debit and credit) columns." })
  @IsString() @Length(1, 2_000_000) content!: string;
  @ApiPropertyOptional({ enum: ["YMD", "DMY", "MDY"], description: "How CSV dates are written; default YMD" }) @IsOptional() @IsIn(["YMD", "DMY", "MDY"]) dateOrder?: "YMD" | "DMY" | "MDY";
}

export class MatchLineDto {
  @ApiProperty({ description: "Ledger entry ids whose total equals the statement line" }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true }) entryIds!: string[];
}

export class CreateFromLineDto {
  @ApiProperty({ description: "The other side, e.g. bank charges or interest income" }) @IsString() accountId!: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
}

export class ReconcileDto {
  @ApiProperty() @IsString() accountId!: string;
  @ApiProperty() @IsISO8601({ strict: true }) statementDate!: string;
  @ApiProperty({ example: "1250000.00" }) @Matches(SIGNED_MONEY) statementBalance!: string;
}
