import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  async getAssets(tenantId: string, companyId: string, query: PaginationDto & { status?: string; category?: string }) {
    const { page = 1, limit = 25, search, status, category } = query;
    const where: any = { tenantId, companyId };
    if (status) where.status = status;
    if (category) where.category = { contains: category, mode: "insensitive" };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { category: { contains: search, mode: "insensitive" } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.fixedAsset.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.fixedAsset.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getAsset(id: string, tenantId: string) {
    const asset = await this.prisma.fixedAsset.findFirst({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException("Asset not found");
    return asset;
  }

  async createAsset(dto: CreateAssetDto, tenantId: string, companyId: string) {
    const existing = await this.prisma.fixedAsset.findUnique({
      where: { tenantId_companyId_code: { tenantId, companyId, code: dto.code } },
    });
    if (existing) throw new ConflictException(`Asset code ${dto.code} already exists`);

    const salvageValue = dto.salvageValue ?? 0;
    const netBookValue = dto.acquisitionCost - salvageValue;

    return this.prisma.fixedAsset.create({
      data: {
        tenantId,
        companyId,
        code: dto.code,
        name: dto.name,
        category: dto.category,
        acquisitionDate: new Date(dto.acquisitionDate),
        acquisitionCost: dto.acquisitionCost,
        salvageValue,
        netBookValue,
        accumulatedDepr: 0,
        depreciationMethod: dto.depreciationMethod ?? "STRAIGHT_LINE",
        usefulLifeMonths: dto.usefulLifeMonths ?? 60,
        assetAccountId: dto.assetAccountId,
        depreciationAcctId: dto.depreciationAcctId,
        accumDeprAcctId: dto.accumDeprAcctId,
        notes: dto.notes,
        status: "ACTIVE",
      },
    });
  }

  async updateAsset(id: string, tenantId: string, data: Partial<CreateAssetDto>) {
    await this.getAsset(id, tenantId);
    const update: any = { ...data };
    if (data.acquisitionDate) update.acquisitionDate = new Date(data.acquisitionDate);
    return this.prisma.fixedAsset.update({ where: { id }, data: update });
  }

  async disposeAsset(id: string, tenantId: string, disposalDate: string, disposalAmount: number) {
    const asset = await this.getAsset(id, tenantId);
    if (asset.status === "DISPOSED") throw new BadRequestException("Asset is already disposed");
    return this.prisma.fixedAsset.update({
      where: { id },
      data: {
        status: "DISPOSED",
        disposalDate: new Date(disposalDate),
        disposalAmount,
        netBookValue: 0,
      },
    });
  }

  async runDepreciation(tenantId: string, companyId: string, asOfDate: string) {
    const assets = await this.prisma.fixedAsset.findMany({
      where: { tenantId, companyId, status: "ACTIVE" },
    });

    const asOf = new Date(asOfDate);
    const results: any[] = [];

    for (const asset of assets) {
      const monthsOwned = Math.floor(
        (asOf.getTime() - new Date(asset.acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44),
      );
      const depreciableAmount = Number(asset.acquisitionCost) - Number(asset.salvageValue);
      const monthlyDepr = depreciableAmount / asset.usefulLifeMonths;
      const expectedAccumDepr = Math.min(monthlyDepr * monthsOwned, depreciableAmount);
      const currentAccumDepr = Number(asset.accumulatedDepr);
      const periodDepr = Math.max(0, expectedAccumDepr - currentAccumDepr);

      if (periodDepr > 0) {
        const newAccumDepr = currentAccumDepr + periodDepr;
        const newNBV = Math.max(0, Number(asset.acquisitionCost) - newAccumDepr);
        await this.prisma.fixedAsset.update({
          where: { id: asset.id },
          data: { accumulatedDepr: newAccumDepr, netBookValue: newNBV },
        });
        results.push({ assetId: asset.id, code: asset.code, name: asset.name, periodDepr, newAccumDepr, newNBV });
      }
    }

    return { asOfDate, assetsProcessed: results.length, results };
  }

  async getSummary(tenantId: string, companyId: string) {
    const [active, disposed, totalCostAgg, totalNBVAgg] = await Promise.all([
      this.prisma.fixedAsset.count({ where: { tenantId, companyId, status: "ACTIVE" } }),
      this.prisma.fixedAsset.count({ where: { tenantId, companyId, status: "DISPOSED" } }),
      this.prisma.fixedAsset.aggregate({ where: { tenantId, companyId }, _sum: { acquisitionCost: true } }),
      this.prisma.fixedAsset.aggregate({ where: { tenantId, companyId, status: "ACTIVE" }, _sum: { netBookValue: true } }),
    ]);
    return {
      totalActive: active,
      totalDisposed: disposed,
      totalCost: Number(totalCostAgg._sum.acquisitionCost ?? 0),
      totalNetBookValue: Number(totalNBVAgg._sum.netBookValue ?? 0),
    };
  }
}
