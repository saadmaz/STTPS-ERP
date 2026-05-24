import { IsString, IsOptional, IsBoolean, IsNumber, IsDateString } from 'class-validator';

export class CreateProjectDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsString() managerId: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsNumber() budget?: number;
  @IsDateString() startDate: string;
  @IsOptional() @IsDateString() endDate?: string;
}

export class UpdateProjectStatusDto {
  @IsString() status: string;
}

export class CreateTaskDto {
  @IsString() projectId: string;
  @IsString() code: string;
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsNumber() estimatedHours?: number;
  @IsOptional() @IsDateString() plannedStart?: string;
  @IsOptional() @IsDateString() plannedEnd?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsNumber() progress?: number;
  @IsOptional() @IsNumber() actualHours?: number;
  @IsOptional() @IsString() assigneeId?: string;
}

export class CreateTimesheetDto {
  @IsString() projectId: string;
  @IsOptional() @IsString() taskId?: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsString() date: string;
  @IsNumber() hours: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() billable?: boolean;
}

export class ApproveTimesheetDto {
  @IsString() approvedBy: string;
}

export class CreateBillingDto {
  @IsString() projectId: string;
  @IsString() number: string;
  @IsOptional() @IsString() billType?: string;
  @IsNumber() amount: number;
  @IsOptional() @IsString() notes?: string;
}
