import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES } from "./hr.models.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const CURRENCY = /^[A-Z]{3}$/;

export class AddressDto {
  @IsOptional() @IsString() @MaxLength(200) line1?: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @ApiPropertyOptional({ description: "ISO 3166-1 alpha-2" }) @IsOptional() @IsString() @Length(2, 2) country?: string;
}

export class EmergencyContactDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() @MaxLength(60) relationship?: string;
  @ApiProperty() @IsString() @Length(1, 40) phone!: string;
}

export class BankDetailsDto {
  @IsOptional() @IsString() @MaxLength(150) bankName?: string;
  @IsOptional() @IsString() @MaxLength(150) branch?: string;
  @IsOptional() @IsString() @MaxLength(150) accountName?: string;
  @IsOptional() @IsString() @MaxLength(60) accountNumber?: string;
}

export class CompensationDto {
  @ApiProperty({ example: "150000.00" }) @Matches(MONEY) salary!: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsIn(["monthly", "biweekly", "weekly"]) payFrequency?: "monthly" | "biweekly" | "weekly";
  @IsOptional() @IsISO8601({ strict: true }) effectiveDate?: string;
}

export class QualificationDto {
  @ApiProperty() @IsString() @Length(1, 150) title!: string;
  @IsOptional() @IsString() @MaxLength(150) institution?: string;
  @IsOptional() @IsInt() @Min(1900) @Max(2200) year?: number;
}

export class CertificationDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() @MaxLength(150) issuer?: string;
  @IsOptional() @IsISO8601({ strict: true }) issuedDate?: string;
  @IsOptional() @IsISO8601({ strict: true }) expiryDate?: string;
}

export class CreateJobGradeDto {
  @ApiProperty() @IsString() @Length(1, 20) code!: string;
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @Matches(MONEY) minSalary?: string;
  @IsOptional() @Matches(MONEY) maxSalary?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateJobGradeDto extends PartialType(CreateJobGradeDto) {}

export class CreatePositionDto {
  @ApiProperty() @IsString() @Length(1, 20) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) title!: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() jobGradeId?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(["active", "inactive"]) status?: "active" | "inactive";
}
export class UpdatePositionDto extends PartialType(CreatePositionDto) {}

export class CreateEmployeeDto {
  @ApiPropertyOptional({ description: "Leave blank to number automatically (EMP-000001)" }) @IsOptional() @IsString() @Length(1, 30) employeeNumber?: string;
  @IsOptional() @IsString() userId?: string;
  @ApiProperty() @IsString() @Length(1, 100) firstName!: string;
  @ApiProperty() @IsString() @Length(1, 100) lastName!: string;
  @IsOptional() @IsString() @MaxLength(100) preferredName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsISO8601({ strict: true }) dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(30) gender?: string;
  @IsOptional() @IsString() @MaxLength(30) maritalStatus?: string;
  @IsOptional() @IsString() @MaxLength(60) nationality?: string;
  @ApiPropertyOptional({ description: "Sensitive: needs hr.employee.compensation to set or change" }) @IsOptional() @IsString() @MaxLength(60) nationalId?: string;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) address?: AddressDto;
  @IsOptional() @ValidateNested() @Type(() => EmergencyContactDto) emergencyContact?: EmergencyContactDto;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() positionId?: string;
  @IsOptional() @IsString() jobGradeId?: string;
  @IsOptional() @IsString() managerId?: string;
  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES }) @IsOptional() @IsIn(EMPLOYMENT_TYPES) employmentType?: (typeof EMPLOYMENT_TYPES)[number];
  @ApiPropertyOptional({ enum: EMPLOYEE_STATUSES }) @IsOptional() @IsIn(EMPLOYEE_STATUSES) status?: (typeof EMPLOYEE_STATUSES)[number];
  @ApiProperty() @IsISO8601({ strict: true }) joiningDate!: string;
  @IsOptional() @IsISO8601({ strict: true }) probationEndDate?: string;
  @IsOptional() @IsIn(["permanent", "fixed_term", "casual"]) contractType?: "permanent" | "fixed_term" | "casual";
  @IsOptional() @IsISO8601({ strict: true }) contractEndDate?: string;
  @ApiPropertyOptional({ description: "Sensitive: needs hr.employee.compensation to set or change" }) @IsOptional() @ValidateNested() @Type(() => CompensationDto) compensation?: CompensationDto;
  @ApiPropertyOptional({ description: "Sensitive: needs hr.employee.compensation to set or change" }) @IsOptional() @ValidateNested() @Type(() => BankDetailsDto) bankDetails?: BankDetailsDto;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => QualificationDto) qualifications?: QualificationDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) skills?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CertificationDto) certifications?: CertificationDto[];
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

export class TerminateDto {
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @IsString() @Length(1, 500) reason!: string;
}
export class ReinstateDto {
  @IsOptional() @IsISO8601({ strict: true }) date?: string;
}

/** The "allowed personal updates" of blueprint §11 self-service: contact details only, nothing employment- or pay-related. */
export class UpdateMyProfileDto {
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) address?: AddressDto;
  @IsOptional() @ValidateNested() @Type(() => EmergencyContactDto) emergencyContact?: EmergencyContactDto;
}
