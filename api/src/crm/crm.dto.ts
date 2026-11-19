import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  FORECAST_CATEGORIES,
  LEAD_STATUSES,
  OPPORTUNITY_STAGES,
} from "./crm.models.js";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;
const CURRENCY = /^[A-Z]{3}$/;

export class AddressDto {
  @IsOptional() @IsString() @MaxLength(200) line1?: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
}

class WithCustomFields {
  @ApiPropertyOptional() @IsOptional() @IsObject() customFields?: Record<string, unknown>;
  @ApiPropertyOptional({ description: "Create even when possible duplicates exist" }) @IsOptional() @IsBoolean() allowDuplicate?: boolean;
}

export class CreateAccountDto extends WithCustomFields {
  @ApiPropertyOptional({ description: "Leave blank to number automatically (CUS-000001)" })
  @IsOptional() @IsString() @Length(1, 30) @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  code?: string;
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @ApiPropertyOptional({ enum: ACCOUNT_TYPES }) @IsOptional() @IsIn(ACCOUNT_TYPES) type?: (typeof ACCOUNT_TYPES)[number];
  @ApiPropertyOptional({ enum: ACCOUNT_STATUSES }) @IsOptional() @IsIn(ACCOUNT_STATUSES) status?: (typeof ACCOUNT_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(60) segment?: string;
  @IsOptional() @IsString() @MaxLength(60) industry?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsUrl({ require_protocol: false }) @MaxLength(300) website?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) billingAddress?: AddressDto;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) shippingAddress?: AddressDto;
  @ApiPropertyOptional({ example: "LKR" }) @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
  @ApiPropertyOptional({ example: "500000.00", description: "Decimal string; blank for no limit" })
  @IsOptional() @Matches(MONEY) creditLimit?: string;
  @IsOptional() @IsString() @MaxLength(40) taxId?: string;
  @IsOptional() @IsString() priceListId?: string;
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @IsBoolean() portalAccess?: boolean;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}
export class UpdateAccountDto extends PartialType(CreateAccountDto) {}

export class CreateContactDto extends WithCustomFields {
  @ApiProperty() @IsString() @Length(1, 80) firstName!: string;
  @ApiProperty() @IsString() @Length(1, 80) lastName!: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsString() @MaxLength(60) role?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsIn(["email", "phone", "whatsapp", "sms"]) preferredChannel?: "email" | "phone" | "whatsapp" | "sms";
  @IsOptional() @IsBoolean() doNotContact?: boolean;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) address?: AddressDto;
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}
export class UpdateContactDto extends PartialType(CreateContactDto) {}

export class CreateLeadDto extends WithCustomFields {
  @ApiProperty() @IsString() @Length(1, 80) firstName!: string;
  @ApiProperty() @IsString() @Length(1, 80) lastName!: string;
  @IsOptional() @IsString() @MaxLength(200) company?: string;
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) website?: string;
  @IsOptional() @IsString() @MaxLength(60) source?: string;
  @IsOptional() @IsString() @MaxLength(120) campaign?: string;
  @ApiPropertyOptional({ enum: LEAD_STATUSES.filter((s) => s !== "converted") })
  @IsOptional() @IsIn(LEAD_STATUSES.filter((s) => s !== "converted")) status?: "new" | "contacted" | "qualified" | "unqualified";
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}
export class UpdateLeadDto extends PartialType(CreateLeadDto) {}

export class ConvertLeadDto {
  @ApiPropertyOptional({ description: "Attach to this existing account instead of creating one" })
  @IsOptional() @IsString() accountId?: string;
  @ApiPropertyOptional({ description: "Create an opportunity too" }) @IsOptional() @IsBoolean() createOpportunity?: boolean;
  @IsOptional() @IsString() @Length(1, 200) opportunityName?: string;
  @IsOptional() @Matches(MONEY) amount?: string;
  @IsOptional() @IsISO8601({ strict: true }) expectedCloseDate?: string;
}

export class CreateOpportunityDto extends OmitType(WithCustomFields, ["allowDuplicate"] as const) {
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() contactId?: string;
  @ApiPropertyOptional({ enum: OPPORTUNITY_STAGES.filter((s) => s !== "won" && s !== "lost") })
  @IsOptional() @IsIn(["prospecting", "qualification", "proposal", "negotiation"]) stage?: "prospecting" | "qualification" | "proposal" | "negotiation";
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @ApiPropertyOptional({ example: "1250000.00" }) @IsOptional() @Matches(MONEY) amount?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsISO8601({ strict: true }) expectedCloseDate?: string;
  @IsOptional() @IsIn(FORECAST_CATEGORIES) forecastCategory?: (typeof FORECAST_CATEGORIES)[number];
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(60) source?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) competitors?: string[];
  @IsOptional() @IsString() @MaxLength(300) nextAction?: string;
  @IsOptional() @IsISO8601({ strict: true }) nextActionDate?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}
export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {}

export class MoveStageDto {
  @ApiProperty({ enum: OPPORTUNITY_STAGES }) @IsIn(OPPORTUNITY_STAGES) stage!: (typeof OPPORTUNITY_STAGES)[number];
  @ApiPropertyOptional({ description: "Required when moving to won or lost" }) @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CreateActivityDto extends OmitType(WithCustomFields, ["allowDuplicate"] as const) {
  @ApiProperty({ enum: ACTIVITY_TYPES }) @IsIn(ACTIVITY_TYPES) type!: (typeof ACTIVITY_TYPES)[number];
  @ApiProperty() @IsString() @Length(1, 200) subject!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(ACTIVITY_STATUSES) status?: (typeof ACTIVITY_STATUSES)[number];
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsString() ownerUserId?: string;
  @ApiPropertyOptional({ example: "crm.lead" }) @IsOptional() @IsIn(["crm.lead", "crm.contact", "crm.account", "crm.opportunity"]) relatedType?: string;
  @IsOptional() @IsString() relatedId?: string;
}
export class UpdateActivityDto extends PartialType(CreateActivityDto) {
  @IsOptional() @IsString() @MaxLength(1000) outcome?: string;
}

export class CompleteActivityDto {
  @IsOptional() @IsString() @MaxLength(1000) outcome?: string;
}

export class ScoringRuleDto {
  @IsString() @MaxLength(40) field!: string;
  @IsIn(["present", "equals", "contains"]) test!: "present" | "equals" | "contains";
  @IsOptional() @IsString() @MaxLength(100) value?: string;
  @IsInt() @Min(-100) @Max(100) points!: number;
}

export class CrmSettingsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ScoringRuleDto) scoringRules?: ScoringRuleDto[];
  @IsOptional() @IsIn(["owner", "roundRobin"]) assignmentMode?: "owner" | "roundRobin";
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) assignees?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) leadSources?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) lossReasons?: string[];
}
