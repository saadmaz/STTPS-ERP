import { Controller, Get, Header, Module, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { CrmModule } from "../crm/crm.module.js";
import { FinanceModule } from "../finance/finance.module.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { ProcurementModule } from "../procurement/procurement.module.js";
import { SalesModule } from "../sales/sales.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { CreateReportDefinitionDto, UpdateReportDefinitionDto } from "./reports.dto.js";
import { ReportDefinitionService, ReportingEngineService } from "./reports.services.js";

@ApiTags("Reports")
@ApiBearerAuth()
@RequireModule("analytics")
@Controller("reports/definitions")
class ReportsActionsController {
  constructor(private readonly engine: ReportingEngineService) {}

  @Get(":id/run")
  @RequirePermission("analytics.reportDefinition.view")
  run(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.engine.run(ctx, id);
  }

  @Get(":id/export.csv")
  @RequirePermission("analytics.reportDefinition.view")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="report.csv"')
  async exportCsv(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.engine.toCsv(await this.engine.run(ctx, id));
  }

  @Get(":id/export.xlsx")
  @RequirePermission("analytics.reportDefinition.view")
  @Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @Header("Content-Disposition", 'attachment; filename="report.xlsx"')
  async exportXlsx(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.engine.toXlsx(await this.engine.run(ctx, id));
  }
}

const crud = [
  createMasterDataController({ path: "reports/definitions", tag: "Reports: Definitions", module: "analytics", permission: "analytics.reportDefinition", service: ReportDefinitionService, createDto: CreateReportDefinitionDto, updateDto: UpdateReportDefinitionDto }),
];

const SERVICES = [ReportDefinitionService, ReportingEngineService];

@Module({
  imports: [SalesModule, FinanceModule, ProcurementModule, CrmModule, TasksModule],
  controllers: [ReportsActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class ReportsModule {}
