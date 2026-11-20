import { BadRequestException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { hasPermission, RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { EmployeeService } from "../hr/hr.services.js";
import { ShiftAssignmentService } from "../hr/hr-shifts.services.js";
import { LeaveRequestService } from "../hr/hr-leave.services.js";
import { TaskService } from "../tasks/tasks.services.js";
import { MilestoneService } from "../projects/projects.services.js";
import { CreateCalendarEventDto, UpdateCalendarEventDto } from "./calendar.dto.js";
import { Attendee, CALENDAR_COLLECTIONS, CalendarEventDoc, CalendarItem, Recurrence } from "./calendar.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

/** Concrete occurrences of one event within [from, to]; capped at 366 steps so a bad rule can't loop forever. */
function expandOccurrences(event: CalendarEventDoc, from: string, to: string): { start: string; end: string }[] {
  const rangeStart = Date.parse(`${from}T00:00:00.000Z`);
  const rangeEnd = Date.parse(`${to}T23:59:59.999Z`);
  const durationMs = Date.parse(event.endAt) - Date.parse(event.startAt);
  if (!event.recurrence) {
    return Date.parse(event.startAt) <= rangeEnd && Date.parse(event.endAt) >= rangeStart ? [{ start: event.startAt, end: event.endAt }] : [];
  }
  const untilMs = event.recurrence.until ? Date.parse(`${event.recurrence.until}T23:59:59.999Z`) : Infinity;
  const occurrences: { start: string; end: string }[] = [];
  let start = Date.parse(event.startAt);
  for (let i = 0; i < 366 && start <= rangeEnd && start <= untilMs; i++) {
    const end = start + durationMs;
    if (end >= rangeStart) occurrences.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    start = step(start, event.recurrence);
  }
  return occurrences;
}

function step(ms: number, recurrence: Recurrence): number {
  if (recurrence.frequency === "daily") return ms + 86_400_000 * recurrence.interval;
  if (recurrence.frequency === "weekly") return ms + 7 * 86_400_000 * recurrence.interval;
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + recurrence.interval);
  return d.getTime();
}

@Injectable()
export class CalendarEventService extends MasterDataService<CalendarEventDoc, CreateCalendarEventDto, UpdateCalendarEventDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, { module: "calendar", entity: "event", label: "Event", collection: CALENDAR_COLLECTIONS.events, route: "/calendar/events", customFields: false });
  }

  protected toNew(dto: CreateCalendarEventDto, ctx: RequestContext): NewDoc<CalendarEventDoc> {
    const attendees: Attendee[] = (dto.attendeeIds ?? []).map((userId) => ({ userId, status: "invited" }));
    return {
      title: dto.title, description: orNull(dto.description), startAt: dto.startAt, endAt: dto.endAt, allDay: dto.allDay ?? false, location: orNull(dto.location),
      organizerId: ctx.userId, attendees, projectId: orNull(dto.projectId),
      recurrence: dto.recurrence ? { frequency: dto.recurrence.frequency, interval: dto.recurrence.interval ?? 1, until: dto.recurrence.until ?? null } : null,
      reminderMinutesBefore: dto.reminderMinutesBefore ?? null, visibility: dto.visibility ?? "company", status: "scheduled", notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateCalendarEventDto): Patch<CalendarEventDoc> {
    const { attendeeIds, recurrence, ...rest } = dto;
    const patch = { ...rest } as Patch<CalendarEventDoc>;
    if (attendeeIds !== undefined) Object.assign(patch, { attendees: attendeeIds.map((userId) => ({ userId, status: "invited" }) as Attendee) });
    if (recurrence !== undefined) Object.assign(patch, { recurrence: recurrence ? { frequency: recurrence.frequency, interval: recurrence.interval ?? 1, until: recurrence.until ?? null } : null });
    return patch;
  }

  async rsvp(ctx: RequestContext, id: string, userId: string, status: Attendee["status"]): Promise<CalendarEventDoc> {
    const before = await this.repo.get(ctx, id);
    if (!before.attendees.some((a) => a.userId === userId)) throw new BadRequestException("You are not invited to this event");
    const attendees = before.attendees.map((a) => (a.userId === userId ? { ...a, status } : a));
    return (await this.repo.update(ctx, id, { attendees } as Patch<CalendarEventDoc>)).after;
  }

  async cancel(ctx: RequestContext, id: string): Promise<CalendarEventDoc> {
    return (await this.repo.update(ctx, id, { status: "cancelled" } as Patch<CalendarEventDoc>)).after;
  }

  /** Every occurrence in range that isn't cancelled, optionally restricted to events I organise or attend. */
  async occurrencesInRange(ctx: RequestContext, from: string, to: string, userId?: string): Promise<{ event: CalendarEventDoc; start: string; end: string }[]> {
    const all = await this.loadAll(ctx);
    const out: { event: CalendarEventDoc; start: string; end: string }[] = [];
    for (const event of all) {
      if (event.status === "cancelled") continue;
      if (userId && event.organizerId !== userId && !event.attendees.some((a) => a.userId === userId)) continue;
      for (const occ of expandOccurrences(event, from, to)) out.push({ event, ...occ });
    }
    return out;
  }

  protected searchEntry(doc: CalendarEventDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.title, subtitle: doc.location };
  }
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly events: CalendarEventService,
    private readonly employees: EmployeeService,
    private readonly shiftAssignments: ShiftAssignmentService,
    private readonly leaveRequests: LeaveRequestService,
    private readonly tasks: TaskService,
    private readonly milestones: MilestoneService,
  ) {}

  private eventItems(occurrences: { event: CalendarEventDoc; start: string; end: string }[]): CalendarItem[] {
    return occurrences.map(({ event, start, end }) => ({ type: "event", id: event.id, title: event.title, start, end, allDay: event.allDay, status: event.status }));
  }

  /** My own: events I organise or attend, my shifts, my approved leave, my tasks due in range. */
  async mine(ctx: RequestContext, from: string, to: string): Promise<CalendarItem[]> {
    const employee = await this.employees.findByUserId(ctx, ctx.userId);
    const [eventOccurrences, shifts, leave, tasks] = await Promise.all([
      this.events.occurrencesInRange(ctx, from, to, ctx.userId),
      employee ? this.shiftAssignments.mySchedule(ctx, employee.id, from, to) : Promise.resolve([]),
      employee ? this.leaveRequests.list(ctx, { where: `employeeId:${employee.id}`, limit: 200 }) : Promise.resolve({ items: [] }),
      this.tasks.forUser(ctx, ctx.userId),
    ]);
    const items = this.eventItems(eventOccurrences);
    for (const s of shifts) items.push({ type: "shift", id: s.id, title: `Shift ${s.startTime}–${s.endTime}`, start: `${s.date}T${s.startTime}:00.000Z`, end: `${s.date}T${s.endTime}:00.000Z`, allDay: false, status: s.status });
    for (const l of leave.items.filter((r) => r.status === "approved" && r.startDate <= to && r.endDate >= from)) items.push({ type: "leave", id: l.id, title: "Leave", start: l.startDate, end: l.endDate, allDay: true, status: l.status });
    for (const t of tasks.filter((x) => x.dueDate && x.dueDate >= from && x.dueDate <= to)) items.push({ type: "task", id: t.id, title: t.title, start: t.dueDate!, end: t.dueDate!, allDay: true, status: t.status });
    return items.sort((a, b) => a.start.localeCompare(b.start));
  }

  /** The shared company calendar: every event, plus shifts/leave/milestones for whoever holds the matching view permission. */
  async company(ctx: RequestContext, from: string, to: string): Promise<CalendarItem[]> {
    const items = this.eventItems(await this.events.occurrencesInRange(ctx, from, to));
    if (hasPermission(ctx, "hr.shiftAssignment.view")) {
      for (const s of await this.shiftAssignments.calendar(ctx, from, to)) items.push({ type: "shift", id: s.id, title: `Shift ${s.startTime}–${s.endTime}`, start: `${s.date}T${s.startTime}:00.000Z`, end: `${s.date}T${s.endTime}:00.000Z`, allDay: false, status: s.status });
    }
    if (hasPermission(ctx, "hr.leaveRequest.view")) {
      for (const l of await this.leaveRequests.calendar(ctx, from, to)) items.push({ type: "leave", id: l.id, title: "Leave", start: l.startDate, end: l.endDate, allDay: true, status: l.status });
    }
    if (hasPermission(ctx, "projects.milestone.view")) {
      for (const m of await this.milestones.dueInRange(ctx, from, to)) items.push({ type: "milestone", id: m.id, title: m.name, start: m.dueDate!, end: m.dueDate!, allDay: true, status: m.status });
    }
    return items.sort((a, b) => a.start.localeCompare(b.start));
  }
}
