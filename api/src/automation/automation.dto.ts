import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, Length, MaxLength, ValidateNested } from "class-validator";
import { AUTOMATION_ACTION_TYPES, AUTOMATION_CONDITION_OPERATORS, AUTOMATION_EVENT_TYPES } from "./automation.models.js";

export class AutomationConditionDto {
  @ApiProperty() @IsString() @Length(1, 200) field!: string;
  @ApiProperty({ enum: AUTOMATION_CONDITION_OPERATORS }) @IsIn(AUTOMATION_CONDITION_OPERATORS) operator!: (typeof AUTOMATION_CONDITION_OPERATORS)[number];
  @ApiProperty() @IsString() @MaxLength(500) value!: string;
}

export class AutomationActionDto {
  @ApiProperty({ enum: AUTOMATION_ACTION_TYPES }) @IsIn(AUTOMATION_ACTION_TYPES) type!: (typeof AUTOMATION_ACTION_TYPES)[number];
  @ApiProperty({ example: { title: "Reorder {{payload.productId}}", userIds: "actor" } }) @IsObject() config!: Record<string, string>;
}

export class CreateAutomationRuleDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @ApiProperty({ enum: AUTOMATION_EVENT_TYPES }) @IsIn(AUTOMATION_EVENT_TYPES) eventType!: (typeof AUTOMATION_EVENT_TYPES)[number];
  @ApiPropertyOptional({ type: [AutomationConditionDto] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AutomationConditionDto) conditions?: AutomationConditionDto[];
  @ApiPropertyOptional({ type: [AutomationActionDto] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AutomationActionDto) actions?: AutomationActionDto[];
}
export class UpdateAutomationRuleDto extends PartialType(CreateAutomationRuleDto) {}

/** Simulates a firing without a real event, to let an author check a rule before relying on it. */
export class TestRunAutomationRuleDto {
  @ApiPropertyOptional({ description: "Fields merged into the sample event payload", example: { productId: "p1", available: "3" } })
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}
