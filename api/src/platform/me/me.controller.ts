import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsOptional, IsString } from "class-validator";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Ctx, RequestContext } from "../context/request-context.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { ApprovalsService } from "../approvals/approvals.service.js";
import { ModulesService } from "../modules/modules.service.js";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { COLLECTIONS } from "../../firestore/collections.js";
import { CompanyUserDoc, UserDoc } from "../../firestore/models.js";

export class NotificationPreferencesDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) inApp?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) email?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) text?: string[];
}

/** The signed-in user's own workspace: notifications and work waiting for them (blueprint §24, §25). */
@ApiTags("Me")
@ApiBearerAuth()
@Controller("me")
export class MeController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly approvals: ApprovalsService,
    private readonly modules: ModulesService,
    private readonly firestore: FirestoreService,
  ) {}

  @Get("directory")
  @ApiOperation({ summary: "Active people of the selected company, for user pickers and mentions" })
  async directory(@Ctx() ctx: RequestContext) {
    const links = await this.firestore.collection<CompanyUserDoc>(COLLECTIONS.companyUsers).where("companyId", "==", ctx.companyId).get();
    const ids = links.docs.map((d) => d.data().userId);
    if (ids.length === 0) return [];
    const users = await this.firestore.db.getAll(...ids.map((id) => this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(id)));
    return users
      .map((u) => u.data() as UserDoc | undefined)
      .filter((u): u is UserDoc => !!u && u.isActive && u.tenantId === ctx.tenantId)
      .map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, avatar: u.avatar }))
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }

  @Get("notifications")
  list(@CurrentUser("id") userId: string, @Query("unread") unread?: string, @Query("limit") limit?: string) {
    return this.notifications.listMine(userId, { unreadOnly: unread === "true", limit: limit ? Number(limit) : undefined });
  }

  @Get("notifications/unread-count")
  async unreadCount(@CurrentUser("id") userId: string) {
    return { count: await this.notifications.unreadCount(userId) };
  }

  @Post("notifications/:id/read")
  @HttpCode(200)
  markRead(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.notifications.markRead(userId, id);
  }

  @Post("notifications/read-all")
  @HttpCode(200)
  markAllRead(@CurrentUser("id") userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Get("notification-preferences")
  preferences(@CurrentUser("id") userId: string) {
    return this.notifications.preferences(userId);
  }

  @Put("notification-preferences")
  setPreferences(@CurrentUser("id") userId: string, @Body() dto: NotificationPreferencesDto) {
    return this.notifications.setPreferences(userId, dto);
  }

  @Get("context")
  @ApiOperation({ summary: "Permissions and enabled modules in the selected company, for showing or hiding UI" })
  async context(@Ctx() ctx: RequestContext) {
    const modules = await this.modules.list(ctx.tenantId);
    return {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      userId: ctx.userId,
      allPermissions: ctx.allPermissions,
      permissions: [...ctx.permissions].sort(),
      modules: modules.filter((m) => m.enabled).map((m) => m.key),
    };
  }

  @Get("work")
  @ApiOperation({ summary: "My Work: approvals waiting for me, my open requests and unread notifications" })
  async work(@Ctx() ctx: RequestContext) {
    const workflowOn = await this.modules.isEnabled(ctx.tenantId, "workflow");
    const [waiting, submitted, unread] = await Promise.all([
      workflowOn ? this.approvals.waitingFor(ctx) : Promise.resolve([]),
      workflowOn ? this.approvals.submittedBy(ctx) : Promise.resolve([]),
      this.notifications.unreadCount(ctx.userId),
    ]);
    return {
      approvalsWaiting: waiting,
      myOpenRequests: submitted.filter((r) => r.status === "pending"),
      unreadNotifications: unread,
    };
  }
}
