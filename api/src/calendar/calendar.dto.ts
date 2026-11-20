import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { EVENT_VISIBILITIES, RECURRENCE_FREQUENCIES } from "./calendar.models.js";

export class EventRecurrenceDto {
  @ApiProperty({ enum: RECURRENCE_FREQUENCIES }) @IsIn(RECURRENCE_FREQUENCIES) frequency!: (typeof RECURRENCE_FREQUENCIES)[number];
  @IsOptional() @IsInt() @Min(1) @Max(52) interval?: number;
  @IsOptional() @IsISO8601({ strict: true }) until?: string;
}

export class CreateCalendarEventDto {
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiProperty() @IsISO8601() startAt!: string;
  @ApiProperty() @IsISO8601() endAt!: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) attendeeIds?: string[];
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @ValidateNested() @Type(() => EventRecurrenceDto) recurrence?: EventRecurrenceDto;
  @IsOptional() @IsInt() @Min(0) @Max(10_080) reminderMinutesBefore?: number;
  @ApiPropertyOptional({ enum: EVENT_VISIBILITIES }) @IsOptional() @IsIn(EVENT_VISIBILITIES) visibility?: (typeof EVENT_VISIBILITIES)[number];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateCalendarEventDto extends PartialType(CreateCalendarEventDto) {}

export class RsvpDto {
  @ApiProperty({ enum: ["accepted", "declined", "tentative"] }) @IsIn(["accepted", "declined", "tentative"]) status!: "accepted" | "declined" | "tentative";
}
