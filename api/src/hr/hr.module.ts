import { BadRequestException, Body, Controller, Get, HttpCode, Module, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.js";
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
import { CandidateService, JobPostingService, JobRequisitionService } from "./hr-recruitment.services.js";
import {
  CreateCandidateDto,
  CreateJobPostingDto,
  CreateJobRequisitionDto,
  ExtendOfferDto,
  HireCandidateDto,
  PublicApplyDto,
  RecordScorecardDto,
  RejectCandidateDto,
  RespondOfferDto,
  ScheduleInterviewDto,
  UpdateCandidateDto,
  UpdateJobPostingDto,
  UpdateJobRequisitionDto,
} from "./hr-recruitment.dto.js";
import { ChecklistService } from "./hr-onboarding.services.js";
import { AssignItemDto, CancelChecklistDto, CreateChecklistDto, SetItemStatusDto, StartChecklistDto, UpdateChecklistDto } from "./hr-onboarding.dto.js";
import { AttendanceService, AttendanceSettingsService, DeviceService } from "./hr-attendance.services.js";
import {
  ClockActionDto,
  CreateAttendanceRecordDto,
  CreateDeviceDto,
  DecideCorrectionDto,
  KioskClockDto,
  MarkAbsentDto,
  RequestCorrectionDto,
  SetAttendancePinDto,
  UpdateAttendanceRecordDto,
  UpdateAttendanceSettingsDto,
  UpdateDeviceDto,
} from "./hr-attendance.dto.js";
import { ShiftAssignmentService, ShiftTemplateService } from "./hr-shifts.services.js";
import { CancelAssignmentDto, CreateAssignmentDto, CreateShiftTemplateDto, DecideSwapDto, RequestSwapDto, UpdateAssignmentDto, UpdateShiftTemplateDto } from "./hr-shifts.dto.js";

@ApiTags("HR")
@ApiBearerAuth()
@RequireModule("hr")
@Controller("hr")
class HrActionsController {
  constructor(
    private readonly employees: EmployeeService,
    private readonly requisitions: JobRequisitionService,
    private readonly postings: JobPostingService,
    private readonly candidates: CandidateService,
    private readonly checklists: ChecklistService,
    private readonly attendance: AttendanceService,
    private readonly attendanceSettings: AttendanceSettingsService,
    private readonly devices: DeviceService,
    private readonly assignments: ShiftAssignmentService,
  ) {}

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

  @Post("employees/:id/onboarding")
  @HttpCode(200)
  @RequirePermission("hr.checklist.create")
  @ApiOperation({ summary: "Starts an onboarding checklist for this employee (reuses one already in progress)" })
  startOnboarding(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(StartChecklistDto)) dto: StartChecklistDto) {
    return this.checklists.start(ctx, id, "onboarding", dto.targetDate?.slice(0, 10) ?? null);
  }

  @Post("employees/:id/offboarding")
  @HttpCode(200)
  @RequirePermission("hr.checklist.create")
  @ApiOperation({ summary: "Starts an offboarding checklist for this employee (reuses one already in progress)" })
  startOffboarding(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(StartChecklistDto)) dto: StartChecklistDto) {
    return this.checklists.start(ctx, id, "offboarding", dto.targetDate?.slice(0, 10) ?? null);
  }

  @Post("checklists/:id/items/:itemId/status")
  @HttpCode(200)
  @RequirePermission("hr.checklist.edit")
  @ApiOperation({ summary: "Marks a checklist item done, skipped or pending again" })
  setItemStatus(@Ctx() ctx: RequestContext, @Param("id") id: string, @Param("itemId") itemId: string, @Body(validated(SetItemStatusDto)) dto: SetItemStatusDto) {
    return this.checklists.setItemStatus(ctx, id, itemId, dto.status, dto.notes);
  }

  @Post("checklists/:id/items/:itemId/assign")
  @HttpCode(200)
  @RequirePermission("hr.checklist.edit")
  assignItem(@Ctx() ctx: RequestContext, @Param("id") id: string, @Param("itemId") itemId: string, @Body(validated(AssignItemDto)) dto: AssignItemDto) {
    return this.checklists.assignItem(ctx, id, itemId, dto.userId ?? null);
  }

  @Post("checklists/:id/cancel")
  @HttpCode(200)
  @RequirePermission("hr.checklist.edit")
  cancelChecklist(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CancelChecklistDto)) dto: CancelChecklistDto) {
    return this.checklists.cancel(ctx, id, dto.reason);
  }

  @Post("requisitions/:id/submit")
  @HttpCode(200)
  @RequirePermission("hr.jobRequisition.edit")
  @ApiOperation({ summary: "Sends the requisition for hiring approval (or approves it at once when no workflow applies)" })
  submitRequisition(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.requisitions.submit(ctx, id);
  }

  @Post("requisitions/:id/cancel")
  @HttpCode(200)
  @RequirePermission("hr.jobRequisition.edit")
  cancelRequisition(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.requisitions.cancel(ctx, id);
  }

  @Post("postings/:id/publish")
  @HttpCode(200)
  @RequirePermission("hr.jobPosting.edit")
  @ApiOperation({ summary: "Publishes the posting to the public career page" })
  publishPosting(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.postings.publish(ctx, id);
  }

  @Post("postings/:id/close")
  @HttpCode(200)
  @RequirePermission("hr.jobPosting.edit")
  closePosting(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.postings.close(ctx, id);
  }

  @Post("candidates/:id/interviews")
  @HttpCode(200)
  @RequirePermission("hr.candidate.edit")
  @ApiOperation({ summary: "Schedules an interview" })
  scheduleInterview(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ScheduleInterviewDto)) dto: ScheduleInterviewDto) {
    return this.candidates.scheduleInterview(ctx, id, dto);
  }

  @Post("candidates/:id/interviews/:interviewId/scorecard")
  @HttpCode(200)
  @RequirePermission("hr.candidate.edit")
  @ApiOperation({ summary: "Records the outcome of a scheduled interview" })
  recordScorecard(@Ctx() ctx: RequestContext, @Param("id") id: string, @Param("interviewId") interviewId: string, @Body(validated(RecordScorecardDto)) dto: RecordScorecardDto) {
    return this.candidates.recordScorecard(ctx, id, interviewId, dto);
  }

  @Post("candidates/:id/offer")
  @HttpCode(200)
  @RequirePermission("hr.candidate.edit")
  @ApiOperation({ summary: "Extends or revises an offer" })
  extendOffer(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ExtendOfferDto)) dto: ExtendOfferDto) {
    return this.candidates.extendOffer(ctx, id, dto);
  }

  @Post("candidates/:id/offer/respond")
  @HttpCode(200)
  @RequirePermission("hr.candidate.edit")
  @ApiOperation({ summary: "Records the candidate's reply to the offer" })
  respondToOffer(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RespondOfferDto)) dto: RespondOfferDto) {
    return this.candidates.respondToOffer(ctx, id, dto.accepted);
  }

  @Post("candidates/:id/reject")
  @HttpCode(200)
  @RequirePermission("hr.candidate.edit")
  rejectCandidate(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RejectCandidateDto)) dto: RejectCandidateDto) {
    return this.candidates.reject(ctx, id, dto.reason);
  }

  @Post("candidates/:id/hire")
  @HttpCode(200)
  @RequirePermission("hr.employee.create")
  @ApiOperation({ summary: "Hires the candidate: creates the employee record and closes the pipeline" })
  hireCandidate(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(HireCandidateDto)) dto: HireCandidateDto) {
    return this.candidates.hire(ctx, id, dto.joiningDate);
  }

  @Post("employees/:id/attendance-pin")
  @HttpCode(200)
  @RequirePermission("hr.employee.edit")
  @ApiOperation({ summary: "Sets this employee's kiosk PIN (never returned by the API)" })
  setAttendancePin(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(SetAttendancePinDto)) dto: SetAttendancePinDto) {
    return this.employees.setAttendancePin(ctx, id, dto.pin);
  }

  @Post("attendance/:id/correction/decide")
  @HttpCode(200)
  @RequirePermission("hr.attendanceRecord.edit")
  @ApiOperation({ summary: "Approves or rejects a correction request" })
  decideCorrection(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(DecideCorrectionDto)) dto: DecideCorrectionDto) {
    return this.attendance.decideCorrection(ctx, id, dto.approve, dto.note);
  }

  @Post("attendance/mark-absent")
  @HttpCode(200)
  @RequirePermission("hr.attendanceRecord.edit")
  @ApiOperation({ summary: "Records a day with no clock-in at all" })
  markAbsent(@Ctx() ctx: RequestContext, @Body(validated(MarkAbsentDto)) dto: MarkAbsentDto) {
    return this.attendance.markAbsent(ctx, dto.employeeId, dto.date, dto.reason);
  }

  @Get("attendance/timesheet")
  @RequirePermission("hr.attendanceRecord.view")
  @ApiOperation({ summary: "Worked, overtime and late minutes for an employee over a date range" })
  timesheet(@Ctx() ctx: RequestContext, @Query("employeeId") employeeId: string, @Query("from") from: string, @Query("to") to: string) {
    return this.attendance.timesheet(ctx, employeeId, from, to);
  }

  @Get("attendance-settings")
  @RequirePermission("hr.attendanceRecord.view")
  getAttendanceSettings(@Ctx() ctx: RequestContext) {
    return this.attendanceSettings.get(ctx);
  }

  @Put("attendance-settings")
  @RequirePermission("hr.attendanceRecord.edit")
  @ApiOperation({ summary: "The standard shift times used to compute late, early-leave and overtime until Shifts is built" })
  putAttendanceSettings(@Ctx() ctx: RequestContext, @Body(validated(UpdateAttendanceSettingsDto)) dto: UpdateAttendanceSettingsDto) {
    return this.attendanceSettings.update(ctx, dto);
  }

  @Post("devices/:id/issue-key")
  @HttpCode(200)
  @RequirePermission("hr.device.edit")
  @ApiOperation({ summary: "Issues a new bearer key for this kiosk, retiring any previous one; shown once" })
  issueDeviceKey(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.devices.issueKey(ctx, id);
  }

  @Post("devices/:id/revoke")
  @HttpCode(200)
  @RequirePermission("hr.device.edit")
  revokeDevice(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.devices.revoke(ctx, id);
  }

  @Get("shift-assignments/calendar")
  @RequirePermission("hr.shiftAssignment.view")
  @ApiOperation({ summary: "Every employee's shifts in a date range" })
  shiftCalendar(@Ctx() ctx: RequestContext, @Query("from") from: string, @Query("to") to: string) {
    return this.assignments.calendar(ctx, from, to);
  }

  @Post("shift-assignments/:id/swap/decide")
  @HttpCode(200)
  @RequirePermission("hr.shiftAssignment.edit")
  @ApiOperation({ summary: "Approves or rejects a swap request; approving exchanges the two employees" })
  decideSwap(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(DecideSwapDto)) dto: DecideSwapDto) {
    return this.assignments.decideSwap(ctx, id, dto.approve, dto.note);
  }

  @Post("shift-assignments/:id/cancel")
  @HttpCode(200)
  @RequirePermission("hr.shiftAssignment.edit")
  cancelAssignment(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CancelAssignmentDto)) dto: CancelAssignmentDto) {
    return this.assignments.cancel(ctx, id, dto.reason);
  }
}

/** Shift self-service: a signed-in employee's own schedule and swap requests. */
@ApiTags("HR")
@ApiBearerAuth()
@RequireModule("hr")
@Controller("hr/shift-assignments")
class ShiftSelfServiceController {
  constructor(private readonly employees: EmployeeService, private readonly assignments: ShiftAssignmentService) {}

  private async myEmployee(ctx: RequestContext) {
    const employee = await this.employees.findByUserId(ctx, ctx.userId);
    if (!employee) throw new BadRequestException("No employee record is linked to your account");
    return employee;
  }

  @Get("me")
  @ApiOperation({ summary: "My own shifts in a date range" })
  async mySchedule(@Ctx() ctx: RequestContext, @Query("from") from: string, @Query("to") to: string) {
    const employee = await this.myEmployee(ctx);
    return this.assignments.mySchedule(ctx, employee.id, from, to);
  }

  @Post(":id/swap")
  @HttpCode(200)
  @ApiOperation({ summary: "Requests to swap one of my own shifts with someone else's" })
  async requestSwap(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RequestSwapDto)) dto: RequestSwapDto) {
    const employee = await this.myEmployee(ctx);
    return this.assignments.requestSwap(ctx, id, employee.id, dto.targetAssignmentId, dto.note);
  }
}

/** Attendance self-service: any signed-in user with a linked employee record, no extra permission. */
@ApiTags("HR")
@ApiBearerAuth()
@RequireModule("hr")
@Controller("hr/attendance")
class AttendanceSelfServiceController {
  constructor(private readonly employees: EmployeeService, private readonly attendance: AttendanceService) {}

  private async myEmployee(ctx: RequestContext) {
    const employee = await this.employees.findByUserId(ctx, ctx.userId);
    if (!employee) throw new BadRequestException("No employee record is linked to your account");
    return employee;
  }

  @Get("me")
  @ApiOperation({ summary: "Today's attendance record for the signed-in employee, if any" })
  async me(@Ctx() ctx: RequestContext) {
    const employee = await this.myEmployee(ctx);
    const page = await this.attendance.list(ctx, { where: `employeeId:${employee.id}`, limit: 1 });
    const today = new Date().toISOString().slice(0, 10);
    return { employee: { id: employee.id, firstName: employee.firstName, lastName: employee.lastName }, today: page.items.find((r) => r.date === today) ?? null };
  }

  @Post("clock-in")
  @HttpCode(200)
  async clockIn(@Ctx() ctx: RequestContext, @Body(validated(ClockActionDto)) dto: ClockActionDto) {
    const employee = await this.myEmployee(ctx);
    return this.attendance.clockIn(ctx, employee.id, dto.method ?? "web", null);
  }

  @Post("clock-out")
  @HttpCode(200)
  async clockOut(@Ctx() ctx: RequestContext) {
    const employee = await this.myEmployee(ctx);
    return this.attendance.clockOut(ctx, employee.id);
  }

  @Post("break/start")
  @HttpCode(200)
  async startBreak(@Ctx() ctx: RequestContext) {
    const employee = await this.myEmployee(ctx);
    return this.attendance.startBreak(ctx, employee.id);
  }

  @Post("break/end")
  @HttpCode(200)
  async endBreak(@Ctx() ctx: RequestContext) {
    const employee = await this.myEmployee(ctx);
    return this.attendance.endBreak(ctx, employee.id);
  }

  @Post("me/pin")
  @HttpCode(200)
  @ApiOperation({ summary: "Sets your own kiosk PIN" })
  async setMyPin(@Ctx() ctx: RequestContext, @Body(validated(SetAttendancePinDto)) dto: SetAttendancePinDto) {
    const employee = await this.myEmployee(ctx);
    return this.employees.setAttendancePin(ctx, employee.id, dto.pin);
  }

  @Post(":id/correction")
  @HttpCode(200)
  @ApiOperation({ summary: "Requests a correction to one of your own attendance records" })
  async requestCorrection(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RequestCorrectionDto)) dto: RequestCorrectionDto) {
    const employee = await this.myEmployee(ctx);
    return this.attendance.requestCorrection(ctx, id, employee.id, dto.requestedClockIn, dto.requestedClockOut, dto.reason);
  }
}

/** The kiosk endpoint: authenticates with a device bearer key, never a user session. */
@ApiTags("Public")
@Controller("public/attendance")
class PublicAttendanceController {
  constructor(private readonly devices: DeviceService, private readonly attendance: AttendanceService) {}

  @Public()
  @Post("clock")
  @HttpCode(200)
  @ApiOperation({ summary: "QR (employee number only) or PIN clock-in/out and breaks, from a registered kiosk" })
  async clock(@Body(validated(KioskClockDto)) dto: KioskClockDto) {
    const device = await this.devices.resolveByKey(dto.deviceKey);
    if (!device) throw new BadRequestException("Unknown or revoked device key");
    const ctx = { tenantId: device.tenantId, companyId: device.companyId, userId: "device", allPermissions: true, permissions: new Set<string>(), ip: null, userAgent: null } as RequestContext;
    const employee = await this.attendance.resolveKioskEmployee(ctx, dto.employeeNumber, dto.pin);
    switch (dto.action) {
      case "in":
        return this.attendance.clockIn(ctx, employee.id, dto.pin ? "pin" : "qr", device.deviceId);
      case "out":
        return this.attendance.clockOut(ctx, employee.id);
      case "break_start":
        return this.attendance.startBreak(ctx, employee.id);
      case "break_end":
        return this.attendance.endBreak(ctx, employee.id);
    }
  }
}

/** The public career page: reachable without signing in, scoped to one company by its id. */
@ApiTags("Public")
@Controller("public/careers")
class PublicCareersController {
  constructor(private readonly postings: JobPostingService, private readonly candidates: CandidateService) {}

  @Public()
  @Get(":companyId")
  list(@Param("companyId") companyId: string) {
    return this.postings.publicList(companyId);
  }

  @Public()
  @Get(":companyId/:postingId")
  get(@Param("companyId") companyId: string, @Param("postingId") postingId: string) {
    return this.postings.publicGet(companyId, postingId);
  }

  @Public()
  @Post(":companyId/:postingId/apply")
  @HttpCode(201)
  apply(@Param("companyId") companyId: string, @Param("postingId") postingId: string, @Body(validated(PublicApplyDto)) dto: PublicApplyDto) {
    return this.candidates.publicApply(companyId, postingId, dto);
  }
}

const crud = [
  createMasterDataController({ path: "hr/employees", tag: "HR: Employees", module: "hr", permission: "hr.employee", service: EmployeeService, createDto: CreateEmployeeDto, updateDto: UpdateEmployeeDto }),
  createMasterDataController({ path: "hr/positions", tag: "HR: Positions", module: "hr", permission: "hr.position", service: PositionService, createDto: CreatePositionDto, updateDto: UpdatePositionDto }),
  createMasterDataController({ path: "hr/job-grades", tag: "HR: Job grades", module: "hr", permission: "hr.jobGrade", service: JobGradeService, createDto: CreateJobGradeDto, updateDto: UpdateJobGradeDto }),
  createMasterDataController({ path: "hr/requisitions", tag: "HR: Job requisitions", module: "hr", permission: "hr.jobRequisition", service: JobRequisitionService, createDto: CreateJobRequisitionDto, updateDto: UpdateJobRequisitionDto }),
  createMasterDataController({ path: "hr/postings", tag: "HR: Job postings", module: "hr", permission: "hr.jobPosting", service: JobPostingService, createDto: CreateJobPostingDto, updateDto: UpdateJobPostingDto }),
  createMasterDataController({ path: "hr/candidates", tag: "HR: Candidates", module: "hr", permission: "hr.candidate", service: CandidateService, createDto: CreateCandidateDto, updateDto: UpdateCandidateDto }),
  createMasterDataController({ path: "hr/checklists", tag: "HR: Onboarding and offboarding checklists", module: "hr", permission: "hr.checklist", service: ChecklistService, createDto: CreateChecklistDto, updateDto: UpdateChecklistDto }),
  createMasterDataController({ path: "hr/attendance", tag: "HR: Attendance", module: "hr", permission: "hr.attendanceRecord", service: AttendanceService, createDto: CreateAttendanceRecordDto, updateDto: UpdateAttendanceRecordDto }),
  createMasterDataController({ path: "hr/devices", tag: "HR: Attendance devices", module: "hr", permission: "hr.device", service: DeviceService, createDto: CreateDeviceDto, updateDto: UpdateDeviceDto }),
  createMasterDataController({ path: "hr/shift-templates", tag: "HR: Shift templates", module: "hr", permission: "hr.shiftTemplate", service: ShiftTemplateService, createDto: CreateShiftTemplateDto, updateDto: UpdateShiftTemplateDto }),
  createMasterDataController({ path: "hr/shift-assignments", tag: "HR: Shift assignments", module: "hr", permission: "hr.shiftAssignment", service: ShiftAssignmentService, createDto: CreateAssignmentDto, updateDto: UpdateAssignmentDto }),
];

const SERVICES = [
  EmployeeService,
  PositionService,
  JobGradeService,
  JobRequisitionService,
  JobPostingService,
  CandidateService,
  ChecklistService,
  AttendanceService,
  AttendanceSettingsService,
  DeviceService,
  ShiftTemplateService,
  ShiftAssignmentService,
];

@Module({
  controllers: [HrActionsController, AttendanceSelfServiceController, ShiftSelfServiceController, PublicCareersController, PublicAttendanceController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class HrModule {}
