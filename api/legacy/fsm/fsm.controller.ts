import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanyId } from '../common/decorators/company.decorator';
import { FsmService } from './fsm.service';
import {
  CreateTechnicianDto,
  CreateServiceContractDto,
  CreateServiceOrderDto,
  AssignServiceOrderDto,
  CompleteServiceOrderDto,
  AddServiceOrderNoteDto,
} from './dto/create-fsm.dto';

@ApiTags('FSM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('fsm')
export class FsmController {
  constructor(private service: FsmService) {}

  @Get('dashboard')
  dashboard(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getDashboard(tenantId, companyId);
  }

  // Technicians
  @Get('technicians')
  getTechnicians(@CurrentUser('tenantId') tenantId: string, @CompanyId() companyId: string) {
    return this.service.getTechnicians(tenantId, companyId);
  }

  @Post('technicians')
  createTechnician(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateTechnicianDto,
  ) {
    return this.service.createTechnician(tenantId, companyId, dto);
  }

  @Post('technicians/:id/status')
  updateTechnicianStatus(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.service.updateTechnicianStatus(tenantId, companyId, id, status);
  }

  // Service Contracts
  @Get('contracts')
  getServiceContracts(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query() q: any,
  ) {
    return this.service.getServiceContracts(tenantId, companyId, {
      status: q.status,
      customerId: q.customerId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Post('contracts')
  createServiceContract(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateServiceContractDto,
  ) {
    return this.service.createServiceContract(tenantId, companyId, dto);
  }

  // Service Orders
  @Get('orders')
  getServiceOrders(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Query() q: any,
  ) {
    return this.service.getServiceOrders(tenantId, companyId, {
      status: q.status,
      technicianId: q.technicianId,
      type: q.type,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25,
    });
  }

  @Get('orders/:id')
  getServiceOrder(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.getServiceOrder(tenantId, companyId, id);
  }

  @Post('orders')
  createServiceOrder(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Body() dto: CreateServiceOrderDto,
  ) {
    return this.service.createServiceOrder(tenantId, companyId, dto);
  }

  @Post('orders/:id/assign')
  assignServiceOrder(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: AssignServiceOrderDto,
  ) {
    return this.service.assignServiceOrder(tenantId, companyId, id, dto);
  }

  @Post('orders/:id/start')
  startServiceOrder(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.startServiceOrder(tenantId, companyId, id);
  }

  @Post('orders/:id/complete')
  completeServiceOrder(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: CompleteServiceOrderDto,
  ) {
    return this.service.completeServiceOrder(tenantId, companyId, id, dto);
  }

  @Post('orders/:id/notes')
  addNote(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AddServiceOrderNoteDto,
  ) {
    return this.service.addNote(tenantId, companyId, userId, id, dto);
  }
}
