import { ApiProperty, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsString, Length, Matches, MaxLength, Min, ValidateNested } from "class-validator";

const MONEY = /^\d{1,13}(\.\d{1,4})?$/;

export class CreateVehicleDto {
  @ApiProperty() @IsString() @Length(1, 30) code!: string;
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @ApiProperty({ example: "van" }) @IsString() @Length(1, 40) type!: string;
  @IsOptional() @IsString() @MaxLength(30) registrationNo?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsNumber() @Min(0) odometerKm?: number;
  @IsOptional() @IsDateString() insuranceExpiry?: string;
  @IsOptional() @IsDateString() licenceExpiry?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

export class CreateFuelLogDto {
  @ApiProperty() @IsString() vehicleId!: string;
  @ApiProperty() @IsDateString() date!: string;
  @ApiProperty() @IsNumber() @Min(0) odometerKm!: number;
  @ApiProperty({ example: "40" }) @IsNumber() @Min(0.001) litres!: number;
  @ApiProperty({ example: "12000" }) @Matches(MONEY) cost!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateFuelLogDto extends PartialType(CreateFuelLogDto) {}

export class RouteStopDto {
  @ApiProperty() @IsString() deliveryId!: string;
  @IsOptional() @IsInt() @Min(1) sequence?: number;
}

export class CreateRouteDto {
  @ApiProperty() @IsString() vehicleId!: string;
  @IsOptional() @IsString() driverId?: string;
  @ApiProperty() @IsDateString() date!: string;
  @ApiProperty({ type: [RouteStopDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => RouteStopDto) stops!: RouteStopDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateRouteDto extends PartialType(CreateRouteDto) {}

export class CompleteStopDto {
  @ApiProperty() @IsString() stopId!: string;
  @ApiProperty() @IsString() @Length(1, 200) receivedBy!: string;
  @IsOptional() @IsString() @MaxLength(1000) proofNote?: string;
}

export class FailStopDto {
  @ApiProperty() @IsString() stopId!: string;
  @ApiProperty() @IsString() @MaxLength(1000) reason!: string;
}

export class ArriveStopDto {
  @ApiProperty() @IsString() stopId!: string;
}
