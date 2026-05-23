import {
  Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { GlService } from "./gl.service";
import { CreateAccountDto } from "./dto/create-account.dto";
import { CreateJournalDto } from "./dto/create-journal.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CompanyId } from "../../common/decorators/company.decorator";

@ApiTags("Finance — General Ledger")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("finance/gl")
export class GlController {
  constructor(private glService: GlService) {}

  // Dashboard
  @Get("dashboard")
  @ApiOperation({ summary: "Finance dashboard stats" })
  getDashboard(
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
  ) {
    return this.glService.getDashboardStats(tenantId, companyId);
  }

  // ─── Chart of Accounts ────────────────────────────────────────

  @Get("accounts")
  @ApiOperation({ summary: "List all GL accounts" })
  getAccounts(
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
  ) {
    return this.glService.getAccounts(tenantId, companyId);
  }

  @Get("accounts/:id")
  getAccount(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.glService.getAccount(id, tenantId);
  }

  @Post("accounts")
  createAccount(
    @Body() dto: CreateAccountDto,
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
  ) {
    return this.glService.createAccount(dto, tenantId, companyId);
  }

  @Put("accounts/:id")
  updateAccount(
    @Param("id") id: string,
    @Body() dto: Partial<CreateAccountDto>,
    @CurrentUser("tenantId") tenantId: string,
  ) {
    return this.glService.updateAccount(id, tenantId, dto);
  }

  // ─── Periods ──────────────────────────────────────────────────

  @Get("periods")
  @ApiOperation({ summary: "List fiscal periods" })
  @ApiQuery({ name: "fiscalYear", required: false, type: Number })
  getPeriods(
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
    @Query("fiscalYear") fiscalYear?: number,
  ) {
    return this.glService.getPeriods(tenantId, companyId, fiscalYear ? Number(fiscalYear) : undefined);
  }

  // ─── Journal Entries ──────────────────────────────────────────

  @Get("journals")
  @ApiOperation({ summary: "List journal entries" })
  getJournals(
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
    @Query() query: PaginationDto,
  ) {
    return this.glService.getJournals(tenantId, companyId, query);
  }

  @Get("journals/:id")
  getJournal(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.glService.getJournal(id, tenantId);
  }

  @Post("journals")
  @ApiOperation({ summary: "Create a journal entry" })
  createJournal(
    @Body() dto: CreateJournalDto,
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @CompanyId() companyId: string,
  ) {
    return this.glService.createJournal(dto, tenantId, companyId, userId);
  }

  @Patch("journals/:id/post")
  @ApiOperation({ summary: "Post a draft journal entry" })
  postJournal(
    @Param("id") id: string,
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.glService.postJournal(id, tenantId, userId);
  }

  @Patch("journals/:id/void")
  @ApiOperation({ summary: "Void a posted journal entry" })
  voidJournal(
    @Param("id") id: string,
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.glService.voidJournal(id, tenantId, userId);
  }

  // ─── Trial Balance ────────────────────────────────────────────

  @Get("trial-balance")
  @ApiOperation({ summary: "Get trial balance" })
  @ApiQuery({ name: "fiscalYear", required: true, type: Number })
  @ApiQuery({ name: "period", required: false, type: Number })
  getTrialBalance(
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
    @Query("fiscalYear") fiscalYear: number,
    @Query("period") period?: number,
  ) {
    return this.glService.getTrialBalance(tenantId, companyId, Number(fiscalYear), period ? Number(period) : undefined);
  }
}
