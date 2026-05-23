import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiQuery, ApiProperty } from "@nestjs/swagger";
import { AssetsService } from "./assets.service";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CompanyId } from "../../common/decorators/company.decorator";
import { IsDateString, IsNumber } from "class-validator";

class DisposeAssetDto {
  @ApiProperty() @IsDateString() disposalDate: string;
  @ApiProperty() @IsNumber() disposalAmount: number;
}

@ApiTags("Finance — Fixed Assets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("finance/assets")
export class AssetsController {
  constructor(private assetsService: AssetsService) {}

  @Get("summary")
  getSummary(@CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string) {
    return this.assetsService.getSummary(tenantId, companyId);
  }

  @Get()
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "category", required: false })
  getAssets(
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
    @Query() query: PaginationDto & { status?: string; category?: string },
  ) {
    return this.assetsService.getAssets(tenantId, companyId, query);
  }

  @Get(":id")
  getAsset(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.assetsService.getAsset(id, tenantId);
  }

  @Post()
  createAsset(@Body() dto: CreateAssetDto, @CurrentUser("tenantId") tenantId: string, @CompanyId() companyId: string) {
    return this.assetsService.createAsset(dto, tenantId, companyId);
  }

  @Put(":id")
  updateAsset(@Param("id") id: string, @Body() dto: Partial<CreateAssetDto>, @CurrentUser("tenantId") tenantId: string) {
    return this.assetsService.updateAsset(id, tenantId, dto);
  }

  @Patch(":id/dispose")
  disposeAsset(@Param("id") id: string, @Body() dto: DisposeAssetDto, @CurrentUser("tenantId") tenantId: string) {
    return this.assetsService.disposeAsset(id, tenantId, dto.disposalDate, dto.disposalAmount);
  }

  @Post("depreciation/run")
  @ApiQuery({ name: "asOfDate", required: true })
  runDepreciation(
    @CurrentUser("tenantId") tenantId: string,
    @CompanyId() companyId: string,
    @Query("asOfDate") asOfDate: string,
  ) {
    return this.assetsService.runDepreciation(tenantId, companyId, asOfDate);
  }
}
