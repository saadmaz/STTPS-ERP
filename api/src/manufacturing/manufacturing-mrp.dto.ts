import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsDateString, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from "class-validator";

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CreateDemandForecastDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ example: "2026-12", description: "YYYY-MM" }) @Matches(PERIOD) period!: string;
  @ApiProperty() @IsNumber() @Min(0.001) qty!: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateDemandForecastDto extends PartialType(CreateDemandForecastDto) {}

export class RunMrpDto {
  @ApiPropertyOptional({ description: "Demand due on or before this date is included; defaults to 90 days out" })
  @IsOptional() @IsDateString() horizonEnd?: string;
}

export class UpdateMrpRunDto {
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
