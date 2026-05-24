import { IsString, IsOptional, IsBoolean, IsNumber, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateItemDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() uom?: string;
  @IsOptional() @IsString() itemType?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsBoolean() trackInventory?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() reorderPoint?: number;
  @IsOptional() @Type(() => Number) @IsNumber() reorderQty?: number;
  @IsOptional() @Type(() => Number) @IsNumber() standardCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() listPrice?: number;
  @IsOptional() @IsUUID() inventoryAccountId?: string;
  @IsOptional() @IsUUID() cogsAccountId?: string;
  @IsOptional() @IsUUID() salesAccountId?: string;
}

export class CreateItemCategoryDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() parentId?: string;
}

export class CreateWarehouseDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() address?: any;
}

export class CreateStorageLocationDto {
  @IsString() warehouseId: string;
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsString() aisle?: string;
  @IsOptional() @IsString() bin?: string;
}

export class CreateStockMovementDto {
  @IsUUID() itemId: string;
  @IsUUID() warehouseId: string;
  @IsString() movementType: string;
  @IsOptional() @IsString() reference?: string;
  @Type(() => Number) @IsNumber() qty: number;
  @IsOptional() @Type(() => Number) @IsNumber() unitCost?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateStockCountDto {
  @IsUUID() warehouseId: string;
  @IsString() reference: string;
  @IsString() countDate: string;
  @IsOptional() @IsString() notes?: string;
  lines: { itemId: string; countedQty: number; notes?: string }[];
}
