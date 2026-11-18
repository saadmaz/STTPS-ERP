import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsOptional, IsString } from "class-validator";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Ctx, RequestContext } from "../context/request-context.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { ApprovalsService } from "../approvals/approvals.service.js";
import { ModulesService } from "../modules/modules.service.js";

export class NotificationPreferencesDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) inApp?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) email?: string[];
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
  ) {}

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
