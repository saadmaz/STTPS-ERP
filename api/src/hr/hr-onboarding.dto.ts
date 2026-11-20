import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, Length, MaxLength, ValidateNested } from "class-validator";
import { CHECKLIST_ITEM_CATEGORIES, CHECKLIST_ITEM_STATUSES, CHECKLIST_TYPES } from "./hr-onboarding.models.js";

export class ChecklistItemDto {
  @ApiProperty() @IsString() @Length(1, 150) title!: string;
  @ApiProperty({ enum: CHECKLIST_ITEM_CATEGORIES }) @IsIn(CHECKLIST_ITEM_CATEGORIES) category!: (typeof CHECKLIST_ITEM_CATEGORIES)[number];
  @IsOptional() @IsString() assigneeUserId?: string;
  @IsOptional() @IsISO8601({ strict: true }) dueDate?: string;
}

export class CreateChecklistDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty({ enum: CHECKLIST_TYPES }) @IsIn(CHECKLIST_TYPES) type!: (typeof CHECKLIST_TYPES)[number];
  @IsOptional() @IsISO8601({ strict: true }) targetDate?: string;
  @ApiPropertyOptional({ type: [ChecklistItemDto], description: "Leave out to use the standard template for the type" })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ChecklistItemDto) items?: ChecklistItemDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateChecklistDto extends PartialType(CreateChecklistDto) {}

export class SetItemStatusDto {
  @ApiProperty({ enum: CHECKLIST_ITEM_STATUSES }) @IsIn(CHECKLIST_ITEM_STATUSES) status!: (typeof CHECKLIST_ITEM_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class AssignItemDto {
  @IsOptional() @IsString() userId?: string;
}

export class StartChecklistDto {
  @IsOptional() @IsISO8601({ strict: true }) targetDate?: string;
}

export class CancelChecklistDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
