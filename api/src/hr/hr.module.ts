import { Body, Controller, Get, HttpCode, Module, Param, Post, Query } from "@nestjs/common";
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
];

const SERVICES = [EmployeeService, PositionService, JobGradeService, JobRequisitionService, JobPostingService, CandidateService];

@Module({
  controllers: [HrActionsController, PublicCareersController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class HrModule {}
