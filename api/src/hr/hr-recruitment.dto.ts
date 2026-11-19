import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { EMPLOYMENT_TYPES } from "./hr.models.js";
import { CANDIDATE_SOURCES, INTERVIEW_TYPES, PIPELINE_STAGES } from "./hr-recruitment.models.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const CURRENCY = /^[A-Z]{3}$/;

export class CreateJobRequisitionDto {
  @ApiProperty() @IsString() positionId!: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) openings?: number;
  @ApiProperty() @IsString() @Length(1, 2000) justification!: string;
  @IsOptional() @IsString() hiringManagerId?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @Matches(MONEY) targetSalaryMin?: string;
  @IsOptional() @Matches(MONEY) targetSalaryMax?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateJobRequisitionDto extends PartialType(CreateJobRequisitionDto) {}

export class CreateJobPostingDto {
  @ApiProperty() @IsString() requisitionId!: string;
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiProperty() @IsString() @Length(1, 5000) description!: string;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES }) @IsOptional() @IsIn(EMPLOYMENT_TYPES) employmentType?: (typeof EMPLOYMENT_TYPES)[number];
}
export class UpdateJobPostingDto extends PartialType(CreateJobPostingDto) {}

export class CreateCandidateDto {
  @IsOptional() @IsString() postingId?: string;
  @IsOptional() @IsString() requisitionId?: string;
  @ApiProperty() @IsString() @Length(1, 100) firstName!: string;
  @ApiProperty() @IsString() @Length(1, 100) lastName!: string;
  @ApiProperty() @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsUrl() @MaxLength(500) resumeUrl?: string;
  @IsOptional() @IsUrl() @MaxLength(500) linkedInUrl?: string;
  @ApiPropertyOptional({ enum: CANDIDATE_SOURCES }) @IsOptional() @IsIn(CANDIDATE_SOURCES) source?: (typeof CANDIDATE_SOURCES)[number];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) skills?: string[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateCandidateDto extends PartialType(CreateCandidateDto) {
  @ApiPropertyOptional({ enum: PIPELINE_STAGES }) @IsOptional() @IsIn(PIPELINE_STAGES) stage?: (typeof PIPELINE_STAGES)[number];
}

export class PublicApplyDto {
  @ApiProperty() @IsString() @Length(1, 100) firstName!: string;
  @ApiProperty() @IsString() @Length(1, 100) lastName!: string;
  @ApiProperty() @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsUrl() @MaxLength(500) resumeUrl?: string;
  @IsOptional() @IsUrl() @MaxLength(500) linkedInUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ScheduleInterviewDto {
  @ApiProperty() @IsISO8601() scheduledAt!: string;
  @ApiProperty({ enum: INTERVIEW_TYPES }) @IsIn(INTERVIEW_TYPES) type!: (typeof INTERVIEW_TYPES)[number];
  @IsOptional() @IsString() interviewerId?: string;
}
export class RecordScorecardDto {
  @ApiProperty({ enum: ["completed", "cancelled"] }) @IsIn(["completed", "cancelled"]) status!: "completed" | "cancelled";
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsString() @MaxLength(2000) comments?: string;
}
export class ExtendOfferDto {
  @IsOptional() @Matches(MONEY) salary?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class RespondOfferDto {
  @ApiProperty() @IsBoolean() accepted!: boolean;
}
export class RejectCandidateDto {
  @ApiProperty() @IsString() @Length(1, 500) reason!: string;
}
export class HireCandidateDto {
  @IsOptional() @IsISO8601() joiningDate?: string;
}
