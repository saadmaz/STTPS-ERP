import { IsString, IsOptional, IsInt, IsArray, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateIncidentDto {
  @IsString() number: string;
  @IsString() title: string;
  @IsOptional() @IsString() incidentType?: string;
  @IsOptional() @IsString() severity?: string;
  @IsString() reportedBy: string;
  @IsDateString() occurredAt: string;
  @IsOptional() @IsString() location?: string;
  @IsString() description: string;
  @IsOptional() @IsString() injuries?: string;
  @IsOptional() @IsString() witnesses?: string;
}

export class InvestigateIncidentDto {
  @IsOptional() @IsString() rootCause?: string;
  @IsOptional() @IsString() preventiveActions?: string;
}

export class RiskHazardDto {
  @IsString() hazard: string;
  @IsOptional() @IsString() category?: string;
  @IsInt() @Min(1) @Max(5) likelihood: number;
  @IsInt() @Min(1) @Max(5) severity: number;
  @IsOptional() @IsString() controls?: string;
  @IsOptional() @IsInt() residualLikelihood?: number;
  @IsOptional() @IsInt() residualSeverity?: number;
}

export class CreateRiskAssessmentDto {
  @IsString() number: string;
  @IsString() title: string;
  @IsString() assessedBy: string;
  @IsDateString() reviewDue: string;
  @IsOptional() @ApiProperty({ type: [RiskHazardDto] }) @IsArray() @Type(() => RiskHazardDto) hazards?: RiskHazardDto[];
}

export class CreatePermitDto {
  @IsString() number: string;
  @IsOptional() @IsString() permitType?: string;
  @IsString() title: string;
  @IsOptional() @IsString() location?: string;
  @IsString() requestedBy: string;
  @IsDateString() validFrom: string;
  @IsDateString() validTo: string;
  @IsOptional() @IsString() conditions?: string;
}

export class ApprovePermitDto {
  @IsString() approvedBy: string;
}
