import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsMilitaryTime, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { ATTENDANCE_STATUSES } from "./hr-attendance.models.js";

export class CreateAttendanceRecordDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsISO8601({ strict: true }) date!: string;
  @IsOptional() @IsISO8601() clockIn?: string;
  @IsOptional() @IsISO8601() clockOut?: string;
  @ApiPropertyOptional({ enum: ATTENDANCE_STATUSES }) @IsOptional() @IsIn(ATTENDANCE_STATUSES) status?: (typeof ATTENDANCE_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateAttendanceRecordDto extends PartialType(CreateAttendanceRecordDto) {}

export class ClockActionDto {
  @ApiPropertyOptional({ enum: ["web", "mobile"] }) @IsOptional() @IsIn(["web", "mobile"]) method?: "web" | "mobile";
}

export class KioskClockDto {
  @ApiProperty({ description: "The device's own bearer key" }) @IsString() deviceKey!: string;
  @ApiProperty({ enum: ["in", "out", "break_start", "break_end"] }) @IsIn(["in", "out", "break_start", "break_end"]) action!: "in" | "out" | "break_start" | "break_end";
  @ApiProperty() @IsString() @Length(1, 30) employeeNumber!: string;
  @ApiPropertyOptional({ description: "Omit for a QR scan; a PIN clock-in needs the employee's PIN" }) @IsOptional() @IsString() @Length(4, 8) pin?: string;
}

export class RequestCorrectionDto {
  @IsOptional() @IsISO8601() requestedClockIn?: string;
  @IsOptional() @IsISO8601() requestedClockOut?: string;
  @ApiProperty() @IsString() @Length(1, 500) reason!: string;
}

export class DecideCorrectionDto {
  @ApiProperty() @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SetAttendancePinDto {
  @ApiProperty({ description: "4-8 digits" }) @IsString() @Length(4, 8) pin!: string;
}

export class MarkAbsentDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsISO8601({ strict: true }) date!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CreateDeviceDto {
  @ApiProperty() @IsString() @Length(1, 30) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() branchId?: string;
}
export class UpdateDeviceDto extends PartialType(CreateDeviceDto) {}

export class UpdateAttendanceSettingsDto {
  @IsOptional() @IsMilitaryTime() startTime?: string;
  @IsOptional() @IsMilitaryTime() endTime?: string;
  @IsOptional() @IsInt() @Min(0) @Max(240) graceMinutes?: number;
  @IsOptional() @IsInt() @Min(60) @Max(960) standardMinutes?: number;
}
