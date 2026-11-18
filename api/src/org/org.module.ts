import { Body, Controller, Get, HttpCode, Module, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import {
  BranchService,
  BusinessUnitService,
  CostCentreService,
  DepartmentService,
  ExchangeRateService,
  FiscalYearService,
  TeamService,
} from "./org.services.js";
import {
  CreateBranchDto,
  CreateBusinessUnitDto,
  CreateCostCentreDto,
  CreateDepartmentDto,
  CreateExchangeRateDto,
  CreateFiscalYearDto,
  CreateTeamDto,
  SetPeriodStatusDto,
  UpdateBranchDto,
  UpdateBusinessUnitDto,
  UpdateCostCentreDto,
  UpdateDepartmentDto,
  UpdateExchangeRateDto,
  UpdateFiscalYearDto,
  UpdateTeamDto,
} from "./dto/org.dto.js";

const BranchController = createMasterDataController({
  path: "org/branches", tag: "Org: Branches", module: "org", permission: "org.branch",
  service: BranchService, createDto: CreateBranchDto, updateDto: UpdateBranchDto,
});
const DepartmentController = createMasterDataController({
  path: "org/departments", tag: "Org: Departments", module: "org", permission: "org.department",
  service: DepartmentService, createDto: CreateDepartmentDto, updateDto: UpdateDepartmentDto,
});
const TeamController = createMasterDataController({
  path: "org/teams", tag: "Org: Teams", module: "org", permission: "org.team",
  service: TeamService, createDto: CreateTeamDto, updateDto: UpdateTeamDto,
});
const CostCentreController = createMasterDataController({
  path: "org/cost-centres", tag: "Org: Cost centres", module: "org", permission: "org.costCentre",
  service: CostCentreService, createDto: CreateCostCentreDto, updateDto: UpdateCostCentreDto,
});
const BusinessUnitController = createMasterDataController({
  path: "org/business-units", tag: "Org: Business units", module: "org", permission: "org.businessUnit",
  service: BusinessUnitService, createDto: CreateBusinessUnitDto, updateDto: UpdateBusinessUnitDto,
});
const FiscalYearController = createMasterDataController({
  path: "org/fiscal-years", tag: "Org: Fiscal years", module: "org", permission: "org.fiscalYear",
  service: FiscalYearService, createDto: CreateFiscalYearDto, updateDto: UpdateFiscalYearDto,
});
const ExchangeRateController = createMasterDataController({
  path: "org/exchange-rates", tag: "Org: Exchange rates", module: "org", permission: "org.exchangeRate",
  service: ExchangeRateService, createDto: CreateExchangeRateDto, updateDto: UpdateExchangeRateDto,
});

/** Fiscal and currency actions beyond plain CRUD. Declared before the generic controllers so its literal routes win. */
@ApiTags("Org: Fiscal years")
@ApiBearerAuth()
@RequireModule("org")
@Controller("org")
class OrgActionsController {
  constructor(
    private readonly fiscal: FiscalYearService,
    private readonly rates: ExchangeRateService,
  ) {}

  @Get("fiscal-periods/for-date")
  @RequirePermission("org.fiscalYear.view")
  @ApiOperation({ summary: "The fiscal period containing a date" })
  @ApiQuery({ name: "date", example: "2026-11-19" })
  periodFor(@Ctx() ctx: RequestContext, @Query("date") date: string) {
    return this.fiscal.periodFor(ctx, date ?? new Date().toISOString());
  }

  @Post("fiscal-years/:id/periods/:number/status")
  @HttpCode(200)
  @RequirePermission("org.fiscalYear.close")
  @ApiOperation({ summary: "Open, soft-close or lock a period" })
  setPeriodStatus(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
    @Param("number", ParseIntPipe) number: number,
    @Body(validated(SetPeriodStatusDto)) dto: SetPeriodStatusDto,
  ) {
    return this.fiscal.setPeriodStatus(ctx, id, number, dto.status);
  }

  @Get("exchange-rates/lookup")
  @RequirePermission("org.exchangeRate.view")
  @ApiOperation({ summary: "Rate to convert one currency into another on a date" })
  async rate(@Ctx() ctx: RequestContext, @Query("from") from: string, @Query("to") to: string, @Query("date") date?: string) {
    const rate = await this.rates.rateOn(ctx, from, to, date ?? new Date().toISOString());
    return { from, to, date: (date ?? new Date().toISOString()).slice(0, 10), rate };
  }
}

const SERVICES = [BranchService, DepartmentService, TeamService, CostCentreService, BusinessUnitService, FiscalYearService, ExchangeRateService];

@Module({
  controllers: [
    OrgActionsController,
    BranchController,
    DepartmentController,
    TeamController,
    CostCentreController,
    BusinessUnitController,
    FiscalYearController,
    ExchangeRateController,
  ],
  providers: SERVICES,
  exports: SERVICES,
})
export class OrgModule {}
