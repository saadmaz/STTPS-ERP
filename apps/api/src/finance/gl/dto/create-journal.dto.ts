import { IsString, IsOptional, IsDateString, IsArray, ValidateNested, IsNumber, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class JournalLineDto {
  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  debit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  credit?: number;

  @ApiPropertyOptional({ default: "USD" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  exchangeRate?: number;
}

export class CreateJournalDto {
  @ApiProperty({ example: "2025-01-15" })
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ default: "MANUAL" })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ default: "USD" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ type: [JournalLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}
