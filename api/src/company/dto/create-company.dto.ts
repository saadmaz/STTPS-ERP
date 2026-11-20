import { IsString, IsOptional, IsInt, Min, Max, Length, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateCompanyDto {
  @ApiProperty()
  @IsString()
  @Length(1, 150)
  name: string;

  // Part of the company's document id, so restricted to id-safe characters.
  @ApiProperty({ example: "STTPS" })
  @IsString()
  @Length(1, 20)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]*$/, { message: "code may contain letters, digits and dashes" })
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional({ default: "USD" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ default: "UTC" })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStart?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;
}
