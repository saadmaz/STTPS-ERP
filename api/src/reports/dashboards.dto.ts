import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsNumber, IsString, Length, MaxLength, ValidateNested } from "class-validator";
import { DASHBOARD_CHART_TYPES, DASHBOARD_WIDGET_TYPES, KPI_DIRECTIONS } from "./dashboards.models.js";

export class CreateKpiDefinitionDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty() @IsString() reportId!: string;
  @ApiProperty() @IsString() @Length(1, 200) metric!: string;
  @IsOptional() @IsNumber() target?: number;
  @IsOptional() @IsNumber() warningThreshold?: number;
  @IsOptional() @IsNumber() criticalThreshold?: number;
  @ApiPropertyOptional({ enum: KPI_DIRECTIONS }) @IsOptional() @IsIn(KPI_DIRECTIONS) direction?: (typeof KPI_DIRECTIONS)[number];
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(50) frequency?: string;
}
export class UpdateKpiDefinitionDto extends PartialType(CreateKpiDefinitionDto) {}

export class DashboardWidgetDto {
  @ApiProperty() @IsString() @Length(1, 60) id!: string;
  @ApiProperty({ enum: DASHBOARD_WIDGET_TYPES }) @IsIn(DASHBOARD_WIDGET_TYPES) type!: (typeof DASHBOARD_WIDGET_TYPES)[number];
  @ApiProperty() @IsString() @Length(1, 150) title!: string;
  @IsOptional() @IsString() kpiId?: string;
  @IsOptional() @IsString() reportId?: string;
  @ApiPropertyOptional({ enum: DASHBOARD_CHART_TYPES }) @IsOptional() @IsIn(DASHBOARD_CHART_TYPES) chartType?: (typeof DASHBOARD_CHART_TYPES)[number];
  @IsOptional() @IsString() @MaxLength(100) alertCategory?: string;
  @ApiProperty() @IsInt() x!: number;
  @ApiProperty() @IsInt() y!: number;
  @ApiProperty() @IsInt() w!: number;
  @ApiProperty() @IsInt() h!: number;
}

export class CreateDashboardDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ type: [DashboardWidgetDto] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => DashboardWidgetDto) widgets?: DashboardWidgetDto[];
  @IsOptional() @IsBoolean() shared?: boolean;
}
export class UpdateDashboardDto extends PartialType(CreateDashboardDto) {}
