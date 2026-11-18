import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanyId } from '../common/decorators/company.decorator';
import { SalesService } from './sales.service';
import { CreatePriceListDto, CreateQuoteDto, CreateSalesOrderDto, CreateDeliveryDto } from './dto/create-sales.dto';

@ApiTags('Sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private service: SalesService) {}

  @Get('dashboard')
  dashboard(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getDashboard(tenantId, companyId);
  }

  // Price Lists
  @Get('price-lists')
  getPriceLists(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getPriceLists(tenantId, companyId);
  }

  @Get('price-lists/:id')
  getPriceList(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getPriceList(tenantId, companyId, id);
  }

  @Post('price-lists')
  createPriceList(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Body() dto: CreatePriceListDto) {
    return this.service.createPriceList(tenantId, companyId, dto);
  }

  // Quotes
  @Get('quotes')
  getQuotes(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getQuotes(tenantId, companyId, {
      status: q.status, customerId: q.customerId, page: Number(q.page) || 1, limit: Number(q.limit) || 25,
    });
  }

  @Get('quotes/:id')
  getQuote(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getQuote(tenantId, companyId, id);
  }

  @Post('quotes')
  createQuote(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateQuoteDto) {
    return this.service.createQuote(tenantId, companyId, userId, dto);
  }

  @Post('quotes/:id/approve')
  approveQuote(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.approveQuote(tenantId, companyId, userId, id);
  }

  @Post('quotes/:id/convert')
  convertQuote(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body('orderNumber') orderNumber: string,
  ) {
    return this.service.convertQuoteToOrder(tenantId, companyId, userId, id, orderNumber);
  }

  // Sales Orders
  @Get('orders')
  getOrders(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getOrders(tenantId, companyId, {
      status: q.status, customerId: q.customerId, page: Number(q.page) || 1, limit: Number(q.limit) || 25,
    });
  }

  @Get('orders/:id')
  getOrder(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getOrder(tenantId, companyId, id);
  }

  @Post('orders')
  createOrder(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateSalesOrderDto) {
    return this.service.createOrder(tenantId, companyId, userId, dto);
  }

  @Post('orders/:id/approve')
  approveOrder(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.approveOrder(tenantId, companyId, userId, id);
  }

  // Deliveries
  @Get('deliveries')
  getDeliveries(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Query() q: any) {
    return this.service.getDeliveries(tenantId, companyId, {
      soId: q.soId, status: q.status, page: Number(q.page) || 1, limit: Number(q.limit) || 25,
    });
  }

  @Get('deliveries/:id')
  getDelivery(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getDelivery(tenantId, companyId, id);
  }

  @Post('deliveries')
  createDelivery(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Body() dto: CreateDeliveryDto) {
    return this.service.createDelivery(tenantId, companyId, userId, dto);
  }

  @Post('deliveries/:id/post')
  postDelivery(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string, @CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.postDelivery(tenantId, companyId, userId, id);
  }
}
