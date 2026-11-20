import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { RECURRENCE_FREQUENCIES, TASK_PRIORITIES, TASK_STATUSES } from "./tasks.models.js";

export class RecurrenceDto {
  @ApiProperty({ enum: RECURRENCE_FREQUENCIES }) @IsIn(RECURRENCE_FREQUENCIES) frequency!: (typeof RECURRENCE_FREQUENCIES)[number];
  @IsOptional() @IsInt() @Min(1) @Max(52) interval?: number;
  @IsOptional() @IsISO8601({ strict: true }) until?: string;
}

export class CreateTaskDto {
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) collaboratorIds?: string[];
  @ApiPropertyOptional({ enum: TASK_PRIORITIES }) @IsOptional() @IsIn(TASK_PRIORITIES) priority?: (typeof TASK_PRIORITIES)[number];
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) estimatedHours?: number;
  @IsOptional() @IsString() parentTaskId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) dependsOnTaskIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) tags?: string[];
  @IsOptional() @ValidateNested() @Type(() => RecurrenceDto) recurrence?: RecurrenceDto;
  @IsOptional() @IsISO8601() reminderAt?: string;
}
/** Status changes go through `setStatus` instead, which also handles recurrence. */
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}

export class SetTaskStatusDto {
  @ApiProperty({ enum: TASK_STATUSES }) @IsIn(TASK_STATUSES) status!: (typeof TASK_STATUSES)[number];
}

export class ChecklistItemInputDto {
  @ApiProperty() @IsString() @Length(1, 200) text!: string;
}

export class SetChecklistItemDto {
  @ApiProperty() @IsBoolean() done!: boolean;
}

export class SelfTimeEntryDto {
  @ApiProperty() @IsISO8601({ strict: true }) date!: string;
  @IsOptional() @IsString() taskId?: string;
  @IsOptional() @IsString() projectId?: string;
  @ApiProperty({ description: "Hours, e.g. 1.5" }) @IsString() hours!: string;
  @IsOptional() @IsBoolean() billable?: boolean;
  @IsOptional() @IsString() cost?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
export class CreateTimeEntryDto extends SelfTimeEntryDto {
  @ApiProperty() @IsString() userId!: string;
}
export class UpdateTimeEntryDto extends PartialType(CreateTimeEntryDto) {}

export class ApproveTimeEntryDto {
  @ApiProperty() @IsBoolean() approve!: boolean;
}
