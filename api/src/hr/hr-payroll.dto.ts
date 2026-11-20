import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CALCULATION_TYPES, COMPONENT_CATEGORIES, COMPONENT_TYPES, LOAN_TYPES, STATUTORY_CODES } from "./hr-payroll.models.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;

export class CreateStatutoryRateDto {
  @ApiProperty({ enum: STATUTORY_CODES }) @IsIn(STATUTORY_CODES) code!: (typeof STATUTORY_CODES)[number];
  @ApiProperty({ description: "Hundredths of a percent; 800 = 8%" }) @IsInt() @Min(0) @Max(10000) rate!: number;
  @ApiProperty() @IsISO8601({ strict: true }) effectiveFrom!: string;
  @IsOptional() @IsISO8601({ strict: true }) effectiveTo?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class UpdateStatutoryRateDto extends PartialType(CreateStatutoryRateDto) {}

export class CreateApitBracketDto {
  @ApiProperty() @IsISO8601({ strict: true }) effectiveFrom!: string;
  @IsOptional() @IsISO8601({ strict: true }) effectiveTo?: string;
  @ApiProperty({ description: "Monthly taxable income, minor units, the band this row applies from" }) @IsString() @Matches(MONEY) lowerBound!: string;
  @ApiProperty({ description: "Hundredths of a percent" }) @IsInt() @Min(0) @Max(10000) rate!: number;
  @ApiProperty({ description: "Minor units, the published table's subtraction constant for this band" }) @IsString() @Matches(MONEY) subtractAmount!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class UpdateApitBracketDto extends PartialType(CreateApitBracketDto) {}

export class CreateSalaryComponentDto {
  @ApiProperty() @IsString() @Length(1, 20) code!: string;
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
  @ApiProperty({ enum: COMPONENT_TYPES }) @IsIn(COMPONENT_TYPES) type!: (typeof COMPONENT_TYPES)[number];
  @ApiProperty({ enum: COMPONENT_CATEGORIES }) @IsIn(COMPONENT_CATEGORIES) category!: (typeof COMPONENT_CATEGORIES)[number];
  @ApiPropertyOptional({ enum: CALCULATION_TYPES }) @IsOptional() @IsIn(CALCULATION_TYPES) calculationType?: (typeof CALCULATION_TYPES)[number];
  @IsOptional() @IsBoolean() isTaxable?: boolean;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class UpdateSalaryComponentDto extends PartialType(CreateSalaryComponentDto) {}

export class StructureLineDto {
  @ApiProperty() @IsString() componentId!: string;
  @ApiProperty({ description: "Minor units for a fixed component, hundredths of a percent of basic otherwise" }) @IsString() @Matches(MONEY) amount!: string;
}

export class CreateSalaryStructureDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsISO8601({ strict: true }) effectiveFrom!: string;
  @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsString() @Matches(MONEY) basicSalary!: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => StructureLineDto) lines?: StructureLineDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class UpdateSalaryStructureDto extends PartialType(CreateSalaryStructureDto) {}

export class CreateLoanDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty({ enum: LOAN_TYPES }) @IsIn(LOAN_TYPES) type!: (typeof LOAN_TYPES)[number];
  @ApiProperty() @IsString() @Matches(MONEY) principal!: string;
  @ApiProperty() @IsString() @Matches(MONEY) installmentAmount!: string;
  @ApiProperty() @IsISO8601({ strict: true }) grantedOn!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
/** Only the note can be changed after a loan is granted; amounts and dates are fixed by the disbursement posting. */
export class UpdateLoanDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreatePayrollRunDto {
  @ApiProperty({ description: "YYYY-MM" }) @IsString() @Length(7, 7) period!: string;
  @IsOptional() @IsISO8601({ strict: true }) payDate?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
/** Only the note can be changed by hand; every other field is set by the pipeline actions. */
export class UpdatePayrollRunDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ApprovePayrollRunDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
