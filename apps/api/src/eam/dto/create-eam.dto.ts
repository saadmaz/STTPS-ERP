import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsDateString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAssetCategoryDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class CreateAssetDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufacturer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() purchaseDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) purchaseCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() warrantyExpiry?: string;
}

export class MaintenancePlanTaskDto {
  @ApiProperty() @IsNumber() @Type(() => Number) sequence: number;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) estimatedMins?: number;
}

export class CreateMaintenancePlanDto {
  @ApiProperty() @IsString() assetId: string;
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() planType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() frequency?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) frequencyDays?: number;
  @ApiProperty() @IsDateString() nextDueAt: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) estimatedHours?: number;
  @ApiPropertyOptional({ type: [MaintenancePlanTaskDto] }) @IsOptional() tasks?: MaintenancePlanTaskDto[];
}

export class CreateWorkOrderDto {
  @ApiProperty() @IsString() assetId: string;
  @ApiProperty() @IsString() number: string;
  @ApiPropertyOptional() @IsOptional() @IsString() maintenancePlanId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() priority?: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() failureCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assignedTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledEnd?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) estimatedHours?: number;
}

export class WorkOrderCostDto {
  @ApiProperty() @IsString() type: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) quantity?: number;
  @ApiProperty() @IsNumber() @Type(() => Number) unitCost: number;
}

export class CompleteWorkOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() resolution?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) actualHours?: number;
  @ApiPropertyOptional({ type: [WorkOrderCostDto] }) @IsOptional() costs?: WorkOrderCostDto[];
}

export class RegisterIoTDeviceDto {
  @ApiProperty() @IsString() deviceId: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assetId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() protocol?: string;
}

export class RecordIoTReadingDto {
  @ApiProperty() @IsString() metric: string;
  @ApiProperty() @IsNumber() @Type(() => Number) value: number;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAlert?: boolean;
}
