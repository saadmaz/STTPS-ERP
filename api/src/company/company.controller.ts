import { Controller, Get, Post, Put, Body, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { CompanyService } from "./company.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";

@ApiTags("Companies")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("companies")
export class CompanyController {
  constructor(private companyService: CompanyService) {}

  @Get()
  @ApiOperation({ summary: "List all companies in tenant" })
  findAll(@CurrentUser("tenantId") tenantId: string) {
    return this.companyService.findAll(tenantId);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.companyService.findById(id, tenantId);
  }

  @Post()
  create(@Body() dto: CreateCompanyDto, @CurrentUser("tenantId") tenantId: string) {
    return this.companyService.create(dto, tenantId);
  }

  @Put(":id")
  @RequirePermission("company.edit")
  @ApiOperation({ summary: "Update a company (requires company.edit permission)" })
  update(
    @Param("id") id: string,
    @Body() dto: Partial<CreateCompanyDto>,
    @CurrentUser("tenantId") tenantId: string,
  ) {
    return this.companyService.update(id, tenantId, dto);
  }

  @Get(":id/users")
  @ApiOperation({ summary: "List users in a company" })
  getUsers(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.companyService.getUsers(id, tenantId);
  }
}
