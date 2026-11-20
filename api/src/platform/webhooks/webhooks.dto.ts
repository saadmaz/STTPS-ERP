import { ApiProperty, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUrl, Length } from "class-validator";

export class CreateWebhookDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty() @IsUrl({ require_tld: false }) url!: string;
  @ApiProperty({ example: ["InvoicePosted", "SalesOrderConfirmed"] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true }) eventTypes!: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateWebhookDto extends PartialType(CreateWebhookDto) {}
