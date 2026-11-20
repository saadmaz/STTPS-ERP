import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength, ValidateNested } from "class-validator";
import { REPORT_AGGREGATION_FUNCTIONS, REPORT_CALC_OPERATORS, REPORT_FILTER_OPERATORS, REPORT_SOURCES } from "./reports.models.js";

export class ReportFilterDto {
  @ApiProperty() @IsString() @Length(1, 200) field!: string;
  @ApiProperty({ enum: REPORT_FILTER_OPERATORS }) @IsIn(REPORT_FILTER_OPERATORS) operator!: (typeof REPORT_FILTER_OPERATORS)[number];
  @ApiProperty() @IsString() @MaxLength(200) value!: string;
}

export class ReportColumnDto {
  @ApiProperty() @IsString() @Length(1, 200) field!: string;
  @ApiProperty() @IsString() @Length(1, 150) label!: string;
}

export class ReportCalculatedFieldDto {
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
  @ApiProperty() @IsString() @Length(1, 150) label!: string;
  @ApiProperty() @IsString() @Length(1, 200) left!: string;
  @ApiProperty({ enum: REPORT_CALC_OPERATORS }) @IsIn(REPORT_CALC_OPERATORS) op!: (typeof REPORT_CALC_OPERATORS)[number];
  @ApiProperty() @IsString() @Length(1, 200) right!: string;
}

export class ReportAggregationDto {
  @ApiProperty() @IsString() @Length(1, 200) field!: string;
  @ApiProperty({ enum: REPORT_AGGREGATION_FUNCTIONS }) @IsIn(REPORT_AGGREGATION_FUNCTIONS) fn!: (typeof REPORT_AGGREGATION_FUNCTIONS)[number];
  @IsOptional() @IsString() @Length(1, 150) label?: string;
}

export class CreateReportDefinitionDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty({ enum: REPORT_SOURCES }) @IsIn(REPORT_SOURCES) source!: (typeof REPORT_SOURCES)[number];
  @ApiPropertyOptional({ type: [ReportColumnDto] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ReportColumnDto) columns?: ReportColumnDto[];
  @ApiPropertyOptional({ type: [ReportCalculatedFieldDto] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ReportCalculatedFieldDto) calculatedFields?: ReportCalculatedFieldDto[];
  @ApiPropertyOptional({ type: [ReportFilterDto] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ReportFilterDto) filters?: ReportFilterDto[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(2) @IsString({ each: true }) groupBy?: string[];
  @ApiPropertyOptional({ type: [ReportAggregationDto] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ReportAggregationDto) aggregations?: ReportAggregationDto[];
  @IsOptional() @IsString() @MaxLength(200) sortBy?: string;
  @IsOptional() @IsBoolean() sortDesc?: boolean;
  @IsOptional() @IsString() @MaxLength(200) compareField?: string;
}
export class UpdateReportDefinitionDto extends PartialType(CreateReportDefinitionDto) {}

export class ExportReportDto {
  @ApiProperty({ enum: ["csv", "xlsx"] }) @IsIn(["csv", "xlsx"]) format!: "csv" | "xlsx";
}
