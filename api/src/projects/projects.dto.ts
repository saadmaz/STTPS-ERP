import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength, Min } from "class-validator";
import { BILLING_METHODS, COST_CATEGORIES, PROJECT_PRIORITIES, PROJECT_STATUSES } from "./projects.models.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;

export class CreateProjectDto {
  @ApiProperty() @IsString() @Length(1, 30) code!: string;
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() managerId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) teamUserIds?: string[];
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsISO8601({ strict: true }) startDate?: string;
  @IsOptional() @IsISO8601({ strict: true }) endDate?: string;
  @ApiPropertyOptional({ enum: PROJECT_PRIORITIES }) @IsOptional() @IsIn(PROJECT_PRIORITIES) priority?: (typeof PROJECT_PRIORITIES)[number];
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() @Matches(MONEY) budget?: string;
  @IsOptional() @IsString() @Matches(MONEY) estimatedRevenue?: string;
  @IsOptional() @IsString() @Matches(MONEY) estimatedCost?: string;
  @ApiPropertyOptional({ enum: BILLING_METHODS }) @IsOptional() @IsIn(BILLING_METHODS) billingMethod?: (typeof BILLING_METHODS)[number];
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @ApiPropertyOptional({ enum: PROJECT_STATUSES }) @IsOptional() @IsIn(PROJECT_STATUSES) status?: (typeof PROJECT_STATUSES)[number];
}

export class CreatePhaseDto {
  @ApiProperty() @IsString() projectId!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsInt() @Min(0) sequence?: number;
  @IsOptional() @IsISO8601({ strict: true }) startDate?: string;
  @IsOptional() @IsISO8601({ strict: true }) endDate?: string;
}
export class UpdatePhaseDto extends PartialType(CreatePhaseDto) {}

export class CreateMilestoneDto {
  @ApiProperty() @IsString() projectId!: string;
  @IsOptional() @IsString() phaseId?: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {}

export class CreateProjectCostDto {
  @ApiProperty() @IsString() projectId!: string;
  @ApiProperty({ enum: COST_CATEGORIES }) @IsIn(COST_CATEGORIES) category!: (typeof COST_CATEGORIES)[number];
  @ApiProperty() @IsString() @Matches(MONEY) amount!: string;
  @ApiProperty() @IsISO8601({ strict: true }) date!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
export class UpdateProjectCostDto extends PartialType(CreateProjectCostDto) {}

export class BillProjectDto {
  @ApiProperty() @IsString() @Matches(MONEY) amount!: string;
  @ApiProperty() @IsString() @Length(1, 200) description!: string;
}
