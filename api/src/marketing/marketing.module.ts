import { Controller, Get, HttpCode, Module, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { CrmModule } from "../crm/crm.module.js";
import {
  CreateCampaignDto, CreateSegmentDto, CreateSequenceDto, EnrollDto, NoUpdateDto, UpdateCampaignDto, UpdateSegmentDto, UpdateSequenceDto,
} from "./marketing.dto.js";
import { CampaignService, EnrollmentService, MarketingAnalyticsService, SegmentService, SequenceService } from "./marketing.services.js";

@ApiTags("Marketing")
@ApiBearerAuth()
@RequireModule("marketing")
@Controller("marketing")
class MarketingActionsController {
  constructor(
    private readonly segments: SegmentService,
    private readonly enrollments: EnrollmentService,
    private readonly analytics: MarketingAnalyticsService,
  ) {}

  @Get("segments/:id/preview")
  @RequirePermission("marketing.segment.view")
  @ApiOperation({ summary: "Up to 200 records currently matching this segment's filter" })
  preview(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.segments.preview(ctx, id);
  }

  @Get("campaigns/:id/report")
  @RequirePermission("marketing.campaign.view")
  @ApiOperation({ summary: "Leads, conversions, revenue, cost per lead/acquisition and ROI for this campaign" })
  report(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.analytics.campaignReport(ctx, id);
  }

  @Post("enrollments/:id/advance")
  @HttpCode(200)
  @RequirePermission("marketing.enrollment.edit")
  advance(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.enrollments.advance(ctx, id);
  }

  @Post("enrollments/:id/cancel")
  @HttpCode(200)
  @RequirePermission("marketing.enrollment.edit")
  cancel(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.enrollments.cancel(ctx, id);
  }
}

const crud = [
  createMasterDataController({ path: "marketing/campaigns", tag: "Marketing: Campaigns", module: "marketing", permission: "marketing.campaign", service: CampaignService, createDto: CreateCampaignDto, updateDto: UpdateCampaignDto }),
  createMasterDataController({ path: "marketing/segments", tag: "Marketing: Segments", module: "marketing", permission: "marketing.segment", service: SegmentService, createDto: CreateSegmentDto, updateDto: UpdateSegmentDto }),
  createMasterDataController({ path: "marketing/sequences", tag: "Marketing: Sequences", module: "marketing", permission: "marketing.sequence", service: SequenceService, createDto: CreateSequenceDto, updateDto: UpdateSequenceDto }),
  createMasterDataController({ path: "marketing/enrollments", tag: "Marketing: Enrollments", module: "marketing", permission: "marketing.enrollment", service: EnrollmentService, createDto: EnrollDto, updateDto: NoUpdateDto }),
];

const SERVICES = [CampaignService, SegmentService, SequenceService, EnrollmentService, MarketingAnalyticsService];

@Module({
  imports: [CrmModule],
  controllers: [MarketingActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class MarketingModule {}
