import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { BudgetService } from "./budget.service";
import { CreateBudgetDto } from "./dto/create-budget.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CompanyId } from "../../common/decorators/company.decorator";

@ApiTags("Finance — Budgets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("finance/budgets")
export class BudgetController {
  constructor(private budgetService: BudgetService) {}

  @Get()
  @ApiQuery({ name: "fiscalYear", required: false })
  getBudgets(
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
    @Query() query: PaginationDto & { fiscalYear?: string },
  ) {
    return this.budgetService.getBudgets(tenantId, companyId, query);
  }

  @Get(":id")
  getBudget(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.budgetService.getBudget(id, tenantId);
  }

  @Post()
  createBudget(
    @Body() dto: CreateBudgetDto,
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @CompanyId() companyId: string,
  ) {
    return this.budgetService.createBudget(dto, tenantId, companyId, userId);
  }

  @Patch(":id/approve")
  approveBudget(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string, @CurrentUser("id") userId: string) {
    return this.budgetService.approveBudget(id, tenantId, userId);
  }

  @Get(":id/vs-actual")
  getBudgetVsActual(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.budgetService.getBudgetVsActual(id, tenantId);
  }
}
