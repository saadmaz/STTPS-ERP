import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PRLineDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() qty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() estUnitCost?: number;
  @ApiProperty() @IsNumber() lineNumber: number;
}

export class CreatePRDto {
  @ApiProperty() @IsString() number: string;
  @ApiProperty() @IsString() requestDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requiredDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [PRLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => PRLineDto) lines: PRLineDto[];
}

export class POLineDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() qty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() unitPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() taxCode?: string;
  @ApiProperty() @IsNumber() lineNumber: number;
}

export class CreatePODto {
  @ApiProperty() @IsUUID() vendorId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() prId?: string;
  @ApiProperty() @IsString() number: string;
  @ApiProperty() @IsString() orderDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expectedDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [POLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => POLineDto) lines: POLineDto[];
}

export class GRNLineDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() poLineId?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() qty: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() unitCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() locationId?: string;
  @ApiProperty() @IsNumber() lineNumber: number;
}

export class CreateGRNDto {
  @ApiProperty() @IsUUID() poId: string;
  @ApiProperty() @IsUUID() warehouseId: string;
  @ApiProperty() @IsString() number: string;
  @ApiProperty() @IsString() receiptDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [GRNLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => GRNLineDto) lines: GRNLineDto[];
}
