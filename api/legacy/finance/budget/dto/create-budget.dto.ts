import { IsString, IsOptional, IsInt, IsNumber, IsArray, ValidateNested, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class BudgetLineDto {
  @ApiProperty() @IsString() accountId: string;
  @ApiProperty() @IsInt() @Min(1) @Max(12) period: number;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateBudgetDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsInt() fiscalYear: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: [BudgetLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetLineDto)
  lines: BudgetLineDto[];
}
