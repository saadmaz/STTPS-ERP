import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { ApService } from "./ap.service";
import { CreateVendorDto } from "./dto/create-vendor.dto";
import { CreateApInvoiceDto } from "./dto/create-ap-invoice.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CompanyId } from "../../common/decorators/company.decorator";

@ApiTags("Finance — Accounts Payable")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("finance/ap")
export class ApController {
  constructor(private apService: ApService) {}

  // Vendors
  @Get("vendors")
  @ApiOperation({ summary: "List vendors" })
  getVendors(@CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string, @Query() query: PaginationDto) {
    return this.apService.getVendors(tenantId, companyId, query);
  }

  @Get("vendors/:id")
  getVendor(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.apService.getVendor(id, tenantId);
  }

  @Post("vendors")
  @ApiOperation({ summary: "Create vendor" })
  createVendor(@Body() dto: CreateVendorDto, @CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string) {
    return this.apService.createVendor(dto, tenantId, companyId);
  }

  @Put("vendors/:id")
  updateVendor(@Param("id") id: string, @Body() dto: Partial<CreateVendorDto>, @CurrentUser("tenantId") tenantId: string) {
    return this.apService.updateVendor(id, tenantId, dto);
  }

  // Invoices
  @Get("invoices")
  @ApiOperation({ summary: "List AP invoices" })
  @ApiQuery({ name: "status", required: false })
  getInvoices(
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
    @Query() query: PaginationDto & { status?: string },
  ) {
    return this.apService.getInvoices(tenantId, companyId, query);
  }

  @Get("invoices/:id")
  getInvoice(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.apService.getInvoice(id, tenantId);
  }

  @Post("invoices")
  @ApiOperation({ summary: "Create AP invoice" })
  createInvoice(
    @Body() dto: CreateApInvoiceDto,
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @CompanyId() companyId: string,
  ) {
    return this.apService.createInvoice(dto, tenantId, companyId, userId);
  }

  @Patch("invoices/:id/approve")
  approveInvoice(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string, @CurrentUser("id") userId: string) {
    return this.apService.approveInvoice(id, tenantId, userId);
  }

  @Patch("invoices/:id/post")
  postInvoice(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string, @CurrentUser("id") userId: string) {
    return this.apService.postInvoice(id, tenantId, userId);
  }

  @Get("aging")
  @ApiOperation({ summary: "AP aging report" })
  getAging(@CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string) {
    return this.apService.getAgingReport(tenantId, companyId);
  }
}
