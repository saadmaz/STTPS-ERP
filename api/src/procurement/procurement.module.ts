import { Body, Controller, Get, HttpCode, Module, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { OrgModule } from "../org/org.module.js";
import { ProductsModule } from "../products/products.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { SalesModule } from "../sales/sales.module.js";
import { FinanceModule } from "../finance/finance.module.js";
import {
  GoodsReceiptService,
  ProcurementAnalyticsService,
  PurchaseOrderService,
  RequisitionService,
  RfqService,
  SupplierReturnService,
  SupplierService,
} from "./procurement.services.js";
import {
  AwardDto,
  CreatePurchaseOrderDto,
  CreateReceiptDto,
  CreateRequisitionDto,
  CreateRfqDto,
  CreateSupplierDto,
  CreateSupplierReturnDto,
  ReasonDto,
  RfqQuoteDto,
  SupplierConfirmDto,
  UpdatePurchaseOrderDto,
  UpdateReceiptDto,
  UpdateRequisitionDto,
  UpdateRfqDto,
  UpdateSupplierDto,
  UpdateSupplierReturnDto,
} from "./procurement.dto.js";

@ApiTags("Procurement")
@ApiBearerAuth()
@RequireModule("procurement")
@Controller("procurement")
class ProcurementActionsController {
  constructor(
    private readonly requisitions: RequisitionService,
    private readonly rfqs: RfqService,
    private readonly orders: PurchaseOrderService,
    private readonly receipts: GoodsReceiptService,
    private readonly returns: SupplierReturnService,
    private readonly analytics: ProcurementAnalyticsService,
  ) {}

  @Get("analytics")
  @RequirePermission("procurement.analytics.view")
  @ApiOperation({ summary: "Spend by supplier, category and department; price variance; lead time; delivery performance" })
  summary(@Ctx() ctx: RequestContext, @Query("from") from?: string, @Query("to") to?: string) {
    const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    return this.analytics.summary(ctx, { from: date(from), to: date(to) });
  }

  @Post("requisitions/:id/submit")
  @HttpCode(200)
  @RequirePermission("procurement.requisition.edit")
  @ApiOperation({ summary: "Send for approval (approved at once when no rule applies)" })
  submitRequisition(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.requisitions.submit(ctx, id);
  }

  @Post("requisitions/:id/cancel")
  @HttpCode(200)
  @RequirePermission("procurement.requisition.edit")
  cancelRequisition(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.requisitions.cancel(ctx, id);
  }

  @Post("rfqs/:id/quotes")
  @HttpCode(200)
  @RequirePermission("procurement.rfq.edit")
  @ApiOperation({ summary: "Record a supplier's quoted prices" })
  addQuote(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RfqQuoteDto)) dto: RfqQuoteDto) {
    return this.rfqs.addQuote(ctx, id, dto);
  }

  @Get("rfqs/:id/compare")
  @RequirePermission("procurement.rfq.view")
  compare(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.rfqs.compare(ctx, id);
  }

  @Post("rfqs/:id/award")
  @HttpCode(200)
  @RequirePermission("procurement.order.create")
  @ApiOperation({ summary: "Award to a supplier and raise a draft purchase order" })
  award(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(AwardDto)) dto: AwardDto) {
    return this.rfqs.award(ctx, id, dto);
  }

  @Post("orders/:id/submit")
  @HttpCode(200)
  @RequirePermission("procurement.order.edit")
  @ApiOperation({ summary: "Approval by value thresholds, then the quantities count as on order" })
  submitOrder(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.orders.submit(ctx, id);
  }

  @Post("orders/:id/send")
  @HttpCode(200)
  @RequirePermission("procurement.order.edit")
  send(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.orders.markSent(ctx, id);
  }

  @Post("orders/:id/confirm")
  @HttpCode(200)
  @RequirePermission("procurement.order.edit")
  @ApiOperation({ summary: "Record the supplier's acknowledgement" })
  confirm(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(SupplierConfirmDto)) dto: SupplierConfirmDto) {
    return this.orders.supplierConfirm(ctx, id, dto);
  }

  @Post("orders/:id/amend")
  @HttpCode(200)
  @RequirePermission("procurement.order.edit")
  @ApiOperation({ summary: "Reopen an approved order for changes; it is approved again as a new amendment" })
  amend(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.orders.amend(ctx, id);
  }

  @Post("orders/:id/cancel")
  @HttpCode(200)
  @RequirePermission("procurement.order.delete")
  cancelOrder(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ReasonDto)) dto: ReasonDto) {
    return this.orders.cancel(ctx, id, dto.reason);
  }

  @Post("receipts/:id/post")
  @HttpCode(200)
  @RequirePermission("procurement.receipt.edit")
  @ApiOperation({ summary: "Put accepted goods into stock at the order price" })
  post(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.receipts.post(ctx, id);
  }

  @Post("receipts/:id/cancel")
  @HttpCode(200)
  @RequirePermission("procurement.receipt.edit")
  cancelReceipt(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.receipts.cancel(ctx, id);
  }

  @Post("returns/:id/ship")
  @HttpCode(200)
  @RequirePermission("procurement.receipt.edit")
  @ApiOperation({ summary: "Send the goods back to the supplier" })
  ship(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.returns.ship(ctx, id);
  }

  @Post("returns/:id/cancel")
  @HttpCode(200)
  @RequirePermission("procurement.receipt.edit")
  cancelReturn(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.returns.cancel(ctx, id);
  }
}

const crud = [
  createMasterDataController({ path: "procurement/suppliers", tag: "Procurement: Suppliers", module: "procurement", permission: "procurement.supplier", service: SupplierService, createDto: CreateSupplierDto, updateDto: UpdateSupplierDto }),
  createMasterDataController({ path: "procurement/requisitions", tag: "Procurement: Requisitions", module: "procurement", permission: "procurement.requisition", service: RequisitionService, createDto: CreateRequisitionDto, updateDto: UpdateRequisitionDto }),
  createMasterDataController({ path: "procurement/rfqs", tag: "Procurement: RFQs", module: "procurement", permission: "procurement.rfq", service: RfqService, createDto: CreateRfqDto, updateDto: UpdateRfqDto }),
  createMasterDataController({ path: "procurement/orders", tag: "Procurement: Purchase orders", module: "procurement", permission: "procurement.order", service: PurchaseOrderService, createDto: CreatePurchaseOrderDto, updateDto: UpdatePurchaseOrderDto }),
  createMasterDataController({ path: "procurement/receipts", tag: "Procurement: Goods receipts", module: "procurement", permission: "procurement.receipt", service: GoodsReceiptService, createDto: CreateReceiptDto, updateDto: UpdateReceiptDto }),
  createMasterDataController({ path: "procurement/returns", tag: "Procurement: Supplier returns", module: "procurement", permission: "procurement.receipt", service: SupplierReturnService, createDto: CreateSupplierReturnDto, updateDto: UpdateSupplierReturnDto }),
];

const SERVICES = [ProcurementAnalyticsService, SupplierService, RequisitionService, PurchaseOrderService, RfqService, GoodsReceiptService, SupplierReturnService];

@Module({
  imports: [OrgModule, ProductsModule, InventoryModule, SalesModule, FinanceModule],
  controllers: [ProcurementActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class ProcurementModule {}
