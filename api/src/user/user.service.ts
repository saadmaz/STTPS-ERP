import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import * as bcrypt from "bcryptjs";

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, avatar: true, isActive: true, isSuperAdmin: true,
        lastLoginAt: true, createdAt: true,
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

  async findById(id: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, avatar: true, isActive: true, isSuperAdmin: true,
        mfaEnabled: true, lastLoginAt: true, createdAt: true, updatedAt: true,
        companyUsers: {
          include: {
            company: { select: { id: true, name: true, code: true } },
            userRoles: { include: { role: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async create(dto: CreateUserDto, tenantId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email } },
    });
    if (existing) throw new ConflictException("Email already exists in this organization");

    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        phone: dto.phone,
        isActive: true,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, isActive: true, createdAt: true,
      },
    });
  }

  async update(id: string, tenantId: string, data: Partial<CreateUserDto>) {
    await this.findById(id, tenantId);
    const updateData: any = { ...data };
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
      delete updateData.password;
    }
    return this.prisma.user.update({ where: { id }, data: updateData });
  }

  async deactivate(id: string, tenantId: string) {
    await this.findById(id, tenantId);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
