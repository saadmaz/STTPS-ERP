import { Body, Controller, Get, HttpCode, Module, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Public } from "../common/decorators/public.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { ProductsModule } from "../products/products.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { DeliveryService, LinePricer, OrderService, QuoteService, ReturnService, SalesSettingsService } from "./sales.services.js";
import {
  CancelDto,
  CreateDeliveryDto,
  CreateOrderDto,
  CreateQuoteDto,
  CreateReturnDto,
  DeliverDto,
  FailDeliveryDto,
  SalesSettingsDto,
  UpdateDeliveryDto,
  UpdateOrderDto,
  UpdateQuoteDto,
  UpdateReturnDto,
} from "./sales.dto.js";

export class QuoteResponseDto {
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class ConvertQuoteDto {
  @IsOptional() @IsString() warehouseId?: string;
}

@ApiTags("Sales")
@ApiBearerAuth()
@RequireModule("sales")
@Controller("sales")
class SalesActionsController {
  constructor(
    private readonly quotes: QuoteService,
    private readonly orders: OrderService,
    private readonly deliveries: DeliveryService,
    private readonly returns: ReturnService,
    private readonly settings: SalesSettingsService,
  ) {}

  @Get("settings")
  @RequirePermission("sales.quote.view")
  getSettings(@Ctx() ctx: RequestContext) {
    return this.settings.get(ctx);
  }

  @Put("settings")
  @RequirePermission("sales.settings.edit")
  @ApiOperation({ summary: "Tax rates, quote validity, discount approval threshold, default warehouse and terms" })
  putSettings(@Ctx() ctx: RequestContext, @Body(validated(SalesSettingsDto)) dto: SalesSettingsDto) {
    return this.settings.update(ctx, dto);
  }

  @Post("quotes/:id/submit")
  @HttpCode(200)
  @RequirePermission("sales.quote.edit")
  submitQuote(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.quotes.submit(ctx, id);
  }

  @Post("quotes/:id/send")
  @HttpCode(200)
  @RequirePermission("sales.quote.edit")
  @ApiOperation({ summary: "Create the customer link (and email it to the contact)" })
  sendQuote(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.quotes.send(ctx, id);
  }

  @Post("quotes/:id/revise")
  @HttpCode(200)
  @RequirePermission("sales.quote.edit")
  revise(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.quotes.revise(ctx, id);
  }

  @Post("quotes/:id/convert")
  @HttpCode(200)
  @RequirePermission("sales.order.create")
  @ApiOperation({ summary: "Turn an accepted quote into a draft sales order" })
  convert(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ConvertQuoteDto)) dto: ConvertQuoteDto) {
    return this.orders.fromQuote(ctx, this.quotes, id, dto.warehouseId);
  }

  @Post("orders/:id/confirm")
  @HttpCode(200)
  @RequirePermission("sales.order.edit")
  @ApiOperation({ summary: "Check credit and discounts (approval if exceeded), then reserve stock" })
  confirm(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.orders.confirm(ctx, id);
  }

  @Post("orders/:id/reserve")
  @HttpCode(200)
  @RequirePermission("sales.order.edit")
  reserve(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.orders.reserveShortages(ctx, id);
  }

  @Post("orders/:id/cancel")
  @HttpCode(200)
  @RequirePermission("sales.order.delete")
  cancelOrder(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CancelDto)) dto: CancelDto) {
    return this.orders.cancel(ctx, id, dto.reason);
  }

  @Post("deliveries/:id/pick")
  @HttpCode(200)
  @RequirePermission("sales.delivery.edit")
  pick(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.deliveries.setStatus(ctx, id, "picked");
  }

  @Post("deliveries/:id/pack")
  @HttpCode(200)
  @RequirePermission("sales.delivery.edit")
  pack(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.deliveries.setStatus(ctx, id, "packed");
  }

  @Post("deliveries/:id/dispatch")
  @HttpCode(200)
  @RequirePermission("sales.delivery.edit")
  @ApiOperation({ summary: "Issue the stock and send the goods" })
  dispatch(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.deliveries.dispatch(ctx, id);
  }

  @Post("deliveries/:id/deliver")
  @HttpCode(200)
  @RequirePermission("sales.delivery.edit")
  @ApiOperation({ summary: "Proof of delivery" })
  deliver(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(DeliverDto)) dto: DeliverDto) {
    return this.deliveries.deliver(ctx, id, dto.receivedBy);
  }

  @Post("deliveries/:id/fail")
  @HttpCode(200)
  @RequirePermission("sales.delivery.edit")
  fail(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(FailDeliveryDto)) dto: FailDeliveryDto) {
    return this.deliveries.fail(ctx, id, dto.reason);
  }

  @Post("deliveries/:id/cancel")
  @HttpCode(200)
  @RequirePermission("sales.delivery.edit")
  cancelDelivery(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.deliveries.cancel(ctx, id);
  }

  @Post("returns/:id/approve")
  @HttpCode(200)
  @RequirePermission("sales.return.edit")
  approveReturn(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.returns.approve(ctx, id);
  }

  @Post("returns/:id/reject")
  @HttpCode(200)
  @RequirePermission("sales.return.edit")
  rejectReturn(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CancelDto)) dto: CancelDto) {
    return this.returns.reject(ctx, id, dto.reason);
  }

  @Post("returns/:id/receive")
  @HttpCode(200)
  @RequirePermission("sales.return.edit")
  receiveReturn(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.returns.receive(ctx, id);
  }
}

/** The customer-facing quote page: reachable without signing in, with the unguessable link token. */
@ApiTags("Public")
@Controller("public/quotes")
class PublicQuotesController {
  constructor(private readonly quotes: QuoteService) {}

  @Public()
  @Get(":token")
  view(@Param("token") token: string) {
    return this.quotes.publicView(token);
  }

  @Public()
  @Post(":token/accept")
  @HttpCode(200)
  accept(@Param("token") token: string, @Body() dto: QuoteResponseDto) {
    return this.quotes.respond(token, true, dto.comment);
  }

  @Public()
  @Post(":token/reject")
  @HttpCode(200)
  reject(@Param("token") token: string, @Body() dto: QuoteResponseDto) {
    return this.quotes.respond(token, false, dto.comment);
  }
}

const crud = [
  createMasterDataController({ path: "sales/quotes", tag: "Sales: Quotes", module: "sales", permission: "sales.quote", service: QuoteService, createDto: CreateQuoteDto, updateDto: UpdateQuoteDto }),
  createMasterDataController({ path: "sales/orders", tag: "Sales: Orders", module: "sales", permission: "sales.order", service: OrderService, createDto: CreateOrderDto, updateDto: UpdateOrderDto }),
  createMasterDataController({ path: "sales/deliveries", tag: "Sales: Deliveries", module: "sales", permission: "sales.delivery", service: DeliveryService, createDto: CreateDeliveryDto, updateDto: UpdateDeliveryDto }),
  createMasterDataController({ path: "sales/returns", tag: "Sales: Returns", module: "sales", permission: "sales.return", service: ReturnService, createDto: CreateReturnDto, updateDto: UpdateReturnDto }),
];

const SERVICES = [SalesSettingsService, LinePricer, QuoteService, OrderService, DeliveryService, ReturnService];

@Module({
  imports: [ProductsModule, InventoryModule],
  controllers: [SalesActionsController, PublicQuotesController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class SalesModule {}

