import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateTenantDto,
  UpdateTenantDto,
  CreateCompanyDto,
  AdminCreateUserDto,
  CreateRoleDto,
  UpdateRolePermissionsDto,
  AssignUserToCompanyDto,
} from "./dto/admin.dto";
import * as bcrypt from "bcryptjs";

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [tenants, users, companies] = await Promise.all([
      this.prisma.tenant.count({ where: { slug: { not: "_platform" } } }),
      this.prisma.user.count({ where: { isPlatformAdmin: { not: true } } }),
      this.prisma.company.count({ where: { tenant: { slug: { not: "_platform" } } } }),
    ]);
    const recentTenants = await this.prisma.tenant.findMany({
      where: { slug: { not: "_platform" } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    return { tenants, users, companies, recentTenants };
  }

  // ── Tenants ────────────────────────────────────────────────────────────────

  async listTenants(search?: string) {
    return this.prisma.tenant.findMany({
      where: {
        slug: { not: "_platform" },
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { companies: true, users: true } },
      },
    });
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        companies: { orderBy: { createdAt: "asc" } },
        users: {
          where: { isPlatformAdmin: { not: true } },
          select: {
            id: true, email: true, firstName: true, lastName: true,
            isActive: true, isSuperAdmin: true, lastLoginAt: true, createdAt: true,
            companyUsers: {
              include: {
                company: { select: { id: true, name: true } },
                userRoles: { include: { role: { select: { id: true, name: true } } } },
              },
            },
          },
          orderBy: { firstName: "asc" },
        },
      },
    });
    if (!tenant) throw new NotFoundException("Tenant not found");
    return tenant;
  }

  async createTenant(dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException("Slug already taken");

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.name, slug: dto.slug, plan: dto.plan ?? "starter", status: "active" },
      });
      await tx.company.create({
        data: {
          tenantId: tenant.id,
          name: dto.companyName ?? dto.name,
          code: "MAIN",
          currency: dto.currency ?? "USD",
          timezone: dto.timezone ?? "UTC",
          fiscalYearStart: 1,
        },
      });
      return tenant;
    });
  }

  async updateTenant(id: string, dto: UpdateTenantDto) {
    await this.prisma.tenant.findUniqueOrThrow({ where: { id } });
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async deleteTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    if (tenant.slug === "_platform") throw new BadRequestException("Cannot delete platform tenant");
    return this.prisma.tenant.delete({ where: { id } });
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(tenantId: string) {
    return this.prisma.company.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { companyUsers: true } } },
    });
  }

  async createCompany(tenantId: string, dto: CreateCompanyDto) {
    const existing = await this.prisma.company.findUnique({
      where: { tenantId_code: { tenantId, code: dto.code } },
    });
    if (existing) throw new ConflictException("Company code already exists in this tenant");

    return this.prisma.company.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        legalName: dto.legalName,
        taxId: dto.taxId,
        currency: dto.currency ?? "USD",
        timezone: dto.timezone ?? "UTC",
        fiscalYearStart: 1,
      },
    });
  }

  async updateCompany(companyId: string, dto: Partial<CreateCompanyDto>) {
    return this.prisma.company.update({ where: { id: companyId }, data: dto });
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, isPlatformAdmin: false },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, isActive: true, isSuperAdmin: true, lastLoginAt: true, createdAt: true,
        companyUsers: {
          include: {
            company: { select: { id: true, name: true, code: true } },
            userRoles: { include: { role: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { firstName: "asc" },
    });
  }

  async createUser(tenantId: string, dto: AdminCreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email } },
    });
    if (existing) throw new ConflictException("Email already exists in this tenant");

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          phone: dto.phone,
          isActive: true,
          isSuperAdmin: dto.isSuperAdmin ?? false,
        },
      });

      if (dto.companyId) {
        const companyUser = await tx.companyUser.create({
          data: { userId: user.id, companyId: dto.companyId, isDefault: true },
        });

        if (dto.roleIds?.length) {
          await tx.userRole.createMany({
            data: dto.roleIds.map((roleId) => ({ companyUserId: companyUser.id, roleId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.user.findUnique({
        where: { id: user.id },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          isActive: true, isSuperAdmin: true, createdAt: true,
          companyUsers: {
            include: {
              company: { select: { id: true, name: true } },
              userRoles: { include: { role: { select: { id: true, name: true } } } },
            },
          },
        },
      });
    });
  }

  async toggleUserActive(userId: string, isActive: boolean) {
    return this.prisma.user.update({ where: { id: userId }, data: { isActive } });
  }

  async toggleSuperAdmin(userId: string, isSuperAdmin: boolean) {
    return this.prisma.user.update({ where: { id: userId }, data: { isSuperAdmin } });
  }

  async assignUserToCompany(dto: AssignUserToCompanyDto) {
    const companyUser = await this.prisma.companyUser.upsert({
      where: { userId_companyId: { userId: dto.userId, companyId: dto.companyId } },
      update: { isDefault: dto.isDefault ?? false },
      create: { userId: dto.userId, companyId: dto.companyId, isDefault: dto.isDefault ?? false },
    });

    if (dto.roleIds?.length) {
      await this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ companyUserId: companyUser.id, roleId })),
        skipDuplicates: true,
      });
    }

    return companyUser;
  }

  async resetUserPassword(userId: string, newPassword: string) {
    if (newPassword.length < 8) throw new BadRequestException("Password must be at least 8 characters");
    const passwordHash = await bcrypt.hash(newPassword, 12);
    return this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  // ── Roles ──────────────────────────────────────────────────────────────────

  async listRoles(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      include: {
        _count: { select: { userRoles: true } },
        rolePermissions: { include: { permission: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async createRole(tenantId: string, dto: CreateRoleDto) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          tenantId,
          companyId: dto.companyId ?? null,
          name: dto.name,
          description: dto.description,
        },
      });

      if (dto.permissionCodes?.length) {
        const permissions = await tx.permission.findMany({
          where: { code: { in: dto.permissionCodes } },
        });
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
          skipDuplicates: true,
        });
      }

      return tx.role.findUnique({
        where: { id: role.id },
        include: { rolePermissions: { include: { permission: true } } },
      });
    });
  }

  async updateRolePermissions(roleId: string, dto: UpdateRolePermissionsDto) {
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: dto.permissionCodes } },
    });

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
        skipDuplicates: true,
      }),
    ]);

    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }

  async deleteRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException("Role not found");
    if (role.isSystem) throw new BadRequestException("Cannot delete system roles");
    return this.prisma.role.delete({ where: { id: roleId } });
  }

  // ── Permissions ────────────────────────────────────────────────────────────

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] });
  }
}
