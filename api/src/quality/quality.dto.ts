import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString,
  Length, MaxLength, Min, ValidateNested,
} from "class-validator";
import { INSPECTION_ITEM_TYPES, INSPECTION_RESPONSE_RESULTS, INSPECTION_RESULTS, INSPECTION_STAGES, NCR_ACTION_TYPES, NCR_SEVERITIES } from "./quality.models.js";

export class InspectionPlanItemDto {
  @ApiProperty() @IsInt() @Min(1) seq!: number;
  @ApiProperty() @IsString() @Length(1, 300) question!: string;
  @ApiPropertyOptional({ enum: INSPECTION_ITEM_TYPES }) @IsOptional() @IsIn(INSPECTION_ITEM_TYPES) type?: (typeof INSPECTION_ITEM_TYPES)[number];
  @IsOptional() @IsNumber() minValue?: number;
  @IsOptional() @IsNumber() maxValue?: number;
  @IsOptional() @IsBoolean() isRequired?: boolean;
}

export class CreateInspectionPlanDto {
  @ApiProperty() @IsString() @Length(1, 30) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty({ enum: INSPECTION_STAGES }) @IsIn(INSPECTION_STAGES) stage!: (typeof INSPECTION_STAGES)[number];
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsInt() @Min(1) sampleSize?: number;
  @ApiPropertyOptional({ type: [InspectionPlanItemDto], description: "Can be added afterwards" })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InspectionPlanItemDto) items?: InspectionPlanItemDto[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateInspectionPlanDto extends PartialType(CreateInspectionPlanDto) {}

export class CreateInspectionDto {
  @ApiProperty() @IsString() planId!: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsInt() @Min(0) qtyInspected?: number;
  @IsOptional() @IsInt() @Min(0) qtySampled?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateInspectionDto extends PartialType(CreateInspectionDto) {}

export class InspectionResponseDto {
  @ApiProperty() @IsString() itemId!: string;
  @ApiProperty({ enum: INSPECTION_RESPONSE_RESULTS }) @IsIn(INSPECTION_RESPONSE_RESULTS) result!: (typeof INSPECTION_RESPONSE_RESULTS)[number];
  @IsOptional() @IsNumber() numericValue?: number;
  @IsOptional() @IsString() @MaxLength(500) textValue?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CompleteInspectionDto {
  @ApiPropertyOptional({ type: [InspectionResponseDto] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => InspectionResponseDto) responses?: InspectionResponseDto[];
  @IsOptional() @IsInt() @Min(0) qtyRejected?: number;
  @IsOptional() @IsString() @MaxLength(2000) findings?: string;
  @ApiPropertyOptional({ enum: INSPECTION_RESULTS, description: "Computed from responses when left out" }) @IsOptional() @IsIn(INSPECTION_RESULTS) overallResult?: (typeof INSPECTION_RESULTS)[number];
}

export class CreateNonConformanceDto {
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiProperty() @IsString() @MaxLength(2000) description!: string;
  @ApiPropertyOptional({ enum: NCR_SEVERITIES }) @IsOptional() @IsIn(NCR_SEVERITIES) severity?: (typeof NCR_SEVERITIES)[number];
  @IsOptional() @IsString() inspectionId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}
export class UpdateNonConformanceDto extends PartialType(CreateNonConformanceDto) {}

export class AddNcrActionDto {
  @ApiProperty({ enum: NCR_ACTION_TYPES }) @IsIn(NCR_ACTION_TYPES) type!: (typeof NCR_ACTION_TYPES)[number];
  @ApiProperty() @IsString() @MaxLength(1000) description!: string;
  @ApiProperty() @IsString() assignedTo!: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class CloseNcrDto {
  @IsOptional() @IsString() @MaxLength(2000) resolution?: string;
}
