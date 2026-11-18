import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { ReportsService } from "./reports.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CompanyId } from "../../common/decorators/company.decorator";

@ApiTags("Finance — Reports")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("finance/reports")
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get("pl")
  @ApiQuery({ name: "fiscalYear", required: true, type: Number })
  @ApiQuery({ name: "fromPeriod", required: false, type: Number })
  @ApiQuery({ name: "toPeriod", required: false, type: Number })
  getProfitAndLoss(
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
    @Query("fiscalYear") fiscalYear: string,
    @Query("fromPeriod") fromPeriod?: string,
    @Query("toPeriod") toPeriod?: string,
  ) {
    return this.reportsService.getProfitAndLoss(
      tenantId,
      companyId,
      Number(fiscalYear),
      fromPeriod ? Number(fromPeriod) : 1,
      toPeriod ? Number(toPeriod) : 12,
    );
  }

  @Get("balance-sheet")
  @ApiQuery({ name: "fiscalYear", required: true, type: Number })
  @ApiQuery({ name: "asOfPeriod", required: false, type: Number })
  getBalanceSheet(
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
    @Query("fiscalYear") fiscalYear: string,
    @Query("asOfPeriod") asOfPeriod?: string,
  ) {
    return this.reportsService.getBalanceSheet(
      tenantId,
      companyId,
      Number(fiscalYear),
      asOfPeriod ? Number(asOfPeriod) : 12,
    );
  }
}
