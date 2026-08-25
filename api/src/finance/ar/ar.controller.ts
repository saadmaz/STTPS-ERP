import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { ArService } from "./ar.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CreateArInvoiceDto } from "./dto/create-ar-invoice.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CompanyId } from "../../common/decorators/company.decorator";

@ApiTags("Finance — Accounts Receivable")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("finance/ar")
export class ArController {
  constructor(private arService: ArService) {}

  @Get("customers")
  getCustomers(@CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string, @Query() query: PaginationDto) {
    return this.arService.getCustomers(tenantId, companyId, query);
  }

  @Get("customers/:id")
  getCustomer(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.arService.getCustomer(id, tenantId);
  }

  @Post("customers")
  createCustomer(@Body() dto: CreateCustomerDto, @CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string) {
    return this.arService.createCustomer(dto, tenantId, companyId);
  }

  @Put("customers/:id")
  updateCustomer(@Param("id") id: string, @Body() dto: Partial<CreateCustomerDto>, @CurrentUser("tenantId") tenantId: string) {
    return this.arService.updateCustomer(id, tenantId, dto);
  }

  @Get("invoices")
  @ApiQuery({ name: "status", required: false })
  getInvoices(@CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string, @Query() query: PaginationDto & { status?: string }) {
    return this.arService.getInvoices(tenantId, companyId, query);
  }

  @Get("invoices/:id")
  getInvoice(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.arService.getInvoice(id, tenantId);
  }

  @Post("invoices")
  createInvoice(
    @Body() dto: CreateArInvoiceDto,
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @CompanyId() companyId: string,
  ) {
    return this.arService.createInvoice(dto, tenantId, companyId, userId);
  }

  @Patch("invoices/:id/post")
  postInvoice(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string, @CurrentUser("id") userId: string) {
    return this.arService.postInvoice(id, tenantId, userId);
  }

  @Get("aging")
  getAging(@CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string) {
    return this.arService.getAgingReport(tenantId, companyId);
  }
}
