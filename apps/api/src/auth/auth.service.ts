import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    // Find user by email (across all tenants — in prod, tenant is determined by subdomain)
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, isActive: true },
      include: {
        companyUsers: {
          where: { isDefault: true },
          include: { company: true },
          take: 1,
        },
      },
      // isPlatformAdmin is already on the User model
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user);

    // Save refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    const defaultCompany = user.companyUsers[0]?.company;

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
        isSuperAdmin: user.isSuperAdmin,
        isPlatformAdmin: user.isPlatformAdmin,
        defaultCompanyId: defaultCompany?.id,
        defaultCompanyName: defaultCompany?.name,
      },
    };
  }

  async register(dto: RegisterDto) {
    // Check slug uniqueness
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.organizationSlug },
    });
    if (existingTenant) {
      throw new ConflictException("Organization slug is already taken");
    }

    // Check email uniqueness globally
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException("Email is already registered");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create tenant, company, and user in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.organizationName,
          slug: dto.organizationSlug,
          plan: "starter",
          status: "active",
        },
      });

      const company = await tx.company.create({
        data: {
          tenantId: tenant.id,
          name: dto.companyName || dto.organizationName,
          code: "MAIN",
          currency: "USD",
          timezone: "UTC",
          fiscalYearStart: 1,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          isActive: true,
          isSuperAdmin: true,
        },
      });

      const companyUser = await tx.companyUser.create({
        data: {
          userId: user.id,
          companyId: company.id,
          isDefault: true,
        },
      });

      // Create admin role
      const adminRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          companyId: company.id,
          name: "Administrator",
          description: "Full system access",
          isSystem: true,
        },
      });

      await tx.userRole.create({
        data: {
          companyUserId: companyUser.id,
          roleId: adminRole.id,
        },
      });

      return { tenant, company, user };
    });

    return {
      message: "Organization created successfully",
      tenantSlug: result.tenant.slug,
      email: result.user.email,
    };
  }

  async refreshTokens(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (!session.user.isActive) {
      throw new UnauthorizedException("User is inactive");
    }

    const tokens = await this.generateTokens(session.user);

    // Rotate refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshToken: tokens.refreshToken, expiresAt },
    });

    return tokens;
  }

  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({
      where: { refreshToken },
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        tenantId: true,
        isSuperAdmin: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        companyUsers: {
          include: {
            company: {
              select: { id: true, name: true, code: true, currency: true, logoUrl: true },
            },
            userRoles: {
              include: {
                role: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    return user;
  }

  private async generateTokens(user: { id: string; email: string; tenantId: string; isSuperAdmin: boolean; isPlatformAdmin: boolean }) {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      isSuperAdmin: user.isSuperAdmin,
      isPlatformAdmin: user.isPlatformAdmin,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get("JWT_SECRET"),
        expiresIn: this.configService.get("JWT_EXPIRES_IN", "15m"),
      }),
      // Refresh token: random string stored in DB
      Promise.resolve(crypto.randomBytes(64).toString("hex")),
    ]);

    return { accessToken, refreshToken };
  }
}
