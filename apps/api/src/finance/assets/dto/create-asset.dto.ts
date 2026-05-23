import { IsString, IsOptional, IsDateString, IsNumber, IsInt, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateAssetDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() category: string;
  @ApiProperty() @IsDateString() acquisitionDate: string;
  @ApiProperty() @IsNumber() @Min(0) acquisitionCost: number;
  @ApiPropertyOptional() @IsOptional() @IsString() depreciationMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) usefulLifeMonths?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) salvageValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() assetAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() depreciationAcctId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accumDeprAcctId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
