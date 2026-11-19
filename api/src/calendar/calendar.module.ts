import { Body, Controller, Get, HttpCode, Module, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { HrModule } from "../hr/hr.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { CalendarEventService, CalendarService } from "./calendar.services.js";
import { CreateCalendarEventDto, RsvpDto, UpdateCalendarEventDto } from "./calendar.dto.js";

@ApiTags("Calendar")
@ApiBearerAuth()
@RequireModule("calendar")
@Controller("calendar")
class CalendarActionsController {
  constructor(private readonly calendar: CalendarService, private readonly events: CalendarEventService) {}

  @Get("mine")
  @ApiOperation({ summary: "My calendar: events I organise or attend, my shifts, my approved leave, my tasks due" })
  mine(@Ctx() ctx: RequestContext, @Query("from") from: string, @Query("to") to: string) {
    return this.calendar.mine(ctx, from, to);
  }

  @Get()
  @ApiOperation({ summary: "The shared company calendar; shifts, leave and milestones show only with the matching view permission" })
  company(@Ctx() ctx: RequestContext, @Query("from") from: string, @Query("to") to: string) {
    return this.calendar.company(ctx, from, to);
  }

  @Post("events/:id/rsvp")
  @HttpCode(200)
  @ApiOperation({ summary: "Responds to an invitation" })
  rsvp(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(RsvpDto)) dto: RsvpDto) {
    return this.events.rsvp(ctx, id, ctx.userId, dto.status);
  }

  @Post("events/:id/cancel")
  @HttpCode(200)
  @RequirePermission("calendar.event.edit")
  cancel(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.events.cancel(ctx, id);
  }
}

const crud = [
  createMasterDataController({ path: "calendar/events", tag: "Calendar", module: "calendar", permission: "calendar.event", service: CalendarEventService, createDto: CreateCalendarEventDto, updateDto: UpdateCalendarEventDto }),
];

const SERVICES = [CalendarEventService, CalendarService];

@Module({
  imports: [HrModule, TasksModule, ProjectsModule],
  controllers: [CalendarActionsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class CalendarModule {}
