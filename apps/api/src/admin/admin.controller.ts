import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AdminService } from "./admin.service";
import { PlatformAdminGuard } from "../common/guards/platform-admin.guard";
import {
  CreateTenantDto, UpdateTenantDto, CreateCompanyDto,
  AdminCreateUserDto, CreateRoleDto, UpdateRolePermissionsDto,
  ToggleSuperAdminDto, AssignUserToCompanyDto,
} from "./dto/admin.dto";
import { IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(8) newPassword: string;
}

class ToggleActiveDto {
  @ApiProperty() isActive: boolean;
}

@ApiTags("Admin")
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller("admin")
export class AdminController {
  constructor(private adminService: AdminService) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────

  @Get("dashboard")
  @ApiOperation({ summary: "Platform dashboard stats" })
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  // ── Permissions catalog ────────────────────────────────────────────────────

  @Get("permissions")
  @ApiOperation({ summary: "List all available permissions" })
  listPermissions() {
    return this.adminService.listPermissions();
  }

  // ── Tenants ────────────────────────────────────────────────────────────────

  @Get("tenants")
  @ApiOperation({ summary: "List all tenants" })
  listTenants(@Query("search") search?: string) {
    return this.adminService.listTenants(search);
  }

  @Post("tenants")
  @ApiOperation({ summary: "Create a new tenant (organization)" })
  createTenant(@Body() dto: CreateTenantDto) {
    return this.adminService.createTenant(dto);
  }

  @Get("tenants/:id")
  @ApiOperation({ summary: "Get tenant with companies and users" })
  getTenant(@Param("id") id: string) {
    return this.adminService.getTenant(id);
  }

  @Patch("tenants/:id")
  @ApiOperation({ summary: "Update tenant" })
  updateTenant(@Param("id") id: string, @Body() dto: UpdateTenantDto) {
    return this.adminService.updateTenant(id, dto);
  }

  @Delete("tenants/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete tenant" })
  deleteTenant(@Param("id") id: string) {
    return this.adminService.deleteTenant(id);
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  @Get("tenants/:tenantId/companies")
  @ApiOperation({ summary: "List companies for a tenant" })
  listCompanies(@Param("tenantId") tenantId: string) {
    return this.adminService.listCompanies(tenantId);
  }

  @Post("tenants/:tenantId/companies")
  @ApiOperation({ summary: "Add a company to a tenant" })
  createCompany(@Param("tenantId") tenantId: string, @Body() dto: CreateCompanyDto) {
    return this.adminService.createCompany(tenantId, dto);
  }

  @Patch("companies/:companyId")
  @ApiOperation({ summary: "Update a company" })
  updateCompany(@Param("companyId") companyId: string, @Body() dto: CreateCompanyDto) {
    return this.adminService.updateCompany(companyId, dto);
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  @Get("tenants/:tenantId/users")
  @ApiOperation({ summary: "List users in a tenant" })
  listUsers(@Param("tenantId") tenantId: string) {
    return this.adminService.listUsers(tenantId);
  }

  @Post("tenants/:tenantId/users")
  @ApiOperation({ summary: "Create a user in a tenant" })
  createUser(@Param("tenantId") tenantId: string, @Body() dto: AdminCreateUserDto) {
    return this.adminService.createUser(tenantId, dto);
  }

  @Patch("users/:userId/active")
  @ApiOperation({ summary: "Activate / deactivate a user" })
  toggleActive(@Param("userId") userId: string, @Body() dto: ToggleActiveDto) {
    return this.adminService.toggleUserActive(userId, dto.isActive);
  }

  @Patch("users/:userId/super-admin")
  @ApiOperation({ summary: "Toggle tenant super-admin flag" })
  toggleSuperAdmin(@Param("userId") userId: string, @Body() dto: ToggleSuperAdminDto) {
    return this.adminService.toggleSuperAdmin(userId, dto.isSuperAdmin);
  }

  @Post("users/:userId/reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Reset a user password" })
  resetPassword(@Param("userId") userId: string, @Body() dto: ResetPasswordDto) {
    return this.adminService.resetUserPassword(userId, dto.newPassword);
  }

  @Post("company-users")
  @ApiOperation({ summary: "Assign a user to a company with roles" })
  assignUserToCompany(@Body() dto: AssignUserToCompanyDto) {
    return this.adminService.assignUserToCompany(dto);
  }

  // ── Roles ──────────────────────────────────────────────────────────────────

  @Get("tenants/:tenantId/roles")
  @ApiOperation({ summary: "List roles for a tenant" })
  listRoles(@Param("tenantId") tenantId: string) {
    return this.adminService.listRoles(tenantId);
  }

  @Post("tenants/:tenantId/roles")
  @ApiOperation({ summary: "Create a role for a tenant" })
  createRole(@Param("tenantId") tenantId: string, @Body() dto: CreateRoleDto) {
    return this.adminService.createRole(tenantId, dto);
  }

  @Patch("roles/:roleId/permissions")
  @ApiOperation({ summary: "Replace all permissions on a role" })
  updateRolePermissions(@Param("roleId") roleId: string, @Body() dto: UpdateRolePermissionsDto) {
    return this.adminService.updateRolePermissions(roleId, dto);
  }

  @Delete("roles/:roleId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a role" })
  deleteRole(@Param("roleId") roleId: string) {
    return this.adminService.deleteRole(roleId);
  }
}
