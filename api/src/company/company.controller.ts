import { Controller, Get, Post, Put, Body, Param, ForbiddenException } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { CompanyService } from "./company.service.js";
import { CreateCompanyDto } from "./dto/create-company.dto.js";
import { UpdateCompanyDto } from "./dto/update-company.dto.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";

interface AuthUser {
  id: string;
  tenantId: string;
  isSuperAdmin: boolean;
}

@ApiTags("Companies")
@ApiBearerAuth()
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
  @ApiOperation({ summary: "Create a company in my tenant (tenant administrators)" })
  create(@Body() dto: CreateCompanyDto, @CurrentUser() user: AuthUser) {
    if (!user.isSuperAdmin) throw new ForbiddenException("Only tenant administrators can create companies");
    return this.companyService.create(dto, user.tenantId);
  }

  @Put(":id")
  @RequirePermission("platform.company.edit")
  @ApiOperation({ summary: "Update a company" })
  update(@Param("id") id: string, @Body() dto: UpdateCompanyDto, @CurrentUser("tenantId") tenantId: string) {
    return this.companyService.update(id, tenantId, dto);
  }

  @Get(":id/users")
  @RequirePermission("platform.user.view")
  @ApiOperation({ summary: "List users in a company" })
  getUsers(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.companyService.getUsers(id, tenantId);
  }
}
