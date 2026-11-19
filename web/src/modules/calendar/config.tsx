"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDateTime, humanize } from "@/lib/format";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, EmptyState, ErrorState, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";

export interface CalendarItem { type: "event" | "shift" | "leave" | "task" | "milestone"; id: string; title: string; start: string; end: string; allDay: boolean; status: string; }
export interface CalendarEvent extends BaseRecord {
  title: string; description: string | null; startAt: string; endAt: string; allDay: boolean; location: string | null;
  organizerId: string; attendees: { userId: string; status: string }[]; recurrence: { frequency: string; interval: number; until: string | null } | null; status: string;
}

export const calendarApi = {
  events: crud<CalendarEvent>("/calendar/events"),
  mine: (from: string, to: string) => api.get("/calendar/mine", { params: { from, to } }).then((r) => r.data as CalendarItem[]),
  company: (from: string, to: string) => api.get("/calendar", { params: { from, to } }).then((r) => r.data as CalendarItem[]),
  createEvent: (body: object) => api.post("/calendar/events", body).then((r) => r.data as CalendarEvent),
  rsvp: (id: string, status: string) => api.post(`/calendar/events/${id}/rsvp`, { status }).then((r) => r.data as CalendarEvent),
  cancel: (id: string) => api.post(`/calendar/events/${id}/cancel`).then((r) => r.data as CalendarEvent),
};

const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const events: MasterConfig<CalendarEvent> = {
  entityType: "calendar.event",
  permission: "calendar.event",
  plural: "Events",
  singular: "Event",
  description: "Every event and meeting, for administration. Most people use My Calendar instead.",
  route: "/calendar/events",
  client: calendarApi.events,
  defaultSort: "-startAt",
  columns: [
    { key: "title", label: "Title" },
    { key: "startAt", label: "Starts", render: (r) => formatDateTime(r.startAt) },
    { key: "location", label: "Location", render: (r) => r.location ?? "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["scheduled", "cancelled"]) }],
  fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", wide: true },
    { key: "location", label: "Location", type: "text" },
    { key: "allDay", label: "All day", type: "boolean" },
  ],
  title: (r) => r.title,
  subtitle: (r) => formatDateTime(r.startAt),
  status: (r) => r.status,
  details: (r) => [
    { label: "Starts", value: formatDateTime(r.startAt) },
    { label: "Ends", value: formatDateTime(r.endAt) },
    { label: "Attendees", value: r.attendees.map((a) => `${a.userId} (${a.status})`).join(", ") || "None" },
  ],
};

export const CALENDAR_SCREENS: Record<string, MasterConfig<never>> = {
  events: events as unknown as MasterConfig<never>,
};

const TYPE_LABEL: Record<CalendarItem["type"], string> = { event: "Event", shift: "Shift", leave: "Leave", task: "Task", milestone: "Milestone" };

function weekRange(offsetDays = 0): [string, string] {
  const from = new Date(Date.now() + offsetDays * 86400_000);
  const to = new Date(from.getTime() + 13 * 86400_000);
  return [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)];
}

function NewEventDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [attendees, setAttendees] = useState("");
  const run = useMutation({
    mutationFn: () => calendarApi.createEvent({
      title, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(),
      attendeeIds: attendees.split(",").map((s) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => { setOpen(false); setTitle(""); setStartAt(""); setEndAt(""); setAttendees(""); toast.success("Event created"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>New event</button>
      <ConfirmDialog open={open} title="New event" confirmLabel="Create" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Title" required><input className="input-base" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts" required><input type="datetime-local" className="input-base" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></Field>
            <Field label="Ends" required><input type="datetime-local" className="input-base" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></Field>
          </div>
          <Field label="Attendees (user ids, comma-separated)"><input className="input-base" value={attendees} onChange={(e) => setAttendees(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function EventRow({ item, onChanged }: { item: CalendarItem; onChanged: () => void }) {
  const rsvp = useMutation({
    mutationFn: (status: string) => calendarApi.rsvp(item.id, status),
    onSuccess: () => { toast.success("Response sent"); onChanged(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => calendarApi.cancel(item.id),
    onSuccess: () => { toast.success("Event cancelled"); onChanged(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <li className="card p-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{item.title} <span className="text-xs text-slate-500">({TYPE_LABEL[item.type]})</span></p>
        <p className="text-xs text-slate-500">{item.allDay ? formatDateTime(item.start).split(",")[0] : `${formatDateTime(item.start)} – ${formatDateTime(item.end)}`}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <StatusBadge status={item.status} />
        {item.type === "event" && item.status === "scheduled" && (
          <>
            <button className="btn-ghost" disabled={rsvp.isPending} onClick={() => rsvp.mutate("accepted")}>Accept</button>
            <button className="btn-ghost" disabled={rsvp.isPending} onClick={() => rsvp.mutate("declined")}>Decline</button>
            <button className="btn-ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel</button>
          </>
        )}
      </div>
    </li>
  );
}

function AgendaList({ items, onChanged }: { items: CalendarItem[]; onChanged: () => void }) {
  if (items.length === 0) return <EmptyState title="Nothing in this range" />;
  const byDay = new Map<string, CalendarItem[]>();
  for (const i of items) {
    const day = i.start.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), i]);
  }
  return (
    <div className="space-y-4">
      {[...byDay.entries()].map(([day, dayItems]) => (
        <section key={day}>
          <h2 className="text-sm font-semibold text-slate-500 mb-2">{day}</h2>
          <ul className="space-y-2">{dayItems.map((i) => <EventRow key={`${i.type}-${i.id}-${i.start}`} item={i} onChanged={onChanged} />)}</ul>
        </section>
      ))}
    </div>
  );
}

export function MyCalendarPage() {
  const [from, to] = weekRange();
  const q = useQuery({ queryKey: ["calendar-mine", from, to], queryFn: () => calendarApi.mine(from, to) });
  return (
    <div className="space-y-6">
      <PageHeader title="My Calendar" subtitle={`${from} – ${to}: events I organise or attend, my shifts, my approved leave, and my tasks due.`} actions={<NewEventDialog onDone={() => q.refetch()} />} />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : <AgendaList items={q.data!} onChanged={() => q.refetch()} />}
    </div>
  );
}

export function CompanyCalendarPage() {
  const [from, to] = weekRange();
  const q = useQuery({ queryKey: ["calendar-company", from, to], queryFn: () => calendarApi.company(from, to) });
  return (
    <div className="space-y-6">
      <PageHeader title="Company Calendar" subtitle={`${from} – ${to}: every event, plus shifts, leave and milestones if you hold the matching permission.`} actions={<NewEventDialog onDone={() => q.refetch()} />} />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : <AgendaList items={q.data!} onChanged={() => q.refetch()} />}
    </div>
  );
}
