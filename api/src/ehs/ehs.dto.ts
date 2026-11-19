import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { INCIDENT_SEVERITIES, INCIDENT_TYPES, PERMIT_TYPES } from "./ehs.models.js";

export class CreateIncidentDto {
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiPropertyOptional({ enum: INCIDENT_TYPES }) @IsOptional() @IsIn(INCIDENT_TYPES) incidentType?: (typeof INCIDENT_TYPES)[number];
  @ApiPropertyOptional({ enum: INCIDENT_SEVERITIES }) @IsOptional() @IsIn(INCIDENT_SEVERITIES) severity?: (typeof INCIDENT_SEVERITIES)[number];
  @ApiProperty() @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @ApiProperty() @IsString() @MaxLength(3000) description!: string;
  @IsOptional() @IsString() @MaxLength(1000) injuries?: string;
  @IsOptional() @IsString() @MaxLength(1000) witnesses?: string;
}
export class UpdateIncidentDto extends PartialType(CreateIncidentDto) {}

export class InvestigateIncidentDto {
  @IsOptional() @IsString() @MaxLength(3000) rootCause?: string;
  @IsOptional() @IsString() @MaxLength(3000) preventiveActions?: string;
}

export class RiskHazardDto {
  @ApiProperty() @IsString() @Length(1, 300) hazard!: string;
  @IsOptional() @IsString() @MaxLength(50) category?: string;
  @ApiProperty() @IsInt() @Min(1) @Max(5) likelihood!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5) severity!: number;
  @IsOptional() @IsString() @MaxLength(1000) controls?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) residualLikelihood?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) residualSeverity?: number;
}

export class CreateRiskAssessmentDto {
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiProperty() @IsDateString() reviewDue!: string;
  @ApiPropertyOptional({ type: [RiskHazardDto], description: "Can be added afterwards; at least one is needed before activating" })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => RiskHazardDto) hazards?: RiskHazardDto[];
}
export class UpdateRiskAssessmentDto extends PartialType(CreateRiskAssessmentDto) {}

export class CreatePermitDto {
  @ApiPropertyOptional({ enum: PERMIT_TYPES }) @IsOptional() @IsIn(PERMIT_TYPES) permitType?: (typeof PERMIT_TYPES)[number];
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @ApiProperty() @IsDateString() validFrom!: string;
  @ApiProperty() @IsDateString() validTo!: string;
  @IsOptional() @IsString() @MaxLength(2000) conditions?: string;
}
export class UpdatePermitDto extends PartialType(CreatePermitDto) {}
