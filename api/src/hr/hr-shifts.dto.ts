import { ApiProperty, PartialType } from "@nestjs/swagger";
import { IsBoolean, IsHexColor, IsInt, IsISO8601, IsMilitaryTime, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";

export class CreateShiftTemplateDto {
  @ApiProperty() @IsString() @Length(1, 20) code!: string;
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
  @ApiProperty() @IsMilitaryTime() startTime!: string;
  @ApiProperty() @IsMilitaryTime() endTime!: string;
  @IsOptional() @IsInt() @Min(0) @Max(240) breakMinutes?: number;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateShiftTemplateDto extends PartialType(CreateShiftTemplateDto) {}

export class CreateAssignmentDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsISO8601({ strict: true }) date!: string;
  @ApiProperty() @IsString() templateId!: string;
  @IsOptional() @IsBoolean() isHoliday?: boolean;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class UpdateAssignmentDto extends PartialType(CreateAssignmentDto) {}

export class RequestSwapDto {
  @ApiProperty({ description: "The other assignment to swap with" }) @IsString() targetAssignmentId!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class DecideSwapDto {
  @ApiProperty() @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CancelAssignmentDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
