import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCompanyDto } from "./dto/create-company.dto";

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.company.findMany({
      where: { tenantId },
      include: { parent: { select: { id: true, name: true, code: true } } },
      orderBy: { name: "asc" },
    });
  }

  async findById(id: string, tenantId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, tenantId },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        children: { select: { id: true, name: true, code: true } },
      },
    });
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  async create(dto: CreateCompanyDto, tenantId: string) {
    return this.prisma.company.create({
      data: { ...dto, tenantId },
    });
  }

  async update(id: string, tenantId: string, data: Partial<CreateCompanyDto>) {
    await this.findById(id, tenantId);
    return this.prisma.company.update({
      where: { id },
      data,
    });
  }

  async getUsers(companyId: string, tenantId: string) {
    await this.findById(companyId, tenantId);
    return this.prisma.companyUser.findMany({
      where: { companyId },
      include: {
        user: {
          select: {
            id: true, email: true, firstName: true, lastName: true,
            phone: true, avatar: true, isActive: true, lastLoginAt: true,
          },
        },
        userRoles: {
          include: { role: { select: { id: true, name: true } } },
        },
      },
    });
  }
}
