import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from "class-validator";
import { PLAN_FREQUENCIES, WORK_ORDER_PRIORITIES, WORK_ORDER_TYPES } from "./maintenance.models.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const QTY = /^\d{1,13}(\.\d{1,3})?$/;

export class CreateMaintenancePlanDto {
  @ApiProperty() @IsString() assetId!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty({ enum: PLAN_FREQUENCIES }) @IsIn(PLAN_FREQUENCIES) frequency!: (typeof PLAN_FREQUENCIES)[number];
  @ApiPropertyOptional({ description: "For a custom frequency; daily/weekly/monthly already imply one" }) @IsOptional() @IsInt() @Min(1) @Max(3650) intervalDays?: number;
  @ApiProperty() @IsISO8601({ strict: true }) nextDueDate!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) checklistTemplate?: string[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateMaintenancePlanDto extends PartialType(CreateMaintenancePlanDto) {}

export class CreateWorkOrderDto {
  @ApiProperty() @IsString() assetId!: string;
  @IsOptional() @IsString() planId?: string;
  @ApiPropertyOptional({ enum: WORK_ORDER_TYPES }) @IsOptional() @IsIn(WORK_ORDER_TYPES) type?: (typeof WORK_ORDER_TYPES)[number];
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ enum: WORK_ORDER_PRIORITIES }) @IsOptional() @IsIn(WORK_ORDER_PRIORITIES) priority?: (typeof WORK_ORDER_PRIORITIES)[number];
  @IsOptional() @IsISO8601({ strict: true }) scheduledDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateWorkOrderDto extends PartialType(CreateWorkOrderDto) {}

export class AssignTechnicianDto {
  @ApiProperty({ description: "User id" }) @IsString() assignedTo!: string;
  @IsOptional() @IsISO8601({ strict: true }) scheduledDate?: string;
}

export class CompleteWorkOrderDto {
  @IsOptional() @IsInt() @Min(0) @Max(100_000) downtimeMinutes?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class AddPartDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ description: "Quantity, e.g. 2 or 1.5" }) @Matches(QTY) qty!: string;
  @IsOptional() @Matches(MONEY) unitCost?: string;
}

export class LogLaborDto {
  @ApiProperty({ description: "Hours, e.g. 1.5" }) @Matches(QTY) hours!: string;
  @IsOptional() @Matches(MONEY) hourlyCost?: string;
}

export class ChecklistItemInputDto {
  @ApiProperty() @IsString() @Length(1, 200) text!: string;
}
export class SetChecklistItemDto {
  @ApiProperty() @IsBoolean() done!: boolean;
}
