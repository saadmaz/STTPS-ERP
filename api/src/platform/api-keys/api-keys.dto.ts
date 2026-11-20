import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

export class CreateApiKeyDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiPropertyOptional({ description: "Permission codes this key may use; omit for none" }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(6000) rateLimitPerMinute?: number;
}
/** `status` is deliberately not editable here — only `revoke()` may flip it, so the hash lookup entry is always cleaned up with it. */
export class UpdateApiKeyDto extends PartialType(CreateApiKeyDto) {}
