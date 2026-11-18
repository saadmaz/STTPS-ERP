import { IsString, IsOptional, IsBoolean, IsIn } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateAccountDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] })
  @IsString()
  @IsIn(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"])
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subtype?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: "USD" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPosting?: boolean;
}
