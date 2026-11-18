import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Ctx, RequestContext } from "../context/request-context.js";
import { createMasterDataController, validated } from "../crud/master-data.controller.js";
import { RequireModule } from "../modules/require-module.decorator.js";
import { ApprovalsService } from "./approvals.service.js";
import { ApprovalDefinitionsService, DelegationsService } from "./approval-definitions.service.js";
import {
  CreateApprovalDefinitionDto,
  CreateDelegationDto,
  DecisionDto,
  ReassignDto,
  RequiredCommentDto,
  UpdateApprovalDefinitionDto,
  UpdateDelegationDto,
} from "./approvals.dto.js";

export const ApprovalDefinitionsController = createMasterDataController({
  path: "workflow/definitions",
  tag: "Workflow: Definitions",
  module: "workflow",
  permission: "workflow.definition",
  service: ApprovalDefinitionsService,
  createDto: CreateApprovalDefinitionDto,
  updateDto: UpdateApprovalDefinitionDto,
});

export const DelegationsAdminController = createMasterDataController({
  path: "workflow/delegations",
  tag: "Workflow: Delegations",
  module: "workflow",
  permission: "workflow.delegation",
  service: DelegationsService,
  createDto: CreateDelegationDto,
  updateDto: UpdateDelegationDto,
});

/** Acting on approval requests. Being an approver of the current step is the permission. */
@ApiTags("Workflow: Requests")
@ApiBearerAuth()
@RequireModule("workflow")
@Controller("workflow/requests")
export class ApprovalRequestsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @ApiOperation({ summary: "Requests waiting for me (scope=waiting, default) or submitted by me (scope=submitted)" })
  list(@Ctx() ctx: RequestContext, @Query("scope") scope?: string) {
    return scope === "submitted" ? this.approvals.submittedBy(ctx) : this.approvals.waitingFor(ctx);
  }

  @Get("for/:entityType/:entityId")
  @ApiOperation({ summary: "Approval history of one record" })
  forEntity(@Ctx() ctx: RequestContext, @Param("entityType") entityType: string, @Param("entityId") entityId: string) {
    return this.approvals.forEntity(ctx, entityType, entityId);
  }

  @Get(":id")
  get(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.approvals.getVisible(ctx, id);
  }

  @Post(":id/approve")
  @HttpCode(200)
  approve(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(DecisionDto)) dto: DecisionDto) {
    return this.approvals.approve(ctx, id, dto.comment);
  }

  @Post(":id/reject")
  @HttpCode(200)
  reject(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RequiredCommentDto)) dto: RequiredCommentDto) {
    return this.approvals.reject(ctx, id, dto.comment);
  }

  @Post(":id/request-changes")
  @HttpCode(200)
  requestChanges(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RequiredCommentDto)) dto: RequiredCommentDto) {
    return this.approvals.requestChanges(ctx, id, dto.comment);
  }

  @Post(":id/reassign")
  @HttpCode(200)
  reassign(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ReassignDto)) dto: ReassignDto) {
    return this.approvals.reassign(ctx, id, dto.toUserId, dto.comment);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(DecisionDto)) dto: DecisionDto) {
    return this.approvals.cancel(ctx, id, dto.comment);
  }
}

/** Each user's own delegations ("I'm away; let X approve for me"). */
@ApiTags("Workflow: Delegations")
@ApiBearerAuth()
@RequireModule("workflow")
@Controller("me/delegations")
export class MyDelegationsController {
  constructor(private readonly delegations: DelegationsService) {}

  @Get()
  async list(@Ctx() ctx: RequestContext) {
    const page = await this.delegations.list(ctx, { where: `userId:${ctx.userId}`, limit: 200 });
    return page.items;
  }

  @Post()
  create(@Ctx() ctx: RequestContext, @Body(validated(CreateDelegationDto)) dto: CreateDelegationDto) {
    return this.delegations.create(ctx, { ...dto, userId: ctx.userId });
  }

  @Post(":id/end")
  @HttpCode(200)
  @ApiOperation({ summary: "End one of my delegations now" })
  async end(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    const delegation = await this.delegations.get(ctx, id);
    if (delegation.userId !== ctx.userId) throw new NotFoundException("Delegation not found");
    return this.delegations.archive(ctx, id, "ended by owner");
  }
}

