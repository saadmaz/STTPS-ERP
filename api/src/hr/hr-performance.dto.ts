import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { CYCLE_STATUSES, DEVELOPMENT_PLAN_STATUSES, GOAL_STATUSES, GOAL_TYPES } from "./hr-performance.models.js";

export class CreatePerformanceCycleDto {
  @ApiProperty() @IsString() @Length(1, 30) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty() @IsISO8601({ strict: true }) startDate!: string;
  @ApiProperty() @IsISO8601({ strict: true }) endDate!: string;
  @ApiPropertyOptional({ enum: CYCLE_STATUSES }) @IsOptional() @IsIn(CYCLE_STATUSES) status?: (typeof CYCLE_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
export class UpdatePerformanceCycleDto extends PartialType(CreatePerformanceCycleDto) {}

export class CreateGoalDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsString() cycleId!: string;
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ enum: GOAL_TYPES }) @IsOptional() @IsIn(GOAL_TYPES) type?: (typeof GOAL_TYPES)[number];
  @IsOptional() @IsInt() @Min(0) @Max(100) weight?: number;
  @IsOptional() @IsString() @MaxLength(100) targetValue?: string;
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
}
export class UpdateGoalDto extends PartialType(CreateGoalDto) {
  @ApiPropertyOptional({ enum: GOAL_STATUSES }) @IsOptional() @IsIn(GOAL_STATUSES) status?: (typeof GOAL_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(100) currentValue?: string;
}

export class SelfGoalDto {
  @ApiProperty() @IsString() cycleId!: string;
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ enum: GOAL_TYPES }) @IsOptional() @IsIn(GOAL_TYPES) type?: (typeof GOAL_TYPES)[number];
  @IsOptional() @IsInt() @Min(0) @Max(100) weight?: number;
  @IsOptional() @IsString() @MaxLength(100) targetValue?: string;
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
}

export class UpdateGoalProgressDto {
  @ApiProperty({ enum: GOAL_STATUSES }) @IsIn(GOAL_STATUSES) status!: (typeof GOAL_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(100) currentValue?: string;
}

export class CreateReviewDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsString() cycleId!: string;
  @ApiProperty({ enum: ["manager", "peer"], description: "A self-review is created through the self-service endpoint" }) @IsIn(["manager", "peer"]) type!: "manager" | "peer";
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsString() @MaxLength(2000) strengths?: string;
  @IsOptional() @IsString() @MaxLength(2000) improvements?: string;
  @IsOptional() @IsString() @MaxLength(2000) comments?: string;
  @IsOptional() @IsBoolean() recommendsPromotion?: boolean;
  @IsOptional() @IsString() @MaxLength(500) promotionNote?: string;
}
export class UpdateReviewDto extends PartialType(CreateReviewDto) {}

export class SelfReviewDto {
  @ApiProperty() @IsString() cycleId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsString() @MaxLength(2000) strengths?: string;
  @IsOptional() @IsString() @MaxLength(2000) improvements?: string;
  @IsOptional() @IsString() @MaxLength(2000) comments?: string;
}

export class CreateDevelopmentPlanDto {
  @ApiProperty() @IsString() employeeId!: string;
  @IsOptional() @IsString() cycleId?: string;
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) focusAreas?: string;
  @IsOptional() @IsString() @MaxLength(2000) actions?: string;
  @IsOptional() @IsISO8601({ strict: true }) targetDate?: string;
  @ApiPropertyOptional({ enum: DEVELOPMENT_PLAN_STATUSES }) @IsOptional() @IsIn(DEVELOPMENT_PLAN_STATUSES) status?: (typeof DEVELOPMENT_PLAN_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateDevelopmentPlanDto extends PartialType(CreateDevelopmentPlanDto) {}
