import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Module, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, hasPermission, RequestContext } from "../platform/context/request-context.js";
import { validated } from "../platform/crud/master-data.controller.js";
import { ListQueryDto } from "../platform/crud/list-query.dto.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { TaskService, TimeEntryService } from "./tasks.services.js";
import {
  ApproveTimeEntryDto,
  ChecklistItemInputDto,
  CreateTaskDto,
  SelfTimeEntryDto,
  SetChecklistItemDto,
  SetTaskStatusDto,
  UpdateTaskDto,
} from "./tasks.dto.js";
import { TaskDoc } from "./tasks.models.js";

/** Tasks have no per-entity permission model: anyone in the module can view, and may act on their own (owner, assignee or collaborator) or with `tasks.allTasks.view`. */
function canTouch(ctx: RequestContext, task: TaskDoc): boolean {
  return ctx.allPermissions || hasPermission(ctx, "tasks.allTasks.view") || task.ownerId === ctx.userId || task.assigneeId === ctx.userId || task.collaboratorIds.includes(ctx.userId);
}

@ApiTags("Tasks")
@ApiBearerAuth()
@RequireModule("projects")
@Controller("tasks")
class TaskActionsController {
  constructor(private readonly tasks: TaskService) {}

  @Get("mine")
  @ApiOperation({ summary: "My own tasks, and tasks I'm a collaborator on" })
  myTasks(@Ctx() ctx: RequestContext) {
    return this.tasks.forUser(ctx, ctx.userId);
  }

  @Get()
  @RequirePermission("tasks.allTasks.view")
  @ApiOperation({ summary: "Every task in the company" })
  list(@Ctx() ctx: RequestContext, @Query(validated(ListQueryDto)) query: ListQueryDto) {
    return this.tasks.list(ctx, query);
  }

  @Get("project/:projectId")
  @ApiOperation({ summary: "A project's tasks" })
  forProject(@Ctx() ctx: RequestContext, @Param("projectId") projectId: string) {
    return this.tasks.forProject(ctx, projectId);
  }

  @Get(":id")
  get(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.tasks.get(ctx, id);
  }

  @Get(":id/subtasks")
  subtasks(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.tasks.subtasksOf(ctx, id);
  }

  @Get(":id/history")
  history(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.tasks.history(ctx, id);
  }

  @Post()
  @ApiOperation({ summary: "Creates a task for myself or someone else" })
  create(@Ctx() ctx: RequestContext, @Body(validated(CreateTaskDto)) dto: CreateTaskDto) {
    return this.tasks.create(ctx, dto);
  }

  private async guarded(ctx: RequestContext, id: string) {
    const task = await this.tasks.get(ctx, id);
    if (!canTouch(ctx, task)) throw new ForbiddenException("Only the owner, assignee or a collaborator can change this task");
    return task;
  }

  @Patch(":id")
  async update(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(UpdateTaskDto)) dto: UpdateTaskDto) {
    await this.guarded(ctx, id);
    return this.tasks.update(ctx, id, dto);
  }

  @Post(":id/status")
  @HttpCode(200)
  async setStatus(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(SetTaskStatusDto)) dto: SetTaskStatusDto) {
    await this.guarded(ctx, id);
    return this.tasks.setStatus(ctx, id, dto.status);
  }

  @Post(":id/checklist")
  @HttpCode(201)
  async addChecklistItem(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ChecklistItemInputDto)) dto: ChecklistItemInputDto) {
    await this.guarded(ctx, id);
    return this.tasks.addChecklistItem(ctx, id, dto.text);
  }

  @Patch(":id/checklist/:itemId")
  async setChecklistItem(@Ctx() ctx: RequestContext, @Param("id") id: string, @Param("itemId") itemId: string, @Body(validated(SetChecklistItemDto)) dto: SetChecklistItemDto) {
    await this.guarded(ctx, id);
    return this.tasks.setChecklistItem(ctx, id, itemId, dto.done);
  }

  @Post(":id/archive")
  @HttpCode(200)
  async archive(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await this.guarded(ctx, id);
    return this.tasks.archive(ctx, id);
  }

  @Post(":id/restore")
  @HttpCode(200)
  async restore(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await this.guarded(ctx, id);
    return this.tasks.restore(ctx, id);
  }
}

@ApiTags("Tasks")
@ApiBearerAuth()
@RequireModule("projects")
@Controller("tasks/time-entries")
class TimeEntryActionsController {
  constructor(private readonly timeEntries: TimeEntryService) {}

  @Get("mine")
  @ApiOperation({ summary: "My own time entries" })
  mine(@Ctx() ctx: RequestContext) {
    return this.timeEntries.forUser(ctx, ctx.userId);
  }

  @Get()
  @RequirePermission("tasks.allTasks.view")
  list(@Ctx() ctx: RequestContext, @Query(validated(ListQueryDto)) query: ListQueryDto) {
    return this.timeEntries.list(ctx, query);
  }

  @Get("project/:projectId")
  forProject(@Ctx() ctx: RequestContext, @Param("projectId") projectId: string) {
    return this.timeEntries.forProject(ctx, projectId);
  }

  @Post()
  @ApiOperation({ summary: "Logs time against a task, a project, or neither" })
  log(@Ctx() ctx: RequestContext, @Body(validated(SelfTimeEntryDto)) dto: SelfTimeEntryDto) {
    return this.timeEntries.create(ctx, { ...dto, userId: ctx.userId });
  }

  @Patch(":id")
  async update(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(SelfTimeEntryDto)) dto: SelfTimeEntryDto) {
    const before = await this.timeEntries.get(ctx, id);
    if (before.userId !== ctx.userId && !hasPermission(ctx, "tasks.allTasks.view") && !ctx.allPermissions) throw new ForbiddenException("This is not your time entry");
    if (before.approved) throw new BadRequestException("An approved time entry cannot be changed");
    return this.timeEntries.update(ctx, id, dto);
  }

  @Post(":id/approve")
  @HttpCode(200)
  @RequirePermission("tasks.timeEntry.approve")
  approve(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ApproveTimeEntryDto)) dto: ApproveTimeEntryDto) {
    return this.timeEntries.approve(ctx, id, dto.approve);
  }
}

const SERVICES = [TaskService, TimeEntryService];

@Module({
  controllers: [TaskActionsController, TimeEntryActionsController],
  providers: SERVICES,
  exports: SERVICES,
})
export class TasksModule {}
