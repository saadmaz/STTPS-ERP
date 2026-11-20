import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min, ValidateNested } from "class-validator";
import { CAMPAIGN_TYPES, SEGMENT_ENTITY_TYPES, SEQUENCE_TRIGGERS } from "./marketing.models.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;

export class CreateCampaignDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty({ enum: CAMPAIGN_TYPES }) @IsIn(CAMPAIGN_TYPES) type!: (typeof CAMPAIGN_TYPES)[number];
  @IsOptional() @IsString() ownerUserId?: string;
  @ApiPropertyOptional({ example: "50000" }) @IsOptional() @Matches(MONEY) budget?: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) goals?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) channels?: string[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}

export class CreateSegmentDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiProperty({ enum: SEGMENT_ENTITY_TYPES }) @IsIn(SEGMENT_ENTITY_TYPES) entityType!: (typeof SEGMENT_ENTITY_TYPES)[number];
  @ApiPropertyOptional({ description: "field:value,field2:value2 — the same filter string every list endpoint accepts" }) @IsOptional() @IsString() @MaxLength(500) filter?: string;
}
export class UpdateSegmentDto extends PartialType(CreateSegmentDto) {}

export class SequenceStepDto {
  @ApiProperty() @IsInt() @Min(1) seq!: number;
  @ApiProperty() @IsInt() @Min(0) delayDays!: number;
  @ApiProperty() @IsString() @Length(1, 200) subject!: string;
  @ApiProperty() @IsString() @MaxLength(5000) body!: string;
}

export class CreateSequenceDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty({ enum: SEQUENCE_TRIGGERS }) @IsIn(SEQUENCE_TRIGGERS) trigger!: (typeof SEQUENCE_TRIGGERS)[number];
  @ApiPropertyOptional({ type: [SequenceStepDto] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => SequenceStepDto) steps?: SequenceStepDto[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateSequenceDto extends PartialType(CreateSequenceDto) {}

export class EnrollDto {
  @ApiProperty() @IsString() sequenceId!: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() accountId?: string;
}

/** Enrollments have no editable fields once created — advance or cancel instead. */
export class NoUpdateDto {}
