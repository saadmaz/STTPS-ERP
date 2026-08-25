import { IsString, IsOptional, IsDateString, IsNumber, IsArray, ValidateNested, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ApInvoiceLineDto {
  @ApiProperty() @IsString() accountId: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() quantity?: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() taxCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
}

export class CreateApInvoiceDto {
  @ApiProperty() @IsString() vendorId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vendorRef?: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [ApInvoiceLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ApInvoiceLineDto)
  lines: ApInvoiceLineDto[];
}
