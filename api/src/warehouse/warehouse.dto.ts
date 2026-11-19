import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { PICKING_STRATEGIES, TASK_TYPES } from "./warehouse.models.js";

export class CreatePutAwayRuleDto {
  @ApiProperty() @IsString() warehouseId!: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() categoryId?: string;
  @ApiProperty() @IsString() targetLocationId!: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) priority?: number;
}
export class UpdatePutAwayRuleDto extends PartialType(CreatePutAwayRuleDto) {}

export class CreateWarehouseTaskDto {
  @ApiProperty({ enum: TASK_TYPES }) @IsIn(TASK_TYPES) type!: (typeof TASK_TYPES)[number];
  @ApiProperty() @IsString() warehouseId!: string;
  @IsOptional() @IsString() locationId?: string;
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty() @IsNumber() @Min(0.001) qty!: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateWarehouseTaskDto extends PartialType(CreateWarehouseTaskDto) {}

export class AssignTaskDto {
  @ApiProperty() @IsString() assignedTo!: string;
}

export class CompleteTaskDto {
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ScanTaskDto {
  @ApiProperty() @IsString() @Length(1, 50) code!: string;
}

export class SuggestPickDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty() @IsString() warehouseId!: string;
  @ApiProperty() @IsNumber() @Min(0.001) qty!: number;
  @ApiPropertyOptional({ enum: PICKING_STRATEGIES }) @IsOptional() @IsIn(PICKING_STRATEGIES) strategy?: (typeof PICKING_STRATEGIES)[number];
}

export class WavePickDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true }) deliveryIds!: string[];
  @ApiPropertyOptional({ enum: PICKING_STRATEGIES }) @IsOptional() @IsIn(PICKING_STRATEGIES) strategy?: (typeof PICKING_STRATEGIES)[number];
}
