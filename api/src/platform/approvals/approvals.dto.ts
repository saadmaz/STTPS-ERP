import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsDefined,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { APPROVER_TYPES, ApproverType, CONDITION_OPS, ConditionOp } from "./approvals.models.js";

export class ConditionDto {
  @ApiProperty({ example: "amount" }) @IsString() @Length(1, 60) fact!: string;
  @ApiProperty({ enum: CONDITION_OPS }) @IsIn(CONDITION_OPS) op!: ConditionOp;
  @ApiProperty({ description: "Number, string, boolean, or an array for in/nin", example: 10000000 })
  @IsDefined()
  value!: string | number | boolean | (string | number)[];
}

export class ApproverSpecDto {
  @ApiProperty({ enum: APPROVER_TYPES }) @IsIn(APPROVER_TYPES) type!: ApproverType;
  @ApiPropertyOptional({ description: "User ids, role ids or permission codes, depending on type" })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  ids?: string[];
}

export class StepDefinitionDto {
  @ApiProperty({ example: "Manager approval" }) @IsString() @Length(1, 100) name!: string;

  @ApiProperty({ type: [ApproverSpecDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ApproverSpecDto)
  approvers!: ApproverSpecDto[];

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Max(20) minApprovals?: number;

  @ApiPropertyOptional({ type: [ConditionDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ConditionDto)
  conditions?: ConditionDto[];

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(24 * 60) timeoutHours?: number;

  @ApiPropertyOptional({ type: [ApproverSpecDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ApproverSpecDto)
  escalateTo?: ApproverSpecDto[];
}

export class CreateApprovalDefinitionDto {
  @ApiProperty({ example: "PR-STANDARD" })
  @IsString() @Length(1, 40) @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  code!: string;

  @ApiProperty() @IsString() @Length(1, 150) name!: string;

  @ApiProperty({ example: "procurement.requisition" })
  @IsString() @Matches(/^[a-z]+\.[a-zA-Z]+$/, { message: "entityType looks like module.entity" })
  entityType!: string;

  @ApiPropertyOptional({ default: 100 }) @IsOptional() @IsInt() @Min(0) @Max(10_000) priority?: number;

  @ApiPropertyOptional({ type: [ConditionDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ConditionDto)
  conditions?: ConditionDto[];

  @ApiProperty({ type: [StepDefinitionDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => StepDefinitionDto)
  steps!: StepDefinitionDto[];

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() allowSelfApproval?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateApprovalDefinitionDto extends PartialType(CreateApprovalDefinitionDto) {}

export class CreateDelegationDto {
  @ApiPropertyOptional({ description: "Defaults to the current user; delegating for someone else needs workflow.delegation.create" })
  @IsOptional() @IsString() userId?: string;
  @ApiProperty() @IsString() delegateUserId!: string;
  @ApiProperty({ example: "2026-12-01" }) @IsISO8601({ strict: true }) startDate!: string;
  @ApiProperty({ example: "2026-12-14" }) @IsISO8601({ strict: true }) endDate!: string;
  @ApiPropertyOptional({ description: "Entity types covered; empty for all" })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) entityTypes?: string[];
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
export class UpdateDelegationDto extends PartialType(CreateDelegationDto) {}

export class DecisionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class RequiredCommentDto {
  @ApiProperty() @IsString() @Length(1, 2000) comment!: string;
}

export class ReassignDto {
  @ApiProperty() @IsString() toUserId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}
