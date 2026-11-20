import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Injectable, Module, Param, Post, Query, UnauthorizedException, UseGuards } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtService } from "@nestjs/jwt";
import { Public } from "../common/decorators/public.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext, systemContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { ListQueryDto } from "../platform/crud/list-query.dto.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { AuthModule } from "../auth/auth.module.js";
import {
  AssignTicketDto,
  CreatePortalUserDto,
  CreateSlaPolicyDto,
  CreateTicketDto,
  EscalateDto,
  MergeTicketDto,
  PortalChangePasswordDto,
  PortalLoginDto,
  PortalSetPasswordDto,
  RateSatisfactionDto,
  ReplyDto,
  SelfCreateTicketDto,
  SetTicketStatusDto,
  UpdateSlaPolicyDto,
  UpdateTicketDto,
} from "./support.dto.js";
import { PortalAuthService, PortalContext, PortalUserService, SlaPolicyService, TicketService } from "./support.services.js";

/**
 * Verifies a customer portal bearer token (its own `scope: "portal"` claim —
 * rejected by the staff `JwtStrategy`) and attaches `request.portalCtx`.
 * Portal routes carry no `@RequireModule`/`@RequirePermission`, so the four
 * global guards no-op and this is the only check that runs on them.
 */
@Injectable()
class PortalAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException("Sign in to the portal");
    let payload: { sub: string; scope?: string; tenantId: string; companyId: string; customerId: string };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException("Your session expired; sign in again");
    }
    if (payload.scope !== "portal") throw new UnauthorizedException("Not a portal access token");
    request.portalCtx = { portalUserId: payload.sub, tenantId: payload.tenantId, companyId: payload.companyId, customerId: payload.customerId } satisfies PortalContext;
    return true;
  }
}

const PortalCtx = createParamDecorator((_data: unknown, context: ExecutionContext): PortalContext => {
  return context.switchToHttp().getRequest().portalCtx as PortalContext;
});

const portalScope = (p: PortalContext): RequestContext => systemContext({ tenantId: p.tenantId, companyId: p.companyId }, p.portalUserId);

@ApiTags("Support: Tickets")
@ApiBearerAuth()
@RequireModule("support")
@Controller("support/tickets")
class SupportActionsController {
  constructor(private readonly tickets: TicketService) {}

  @Post(":id/assign")
  @HttpCode(200)
  @RequirePermission("support.ticket.edit")
  @ApiOperation({ summary: "Assigns the ticket to a staff member" })
  assign(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(AssignTicketDto)) dto: AssignTicketDto) {
    return this.tickets.assign(ctx, id, dto);
  }

  @Post(":id/reply")
  @HttpCode(200)
  @RequirePermission("support.ticket.edit")
  @ApiOperation({ summary: "Adds a customer-visible reply" })
  reply(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ReplyDto)) dto: ReplyDto) {
    return this.tickets.reply(ctx, id, "staff", ctx.userId, dto.body);
  }

  @Post(":id/status")
  @HttpCode(200)
  @RequirePermission("support.ticket.edit")
  @ApiOperation({ summary: "Moves the ticket to open, waiting-on-customer, resolved or closed" })
  setStatus(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(SetTicketStatusDto)) dto: SetTicketStatusDto) {
    return this.tickets.setStatus(ctx, id, dto.status);
  }

  @Post(":id/escalate")
  @HttpCode(200)
  @RequirePermission("support.ticket.manage")
  @ApiOperation({ summary: "Raises the priority and reassigns" })
  escalate(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(EscalateDto)) dto: EscalateDto) {
    return this.tickets.escalate(ctx, id, dto);
  }

  @Post(":id/merge")
  @HttpCode(200)
  @RequirePermission("support.ticket.manage")
  @ApiOperation({ summary: "Closes this ticket into another" })
  merge(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(MergeTicketDto)) dto: MergeTicketDto) {
    return this.tickets.merge(ctx, id, dto);
  }

  @Post(":id/reopen")
  @HttpCode(200)
  @RequirePermission("support.ticket.edit")
  @ApiOperation({ summary: "Reopens a resolved or closed ticket" })
  reopen(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.tickets.reopen(ctx, id, null);
  }
}

@ApiTags("Support: Portal users")
@ApiBearerAuth()
@RequireModule("support")
@Controller("support/portal-users")
class PortalUserAdminController {
  constructor(private readonly portalUsers: PortalUserService) {}

  @Get()
  @RequirePermission("support.portalUser.view")
  @ApiOperation({ summary: "List" })
  list(@Ctx() ctx: RequestContext, @Query(validated(ListQueryDto)) query: ListQueryDto) {
    return this.portalUsers.list(ctx, query);
  }

  @Get(":id")
  @RequirePermission("support.portalUser.view")
  @ApiOperation({ summary: "Get one" })
  get(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.portalUsers.get(ctx, id);
  }

  @Post()
  @RequirePermission("support.portalUser.create")
  @ApiOperation({ summary: "Creates a customer login and a one-time setup link (returned once; hand it to the customer out of band)" })
  provision(@Ctx() ctx: RequestContext, @Body(validated(CreatePortalUserDto)) dto: CreatePortalUserDto) {
    return this.portalUsers.provision(ctx, dto);
  }

  @Post(":id/reissue-setup-token")
  @HttpCode(200)
  @RequirePermission("support.portalUser.edit")
  @ApiOperation({ summary: "A new one-time link, for a lost invite or a forgotten password" })
  reissue(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.portalUsers.reissueSetupToken(ctx, id).then((setupToken) => ({ setupToken }));
  }

  @Post(":id/deactivate")
  @HttpCode(200)
  @RequirePermission("support.portalUser.delete")
  @ApiOperation({ summary: "Deactivates the login" })
  deactivate(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.portalUsers.deactivate(ctx, id);
  }

  @Post(":id/reactivate")
  @HttpCode(200)
  @RequirePermission("support.portalUser.delete")
  @ApiOperation({ summary: "Reactivates the login" })
  reactivate(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.portalUsers.reactivate(ctx, id);
  }
}

@ApiTags("Customer portal")
@Public()
@Controller("portal/auth")
class PortalAuthController {
  constructor(private readonly portalAuth: PortalAuthService) {}

  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Customer portal sign-in" })
  login(@Body(validated(PortalLoginDto)) dto: PortalLoginDto) {
    return this.portalAuth.login(dto);
  }

  @Post("set-password")
  @HttpCode(200)
  @ApiOperation({ summary: "Sets a password from a one-time setup or reset link" })
  setPassword(@Body(validated(PortalSetPasswordDto)) dto: PortalSetPasswordDto) {
    return this.portalAuth.setPassword(dto);
  }
}

@ApiTags("Customer portal")
@ApiBearerAuth()
@Public()
@UseGuards(PortalAuthGuard)
@Controller("portal")
class PortalController {
  constructor(
    private readonly portalAuth: PortalAuthService,
    private readonly tickets: TicketService,
  ) {}

  @Post("auth/change-password")
  @HttpCode(200)
  @ApiOperation({ summary: "Changes the signed-in customer's password" })
  changePassword(@PortalCtx() portal: PortalContext, @Body(validated(PortalChangePasswordDto)) dto: PortalChangePasswordDto) {
    return this.portalAuth.changePassword(portal, dto);
  }

  @Get("tickets")
  @ApiOperation({ summary: "My tickets" })
  myTickets(@PortalCtx() portal: PortalContext) {
    return this.tickets.forCustomer(portalScope(portal), portal.customerId);
  }

  @Get("tickets/:id")
  @ApiOperation({ summary: "Get one of my tickets" })
  getTicket(@PortalCtx() portal: PortalContext, @Param("id") id: string) {
    return this.tickets.getOwn(portalScope(portal), id, portal.customerId);
  }

  @Post("tickets")
  @ApiOperation({ summary: "Opens a new ticket" })
  createTicket(@PortalCtx() portal: PortalContext, @Body(validated(SelfCreateTicketDto)) dto: SelfCreateTicketDto) {
    return this.tickets.create(portalScope(portal), { ...dto, customerId: portal.customerId, channel: "portal" } as CreateTicketDto);
  }

  @Post("tickets/:id/reply")
  @HttpCode(200)
  @ApiOperation({ summary: "Replies to one of my tickets" })
  async reply(@PortalCtx() portal: PortalContext, @Param("id") id: string, @Body(validated(ReplyDto)) dto: ReplyDto) {
    await this.tickets.getOwn(portalScope(portal), id, portal.customerId);
    return this.tickets.reply(portalScope(portal), id, "customer", portal.portalUserId, dto.body);
  }

  @Post("tickets/:id/reopen")
  @HttpCode(200)
  @ApiOperation({ summary: "Reopens one of my resolved or closed tickets" })
  reopen(@PortalCtx() portal: PortalContext, @Param("id") id: string) {
    return this.tickets.reopen(portalScope(portal), id, portal.customerId);
  }

  @Post("tickets/:id/rate")
  @HttpCode(200)
  @ApiOperation({ summary: "Rates satisfaction on a resolved or closed ticket" })
  rate(@PortalCtx() portal: PortalContext, @Param("id") id: string, @Body(validated(RateSatisfactionDto)) dto: RateSatisfactionDto) {
    return this.tickets.rate(portalScope(portal), id, portal.customerId, dto);
  }
}

const crud = [
  createMasterDataController({ path: "support/sla-policies", tag: "Support: SLA policies", module: "support", permission: "support.slaPolicy", service: SlaPolicyService, createDto: CreateSlaPolicyDto, updateDto: UpdateSlaPolicyDto }),
  createMasterDataController({ path: "support/tickets", tag: "Support: Tickets", module: "support", permission: "support.ticket", service: TicketService, createDto: CreateTicketDto, updateDto: UpdateTicketDto }),
];

const SERVICES = [SlaPolicyService, TicketService, PortalUserService, PortalAuthService, PortalAuthGuard];

@Module({
  imports: [AuthModule],
  controllers: [SupportActionsController, PortalUserAdminController, PortalAuthController, PortalController, ...crud],
  providers: SERVICES,
  exports: [TicketService, SlaPolicyService, PortalUserService],
})
export class SupportModule {}
