import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, IsDateString, IsEmail, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDepartmentDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() managerId?: string;
}

export class CreatePositionDto {
  @ApiProperty() @IsString() departmentId: string;
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) minSalary?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) maxSalary?: number;
}

export class CreateEmployeeDto {
  @ApiProperty() @IsString() employeeNumber: string;
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() managerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employmentType?: string;
  @ApiProperty() @IsDateString() hireDate: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) salary?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() payFrequency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateOfBirth?: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() managerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employmentType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) salary?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() payFrequency?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() terminationDate?: string;
}

export class CreateLeaveTypeDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) daysPerYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPaid?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() carryForward?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) maxCarryDays?: number;
}

export class CreateLeaveRequestDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty() @IsString() leaveTypeId: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiProperty() @IsNumber() @Type(() => Number) days: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class ApproveLeaveDto {
  @ApiProperty() @IsString() action: string; // APPROVE | REJECT
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreatePayrollRunDto {
  @ApiProperty() @IsString() reference: string;
  @ApiProperty() @IsDateString() periodStart: string;
  @ApiProperty() @IsDateString() periodEnd: string;
  @ApiProperty() @IsDateString() payDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateJobPostingDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requirements?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jobType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) salaryMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) salaryMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() closingDate?: string;
}

export class CreateJobApplicationDto {
  @ApiProperty() @IsString() jobPostingId: string;
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resumeUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateApplicationStageDto {
  @ApiProperty() @IsString() stage: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(5) @Type(() => Number) rating?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
