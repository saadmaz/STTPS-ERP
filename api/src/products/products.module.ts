import { Controller, Get, HttpCode, Module, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import {
  CategoryService,
  DiscountRuleService,
  PriceListItemService,
  PriceListService,
  PricingService,
  ProductService,
  UomService,
} from "./products.services.js";
import {
  CreateCategoryDto,
  CreateDiscountRuleDto,
  CreatePriceListDto,
  CreatePriceListItemDto,
  CreateProductDto,
  CreateUomDto,
  PriceQueryDto,
  UpdateCategoryDto,
  UpdateDiscountRuleDto,
  UpdatePriceListDto,
  UpdatePriceListItemDto,
  UpdateProductDto,
  UpdateUomDto,
} from "./products.dto.js";

@ApiTags("Products")
@ApiBearerAuth()
@RequireModule("products")
@Controller("products")
class ProductActionsController {
  constructor(
    private readonly pricing: PricingService,
    private readonly lists: PriceListService,
  ) {}

  @Get("price")
  @RequirePermission("products.product.view")
  @ApiOperation({ summary: "Selling price for a product, customer, quantity and date, with the discounts applied" })
  price(@Ctx() ctx: RequestContext, @Query(validated(PriceQueryDto)) q: PriceQueryDto) {
    return this.pricing.quote(ctx, q);
  }

  @Post("price-lists/:id/activate")
  @HttpCode(200)
  @RequirePermission("products.priceList.edit")
  @ApiOperation({ summary: "Activate a price list (through approval when a workflow applies)" })
  activate(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.lists.activate(ctx, id);
  }

  @Post("price-lists/:id/deactivate")
  @HttpCode(200)
  @RequirePermission("products.priceList.edit")
  deactivate(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.lists.deactivate(ctx, id);
  }
}

const controllers = [
  createMasterDataController({ path: "products/items", tag: "Products", module: "products", permission: "products.product", service: ProductService, createDto: CreateProductDto, updateDto: UpdateProductDto }),
  createMasterDataController({ path: "products/categories", tag: "Products: Categories", module: "products", permission: "products.category", service: CategoryService, createDto: CreateCategoryDto, updateDto: UpdateCategoryDto }),
  createMasterDataController({ path: "products/uoms", tag: "Products: Units", module: "products", permission: "products.uom", service: UomService, createDto: CreateUomDto, updateDto: UpdateUomDto }),
  createMasterDataController({ path: "products/price-lists", tag: "Products: Price lists", module: "products", permission: "products.priceList", service: PriceListService, createDto: CreatePriceListDto, updateDto: UpdatePriceListDto }),
  createMasterDataController({ path: "products/prices", tag: "Products: Prices", module: "products", permission: "products.priceList", service: PriceListItemService, createDto: CreatePriceListItemDto, updateDto: UpdatePriceListItemDto }),
  createMasterDataController({ path: "products/discounts", tag: "Products: Discounts", module: "products", permission: "products.discountRule", service: DiscountRuleService, createDto: CreateDiscountRuleDto, updateDto: UpdateDiscountRuleDto }),
];

const SERVICES = [UomService, CategoryService, ProductService, PriceListService, PriceListItemService, DiscountRuleService, PricingService];

@Module({
  controllers: [ProductActionsController, ...controllers],
  providers: SERVICES,
  exports: SERVICES,
})
export class ProductsModule {}
