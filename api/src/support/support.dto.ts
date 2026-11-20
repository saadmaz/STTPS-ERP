import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { TICKET_CHANNELS, TICKET_PRIORITIES } from "./support.models.js";

export class SlaTargetDto {
  @ApiProperty({ enum: TICKET_PRIORITIES }) @IsIn(TICKET_PRIORITIES) priority!: (typeof TICKET_PRIORITIES)[number];
  @ApiProperty() @IsInt() @Min(1) @Max(100_000) responseMinutes!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(1_000_000) resolutionMinutes!: number;
}

export class CreateSlaPolicyDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty() @IsString() @Length(1, 60) tier!: string;
  @ApiPropertyOptional({ type: [SlaTargetDto], description: "Defaults to a baseline target per priority when left out" })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SlaTargetDto) targets?: SlaTargetDto[];
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
export class UpdateSlaPolicyDto extends PartialType(CreateSlaPolicyDto) {}

export class SelfCreateTicketDto {
  @ApiProperty() @IsString() @Length(1, 200) subject!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @ApiPropertyOptional({ enum: TICKET_PRIORITIES }) @IsOptional() @IsIn(TICKET_PRIORITIES) priority?: (typeof TICKET_PRIORITIES)[number];
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() invoiceId?: string;
  @IsOptional() @IsString() projectId?: string;
}
export class CreateTicketDto extends SelfCreateTicketDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() contactId?: string;
  @ApiPropertyOptional({ enum: TICKET_CHANNELS }) @IsOptional() @IsIn(TICKET_CHANNELS) channel?: (typeof TICKET_CHANNELS)[number];
  @IsOptional() @IsString() slaPolicyId?: string;
  @IsOptional() @IsString() productId?: string;
}
export class UpdateTicketDto extends PartialType(CreateTicketDto) {}

export class AssignTicketDto {
  @ApiProperty() @IsString() assignedTo!: string;
}

export class SetTicketStatusDto {
  @ApiProperty({ enum: ["open", "waiting_customer", "resolved", "closed"] }) @IsIn(["open", "waiting_customer", "resolved", "closed"]) status!: "open" | "waiting_customer" | "resolved" | "closed";
}

export class ReplyDto {
  @ApiProperty() @IsString() @Length(1, 5000) body!: string;
}

export class EscalateDto {
  @ApiProperty() @IsString() to!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class MergeTicketDto {
  @ApiProperty() @IsString() intoId!: string;
}

export class RateSatisfactionDto {
  @ApiProperty() @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

// ─── Customer portal ──────────────────────────────────────────────────────────

export class CreatePortalUserDto {
  @ApiProperty() @IsString() customerId!: string;
  @IsOptional() @IsString() contactId?: string;
  @ApiProperty() @IsEmail() email!: string;
}

export class PortalLoginDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() password!: string;
}

export class PortalSetPasswordDto {
  @ApiProperty() @IsString() token!: string;
  @ApiProperty() @IsString() @Length(8, 72) password!: string;
}

export class PortalChangePasswordDto {
  @ApiProperty() @IsString() currentPassword!: string;
  @ApiProperty() @IsString() @Length(8, 72) newPassword!: string;
}
