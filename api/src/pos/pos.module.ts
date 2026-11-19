import { Body, Controller, HttpCode, Module, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { SalesModule } from "../sales/sales.module.js";
import { FinanceModule } from "../finance/finance.module.js";
import {
  CloseShiftDto, CreatePosSaleDto, CreateTerminalDto, NoUpdateDto, OpenShiftDto, RefundSaleDto, UpdateTerminalDto,
} from "./pos.dto.js";
import { CashierShiftService, LoyaltyService, PosSaleService, TerminalService } from "./pos.services.js";

@ApiTags("POS")
@ApiBearerAuth()
@RequireModule("pos")
@Controller("pos")
class PosActionsController {
  constructor(
    private readonly shifts: CashierShiftService,
    private readonly sales: PosSaleService,
  ) {}

  @Post("shifts/:id/close")
  @HttpCode(200)
  @RequirePermission("pos.cashierShift.edit")
  @ApiOperation({ summary: "Closes a shift, reconciling counted cash against the opening float plus this shift's net cash sales" })
  async closeShift(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CloseShiftDto)) dto: CloseShiftDto) {
    const sales = await this.sales.repo.all(ctx, { where: [["shiftId", "==", id]] });
    return this.shifts.close(ctx, id, dto, sales);
  }

  @Post("sales/:id/refund")
  @HttpCode(200)
  @RequirePermission("pos.sale.edit")
  @ApiOperation({ summary: "Refunds a whole sale or a chosen subset of its lines" })
  refund(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RefundSaleDto)) dto: RefundSaleDto) {
    return this.sales.refund(ctx, id, dto);
  }

  @Post("sales/:id/void")
  @HttpCode(200)
  @RequirePermission("pos.sale.edit")
  @ApiOperation({ summary: "Fully reverses a sale within its own still-open shift" })
  void_(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.sales.void(ctx, id);
  }
}

const crud = [
  createMasterDataController({ path: "pos/terminals", tag: "POS: Terminals", module: "pos", permission: "pos.terminal", service: TerminalService, createDto: CreateTerminalDto, updateDto: UpdateTerminalDto }),
  createMasterDataController({ path: "pos/shifts", tag: "POS: Cashier shifts", module: "pos", permission: "pos.cashierShift", service: CashierShiftService, createDto: OpenShiftDto, updateDto: NoUpdateDto }),
  createMasterDataController({ path: "pos/sales", tag: "POS: Sales", module: "pos", permission: "pos.sale", service: PosSaleService, createDto: CreatePosSaleDto, updateDto: NoUpdateDto }),
];

const SERVICES = [TerminalService, CashierShiftService, LoyaltyService, PosSaleService];

@Module({
  imports: [InventoryModule, SalesModule, FinanceModule],
  controllers: [PosActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class PosModule {}
