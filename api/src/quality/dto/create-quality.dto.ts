import { IsString, IsOptional, IsBoolean, IsInt, IsArray, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTemplateItemDto {
  @IsInt() sequence: number;
  @IsString() question: string;
  @IsOptional() @IsString() itemType?: string;
  @IsOptional() options?: any;
  @IsOptional() @IsBoolean() isRequired?: boolean;
}

export class CreateInspectionTemplateDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @ApiProperty({ type: [CreateTemplateItemDto] }) @IsArray() @Type(() => CreateTemplateItemDto) items?: CreateTemplateItemDto[];
}

export class CreateInspectionDto {
  @IsString() templateId: string;
  @IsString() number: string;
  @IsString() title: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsString() referenceId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class InspectionResponseDto {
  @IsString() itemId: string;
  @IsOptional() @IsString() result?: string;
  @IsOptional() numericValue?: number;
  @IsOptional() @IsString() textValue?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() hasDefect?: boolean;
}

export class CompleteInspectionDto {
  @IsString() conductedBy: string;
  @IsOptional() @IsString() findings?: string;
  @IsOptional() @IsString() overallResult?: string;
  @IsOptional() @ApiProperty({ type: [InspectionResponseDto] }) @IsArray() @Type(() => InspectionResponseDto) responses?: InspectionResponseDto[];
}

export class CreateNCRDto {
  @IsString() number: string;
  @IsString() title: string;
  @IsString() description: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() severity?: string;
  @IsString() raisedBy: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() inspectionId?: string;
}

export class CreateNCRActionDto {
  @IsString() actionType: string;
  @IsString() description: string;
  @IsString() assignedTo: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class CloseNCRDto {
  @IsOptional() @IsString() resolution?: string;
}

export class CreateAuditDto {
  @IsString() number: string;
  @IsString() title: string;
  @IsOptional() @IsString() auditType?: string;
  @IsOptional() @IsString() standard?: string;
  @IsOptional() @IsString() scope?: string;
  @IsString() leadAuditor: string;
  @IsDateString() scheduledStart: string;
  @IsDateString() scheduledEnd: string;
}

export class CreateAuditFindingDto {
  @IsString() findingType: string;
  @IsString() description: string;
  @IsOptional() @IsString() clause?: string;
  @IsOptional() @IsBoolean() requiresAction?: boolean;
}

export class CompleteAuditDto {
  @IsOptional() @IsString() findings?: string;
  @IsOptional() @IsString() result?: string;
  @IsOptional() @ApiProperty({ type: [CreateAuditFindingDto] }) @IsArray() @Type(() => CreateAuditFindingDto) findings_?: CreateAuditFindingDto[];
}
