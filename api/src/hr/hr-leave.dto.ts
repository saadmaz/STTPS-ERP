import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsBoolean, IsHexColor, IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { ACCRUAL_FREQUENCIES, LEAVE_TYPES } from "./hr-leave.models.js";

export class CreateLeavePolicyDto {
  @ApiProperty() @IsString() @Length(1, 20) code!: string;
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
  @ApiProperty({ enum: LEAVE_TYPES }) @IsIn(LEAVE_TYPES) type!: (typeof LEAVE_TYPES)[number];
  @ApiPropertyOptional({ enum: ACCRUAL_FREQUENCIES }) @IsOptional() @IsIn(ACCRUAL_FREQUENCIES) accrualFrequency?: (typeof ACCRUAL_FREQUENCIES)[number];
  @ApiProperty() @IsInt() @Min(0) @Max(365) annualEntitlementDays!: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) carryForwardMaxDays?: number;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(90) noticeDays?: number;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateLeavePolicyDto extends PartialType(CreateLeavePolicyDto) {}

export class CreateHolidayDto {
  @ApiProperty() @IsISO8601({ strict: true }) date!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsBoolean() isOptional?: boolean;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class UpdateHolidayDto extends PartialType(CreateHolidayDto) {}

export class RequestLeaveDto {
  @ApiProperty() @IsString() policyId!: string;
  @ApiProperty() @IsISO8601({ strict: true }) startDate!: string;
  @ApiProperty() @IsISO8601({ strict: true }) endDate!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CreateLeaveRequestDto extends RequestLeaveDto {
  @ApiProperty() @IsString() employeeId!: string;
}
export class UpdateLeaveRequestDto extends PartialType(CreateLeaveRequestDto) {}

export class DecideLeaveRequestDto {
  @ApiProperty() @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CancelLeaveRequestDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class RolloverDto {
  @ApiProperty({ description: "The year to roll every employee's balance into" }) @IsInt() @Min(2000) @Max(2200) year!: number;
}
