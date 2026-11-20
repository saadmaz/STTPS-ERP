import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { BRANCH_TYPES, BranchType } from "../org.models.js";

const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CODE_MESSAGE = "code may contain letters, digits, dot, dash and underscore";

export class AddressDto {
  @IsOptional() @IsString() @MaxLength(200) line1?: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @ApiPropertyOptional({ description: "ISO 3166-1 alpha-2" })
  @IsOptional() @IsString() @Length(2, 2) country?: string;
}

class CodedDto {
  @ApiProperty({ example: "HQ" })
  @IsString() @Length(1, 30) @Matches(CODE, { message: CODE_MESSAGE })
  code!: string;

  @ApiProperty()
  @IsString() @Length(1, 150)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: "Values for the company's custom fields of this record type" })
  @IsOptional() @IsObject()
  customFields?: Record<string, unknown>;
}

export class CreateBranchDto extends CodedDto {
  @ApiPropertyOptional({ enum: BRANCH_TYPES, default: "branch" })
  @IsOptional() @IsIn(BRANCH_TYPES)
  type?: BranchType;

  @IsOptional() @ValidateNested() @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() managerUserId?: string;
  @ApiPropertyOptional({ example: "Asia/Colombo" })
  @IsOptional() @IsString() @MaxLength(60) timezone?: string;
}
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

export class CreateDepartmentDto extends CodedDto {
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() costCentreId?: string;
  @IsOptional() @IsString() managerUserId?: string;
}
export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}

export class CreateTeamDto extends CodedDto {
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() leadUserId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) memberUserIds?: string[];
}
export class UpdateTeamDto extends PartialType(CreateTeamDto) {}

export class CreateCostCentreDto extends CodedDto {
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() ownerUserId?: string;
}
export class UpdateCostCentreDto extends PartialType(CreateCostCentreDto) {}

export class CreateBusinessUnitDto extends CodedDto {
  @IsOptional() @IsString() managerUserId?: string;
}
export class UpdateBusinessUnitDto extends PartialType(CreateBusinessUnitDto) {}

export class CreateFiscalYearDto {
  @ApiProperty({ example: "FY2026" })
  @IsString() @Length(1, 30) @Matches(CODE, { message: CODE_MESSAGE })
  code!: string;

  @ApiPropertyOptional({ example: "Financial year 2026/27" })
  @IsOptional() @IsString() @Length(1, 150)
  name?: string;

  @ApiProperty({ example: "2026-04-01", description: "First day; periods are calendar months from here" })
  @IsISO8601({ strict: true }) @Matches(/^\d{4}-\d{2}-01$/, { message: "startDate must be the first day of a month" })
  startDate!: string;

  @ApiPropertyOptional({ default: 12, description: "Number of monthly periods" })
  @IsOptional() @Type(() => Number)
  months?: number;
}
export class UpdateFiscalYearDto {
  @IsOptional() @IsString() @Length(1, 150)
  name?: string;
}

export class SetPeriodStatusDto {
  @ApiProperty({ enum: ["open", "soft_closed", "locked"] })
  @IsIn(["open", "soft_closed", "locked"])
  status!: "open" | "soft_closed" | "locked";
}

export class CreateExchangeRateDto {
  @ApiProperty({ example: "USD" }) @IsString() @Matches(/^[A-Z]{3}$/) fromCurrency!: string;
  @ApiProperty({ example: "LKR" }) @IsString() @Matches(/^[A-Z]{3}$/) toCurrency!: string;
  @ApiProperty({ example: "297.5" })
  @IsString() @Matches(/^\d{1,12}(\.\d{1,10})?$/, { message: "rate must be a positive decimal with up to 10 places" })
  rate!: string;
  @ApiProperty({ example: "2026-11-19" }) @IsISO8601({ strict: true }) effectiveDate!: string;
  @IsOptional() @IsString() @MaxLength(60) source?: string;
}
export class UpdateExchangeRateDto extends PartialType(CreateExchangeRateDto) {}
