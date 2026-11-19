import { Body, Controller, Get, HttpCode, Module, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { EmployeeService, JobGradeService, PositionService } from "./hr.services.js";
import {
  CreateEmployeeDto,
  CreateJobGradeDto,
  CreatePositionDto,
  ReinstateDto,
  TerminateDto,
  UpdateEmployeeDto,
  UpdateJobGradeDto,
  UpdatePositionDto,
} from "./hr.dto.js";

@ApiTags("HR")
@ApiBearerAuth()
@RequireModule("hr")
@Controller("hr")
class HrActionsController {
  constructor(private readonly employees: EmployeeService) {}

  @Get("employees/org-chart")
  @RequirePermission("hr.employee.view")
  @ApiOperation({ summary: "The reporting tree from the top, or from one employee down with ?rootId=" })
  orgChart(@Ctx() ctx: RequestContext, @Query("rootId") rootId?: string) {
    return this.employees.orgChart(ctx, rootId);
  }

  @Post("employees/:id/terminate")
  @HttpCode(200)
  @RequirePermission("hr.employee.terminate")
  @ApiOperation({ summary: "Ends employment, recording the date and reason" })
  terminate(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(TerminateDto)) dto: TerminateDto) {
    return this.employees.terminate(ctx, id, dto.date, dto.reason);
  }

  @Post("employees/:id/reinstate")
  @HttpCode(200)
  @RequirePermission("hr.employee.terminate")
  @ApiOperation({ summary: "Brings a terminated employee back as a new stint" })
  reinstate(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ReinstateDto)) dto: ReinstateDto) {
    return this.employees.reinstate(ctx, id, dto.date);
  }
}

const crud = [
  createMasterDataController({ path: "hr/employees", tag: "HR: Employees", module: "hr", permission: "hr.employee", service: EmployeeService, createDto: CreateEmployeeDto, updateDto: UpdateEmployeeDto }),
  createMasterDataController({ path: "hr/positions", tag: "HR: Positions", module: "hr", permission: "hr.position", service: PositionService, createDto: CreatePositionDto, updateDto: UpdatePositionDto }),
  createMasterDataController({ path: "hr/job-grades", tag: "HR: Job grades", module: "hr", permission: "hr.jobGrade", service: JobGradeService, createDto: CreateJobGradeDto, updateDto: UpdateJobGradeDto }),
];

const SERVICES = [EmployeeService, PositionService, JobGradeService];

@Module({
  controllers: [HrActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class HrModule {}
