import { ApiProperty, PartialType } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { HR_REQUEST_STATUSES, HR_REQUEST_TYPES } from "./hr-selfservice.models.js";

export class CreateAnnouncementDto {
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiProperty() @IsString() @MaxLength(5000) body!: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsISO8601() expiresAt?: string;
}
export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}

export class SelfHrRequestDto {
  @ApiProperty({ enum: HR_REQUEST_TYPES }) @IsIn(HR_REQUEST_TYPES) type!: (typeof HR_REQUEST_TYPES)[number];
  @ApiProperty() @IsString() @Length(1, 200) subject!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
export class CreateHrRequestDto extends SelfHrRequestDto {
  @ApiProperty() @IsString() employeeId!: string;
}
export class UpdateHrRequestDto extends PartialType(CreateHrRequestDto) {}

export class DecideHrRequestDto {
  @ApiProperty({ enum: HR_REQUEST_STATUSES }) @IsIn(HR_REQUEST_STATUSES) status!: (typeof HR_REQUEST_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(2000) resolution?: string;
}

export class SelfEquipmentRequestDto {
  @ApiProperty() @IsString() @Length(1, 200) itemDescription!: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
export class CreateEquipmentRequestDto extends SelfEquipmentRequestDto {
  @ApiProperty() @IsString() employeeId!: string;
}
export class UpdateEquipmentRequestDto extends PartialType(CreateEquipmentRequestDto) {}

export class DecideEquipmentRequestDto {
  @ApiProperty() @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class FulfillEquipmentRequestDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
