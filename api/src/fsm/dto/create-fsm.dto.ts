import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsDateString, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTechnicianDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() skills?: string[];
}

export class CreateServiceContractDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsString() number: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contractType?: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) slaHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateServiceOrderDto {
  @ApiProperty() @IsString() number: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contractId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() technicianId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() priority?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() slaDeadline?: string;
}

export class AssignServiceOrderDto {
  @ApiProperty() @IsString() technicianId: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
}

export class CompleteServiceOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() resolution?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) customerRating?: number;
}

export class AddServiceOrderNoteDto {
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() authorId?: string;
  @ApiPropertyOptional() @IsOptional() isInternal?: boolean;
}
