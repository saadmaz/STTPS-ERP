import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class PRLineDto {
  @IsUUID() itemId: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsNumber() qty: number;
  @IsOptional() @IsString() uom?: string;
  @IsOptional() @Type(() => Number) @IsNumber() estUnitCost?: number;
  @IsNumber() lineNumber: number;
}

export class CreatePRDto {
  @IsString() number: string;
  @IsString() requestDate: string;
  @IsOptional() @IsString() requiredDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PRLineDto) lines: PRLineDto[];
}

export class POLineDto {
  @IsUUID() itemId: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsNumber() qty: number;
  @IsOptional() @IsString() uom?: string;
  @IsOptional() @Type(() => Number) @IsNumber() unitPrice?: number;
  @IsOptional() @IsString() taxCode?: string;
  @IsNumber() lineNumber: number;
}

export class CreatePODto {
  @IsUUID() vendorId: string;
  @IsOptional() @IsUUID() prId?: string;
  @IsString() number: string;
  @IsString() orderDate: string;
  @IsOptional() @IsString() expectedDate?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => POLineDto) lines: POLineDto[];
}

export class GRNLineDto {
  @IsUUID() itemId: string;
  @IsOptional() @IsUUID() poLineId?: string;
  @Type(() => Number) @IsNumber() qty: number;
  @IsOptional() @Type(() => Number) @IsNumber() unitCost?: number;
  @IsOptional() @IsUUID() locationId?: string;
  @IsNumber() lineNumber: number;
}

export class CreateGRNDto {
  @IsUUID() poId: string;
  @IsUUID() warehouseId: string;
  @IsString() number: string;
  @IsString() receiptDate: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => GRNLineDto) lines: GRNLineDto[];
}
