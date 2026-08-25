import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { BankService } from "./bank.service";
import { CreateBankAccountDto } from "./dto/create-bank-account.dto";
import { CreateBankTransactionDto } from "./dto/create-bank-statement.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CompanyId } from "../../common/decorators/company.decorator";

@ApiTags("Finance — Bank")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("finance/bank")
export class BankController {
  constructor(private bankService: BankService) {}

  @Get("summary")
  getSummary(@CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string) {
    return this.bankService.getSummary(tenantId, companyId);
  }

  @Get("accounts")
  getBankAccounts(@CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string, @Query() query: PaginationDto) {
    return this.bankService.getBankAccounts(tenantId, companyId, query);
  }

  @Get("accounts/:id")
  getBankAccount(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.bankService.getBankAccount(id, tenantId);
  }

  @Post("accounts")
  createBankAccount(@Body() dto: CreateBankAccountDto, @CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string) {
    return this.bankService.createBankAccount(dto, tenantId, companyId);
  }

  @Put("accounts/:id")
  updateBankAccount(@Param("id") id: string, @Body() dto: Partial<CreateBankAccountDto>, @CurrentUser("tenantId") tenantId: string) {
    return this.bankService.updateBankAccount(id, tenantId, dto);
  }

  @Get("accounts/:id/transactions")
  getTransactions(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string, @Query() query: PaginationDto) {
    return this.bankService.getTransactions(tenantId, id, query);
  }

  @Post("transactions")
  createTransaction(@Body() dto: CreateBankTransactionDto, @CurrentUser("tenantId") tenantId: string) {
    return this.bankService.createTransaction(dto, tenantId);
  }
}
