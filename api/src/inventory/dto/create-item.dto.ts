import { IsString, IsOptional, IsBoolean, IsNumber, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() itemType?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackInventory?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() reorderPoint?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() reorderQty?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() standardCost?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() listPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() inventoryAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() cogsAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() salesAccountId?: string;
}

export class CreateItemCategoryDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
}

export class CreateWarehouseDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() address?: any;
}

export class CreateStorageLocationDto {
  @ApiProperty() @IsString() warehouseId: string;
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() aisle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bin?: string;
}

export class CreateStockMovementDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiProperty() @IsUUID() warehouseId: string;
  @ApiProperty() @IsString() movementType: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() qty: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() unitCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateStockCountDto {
  @ApiProperty() @IsUUID() warehouseId: string;
  @ApiProperty() @IsString() reference: string;
  @ApiProperty() @IsString() countDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty() lines: { itemId: string; countedQty: number; notes?: string }[];
}
