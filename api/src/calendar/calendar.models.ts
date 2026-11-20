import type { BaseDoc } from "../platform/data/repository.js";

export const CALENDAR_COLLECTIONS = {
  events: "calendarEvents",
} as const;

export const EVENT_STATUSES = ["scheduled", "cancelled"] as const;
export const ATTENDEE_STATUSES = ["invited", "accepted", "declined", "tentative"] as const;
export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export const EVENT_VISIBILITIES = ["company", "private"] as const;

export interface Attendee {
  userId: string;
  status: (typeof ATTENDEE_STATUSES)[number];
}

export interface Recurrence {
  frequency: (typeof RECURRENCE_FREQUENCIES)[number];
  interval: number;
  until: string | null;
}

/**
 * A meeting or event (blueprint §26). A recurring event is one document with
 * a rule — occurrences are expanded on the fly for a date range
 * (`expandOccurrences`), not materialised as separate documents the way a
 * recurring task's next occurrence is; an event has no "done" state to
 * trigger that off, so the classic calendar/iCal approach fits better here.
 */
export interface CalendarEventDoc extends BaseDoc {
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string | null;
  organizerId: string;
  attendees: Attendee[];
  /** Optional link to a project, for a project calendar. */
  projectId: string | null;
  recurrence: Recurrence | null;
  reminderMinutesBefore: number | null;
  visibility: (typeof EVENT_VISIBILITIES)[number];
  status: (typeof EVENT_STATUSES)[number];
  notes: string | null;
}

/** One concrete occurrence, after expanding any recurrence rule — what the calendar actually displays. */
export interface CalendarItem {
  type: "event" | "shift" | "leave" | "task" | "milestone";
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  status: string;
}
