import { Body, Controller, Get, HttpCode, Module, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import {
  AccountService,
  ActivityService,
  ContactService,
  CrmAnalyticsService,
  CrmSettingsService,
  DuplicateFinder,
  LeadConversionService,
  LeadService,
  OpportunityService,
} from "./crm.services.js";
import {
  CompleteActivityDto,
  ConvertLeadDto,
  CreateAccountDto,
  CreateActivityDto,
  CreateContactDto,
  CreateLeadDto,
  CreateOpportunityDto,
  CrmSettingsDto,
  MoveStageDto,
  UpdateAccountDto,
  UpdateActivityDto,
  UpdateContactDto,
  UpdateLeadDto,
  UpdateOpportunityDto,
} from "./crm.dto.js";

/** CRM actions beyond CRUD. Registered first so its literal routes win over `:id`. */
@ApiTags("CRM")
@ApiBearerAuth()
@RequireModule("crm")
@Controller("crm")
class CrmActionsController {
  constructor(
    private readonly conversion: LeadConversionService,
    private readonly opportunities: OpportunityService,
    private readonly activities: ActivityService,
    private readonly duplicates: DuplicateFinder,
    private readonly settings: CrmSettingsService,
    private readonly analytics: CrmAnalyticsService,
  ) {}

  @Post("leads/:id/convert")
  @HttpCode(200)
  @RequirePermission("crm.lead.convert")
  @ApiOperation({ summary: "Convert a lead into a contact at a customer, optionally with an opportunity" })
  convert(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ConvertLeadDto)) dto: ConvertLeadDto) {
    return this.conversion.convert(ctx, id, dto);
  }

  @Post("opportunities/:id/stage")
  @HttpCode(200)
  @RequirePermission("crm.opportunity.edit")
  @ApiOperation({ summary: "Move an opportunity to a stage; won and lost close it" })
  stage(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(MoveStageDto)) dto: MoveStageDto) {
    return this.opportunities.moveStage(ctx, id, dto.stage, dto.reason);
  }

  @Post("activities/:id/complete")
  @HttpCode(200)
  @RequirePermission("crm.activity.edit")
  complete(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CompleteActivityDto)) dto: CompleteActivityDto) {
    return this.activities.complete(ctx, id, dto.outcome);
  }

  @Get("duplicates")
  @RequirePermission("crm.lead.view")
  @ApiOperation({ summary: "Leads, contacts and customers matching an email, phone or name" })
  findDuplicates(@Ctx() ctx: RequestContext, @Query("email") email?: string, @Query("phone") phone?: string, @Query("name") name?: string) {
    return this.duplicates.find(ctx, { email, phone, name });
  }

  @Get("settings")
  @RequirePermission("crm.lead.view")
  getSettings(@Ctx() ctx: RequestContext) {
    return this.settings.get(ctx);
  }

  @Put("settings")
  @RequirePermission("crm.settings.edit")
  @ApiOperation({ summary: "Lead scoring rules, lead routing, lead sources and loss reasons" })
  putSettings(@Ctx() ctx: RequestContext, @Body(validated(CrmSettingsDto)) dto: CrmSettingsDto) {
    return this.settings.update(ctx, dto);
  }

  @Get("analytics")
  @RequirePermission("crm.analytics.view")
  getAnalytics(@Ctx() ctx: RequestContext) {
    return this.analytics.summary(ctx);
  }
}

const AccountsController = createMasterDataController({
  path: "crm/accounts", tag: "CRM: Customers", module: "crm", permission: "crm.account",
  service: AccountService, createDto: CreateAccountDto, updateDto: UpdateAccountDto,
});
const ContactsController = createMasterDataController({
  path: "crm/contacts", tag: "CRM: Contacts", module: "crm", permission: "crm.contact",
  service: ContactService, createDto: CreateContactDto, updateDto: UpdateContactDto,
});
const LeadsController = createMasterDataController({
  path: "crm/leads", tag: "CRM: Leads", module: "crm", permission: "crm.lead",
  service: LeadService, createDto: CreateLeadDto, updateDto: UpdateLeadDto,
});
const OpportunitiesController = createMasterDataController({
  path: "crm/opportunities", tag: "CRM: Opportunities", module: "crm", permission: "crm.opportunity",
  service: OpportunityService, createDto: CreateOpportunityDto, updateDto: UpdateOpportunityDto,
});
const ActivitiesController = createMasterDataController({
  path: "crm/activities", tag: "CRM: Activities", module: "crm", permission: "crm.activity",
  service: ActivityService, createDto: CreateActivityDto, updateDto: UpdateActivityDto,
});

const SERVICES = [
  CrmSettingsService,
  DuplicateFinder,
  AccountService,
  ContactService,
  LeadService,
  OpportunityService,
  ActivityService,
  LeadConversionService,
  CrmAnalyticsService,
];

@Module({
  controllers: [CrmActionsController, AccountsController, ContactsController, LeadsController, OpportunitiesController, ActivitiesController],
  providers: SERVICES,
  exports: SERVICES,
})
export class CrmModule {}
