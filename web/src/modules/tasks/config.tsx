"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, EmptyState, ErrorState, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";

export interface ChecklistItem { itemId: string; text: string; done: boolean; }
export interface Recurrence { frequency: "daily" | "weekly" | "monthly"; interval: number; until: string | null; }
export interface Task extends BaseRecord {
  title: string; description: string | null; projectId: string | null; ownerId: string; assigneeId: string | null; collaboratorIds: string[];
  priority: "low" | "medium" | "high" | "urgent"; status: "todo" | "in_progress" | "blocked" | "review" | "completed";
  dueDate: string | null; estimatedHours: number | null; actualHours: number; checklist: ChecklistItem[]; tags: string[]; recurrence: Recurrence | null;
}
export interface TimeEntry extends BaseRecord {
  userId: string; taskId: string | null; projectId: string | null; date: string; hours: number; billable: boolean; approved: boolean; cost: number | null; description: string | null;
}

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "review", "completed"] as const;
const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const tasksApi = {
  tasks: crud<Task>("/tasks"),
  timeEntries: crud<TimeEntry>("/tasks/time-entries"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
  mine: () => api.get("/tasks/mine").then((r) => r.data as Task[]),
  myTimeEntries: () => api.get("/tasks/time-entries/mine").then((r) => r.data as { items: TimeEntry[] }),
};

export const tasks: MasterConfig<Task> = {
  entityType: "tasks.task",
  permission: "tasks.allTasks",
  plural: "All tasks",
  singular: "Task",
  description: "Every task in the company. Most people use My Tasks instead; this is for oversight.",
  route: "/tasks/all",
  client: tasksApi.tasks,
  defaultSort: "-createdAt",
  columns: [
    { key: "title", label: "Title" },
    { key: "priority", label: "Priority", render: (r) => humanize(r.priority) },
    { key: "dueDate", label: "Due", render: (r) => (r.dueDate ? formatDate(r.dueDate) : "—") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(TASK_STATUSES) },
    { key: "priority", label: "Priority", options: opts(["low", "medium", "high", "urgent"]) },
  ],
  fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", wide: true },
    { key: "assigneeId", label: "Assignee (user id)", type: "text" },
    { key: "priority", label: "Priority", type: "select", options: opts(["low", "medium", "high", "urgent"]) },
    { key: "dueDate", label: "Due date", type: "date" },
  ],
  defaults: { priority: "medium" },
  title: (r) => r.title,
  subtitle: (r) => humanize(r.priority),
  status: (r) => r.status,
  details: (r) => [
    { label: "Assignee", value: r.assigneeId },
    { label: "Due", value: r.dueDate ? formatDate(r.dueDate) : null },
    { label: "Actual hours", value: `${(r.actualHours / 1000).toFixed(2)}h` },
  ],
};

// ─── My Tasks: Kanban board ──────────────────────────────────────────────────

function TaskStatusPicker({ task, refresh }: { task: Task; refresh: (t: Task) => void }) {
  const run = useMutation({
    mutationFn: (status: Task["status"]) => tasksApi.post<Task>(`/tasks/${task.id}/status`, { status }),
    onSuccess: (updated) => refresh(updated),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <select className="input-base text-xs py-1" value={task.status} disabled={run.isPending} onChange={(e) => run.mutate(e.target.value as Task["status"])}>
      {TASK_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
    </select>
  );
}

function ChecklistEditor({ task, refresh }: { task: Task; refresh: (t: Task) => void }) {
  const [text, setText] = useState("");
  const add = useMutation({
    mutationFn: () => tasksApi.post<Task>(`/tasks/${task.id}/checklist`, { text }),
    onSuccess: (updated) => { setText(""); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: ({ itemId, done }: { itemId: string; done: boolean }) => api.patch(`/api/v1/tasks/${task.id}/checklist/${itemId}`, { done }).then((r) => r.data as Task),
    onSuccess: (updated) => refresh(updated),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-1 mt-2">
      {task.checklist.map((i) => (
        <label key={i.itemId} className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={i.done} onChange={(e) => toggle.mutate({ itemId: i.itemId, done: e.target.checked })} />
          <span className={i.done ? "line-through text-slate-400" : ""}>{i.text}</span>
        </label>
      ))}
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(); }}>
        <input className="input-base text-xs py-1" placeholder="Add item…" value={text} onChange={(e) => setText(e.target.value)} />
      </form>
    </div>
  );
}

function NewTaskDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const run = useMutation({
    mutationFn: () => tasksApi.tasks.create({ title, assigneeId: undefined, dueDate: dueDate || undefined }),
    onSuccess: () => { setOpen(false); setTitle(""); setDueDate(""); toast.success("Task created"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>New task</button>
      <ConfirmDialog open={open} title="New task" confirmLabel="Create" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Title" required><input className="input-base" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Due date"><input type="date" className="input-base" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

export function MyTasksBoard() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["tasks-mine"], queryFn: tasksApi.mine });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tasks-mine"] });
  if (q.isLoading) return <div className="p-6"><Spinner /></div>;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const rows = q.data!;

  return (
    <div className="space-y-6">
      <PageHeader title="My Tasks" subtitle="Tasks assigned to me, and tasks I'm a collaborator on." actions={<NewTaskDialog onDone={refresh} />} />
      {rows.length === 0 ? <EmptyState title="No tasks yet" /> : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {TASK_STATUSES.map((status) => {
            const items = rows.filter((t) => t.status === status);
            return (
              <section key={status} className="w-72 shrink-0">
                <h2 className="text-sm font-semibold px-1 mb-2">{humanize(status)} <span className="text-slate-400 font-normal">{items.length}</span></h2>
                <ul className="space-y-2">
                  {items.map((t) => (
                    <li key={t.id} className="card p-3">
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{humanize(t.priority)}{t.dueDate ? ` · Due ${formatDate(t.dueDate)}` : ""}{t.recurrence ? " · Recurring" : ""}</p>
                      <div className="mt-2"><TaskStatusPicker task={t} refresh={() => refresh()} /></div>
                      <ChecklistEditor task={t} refresh={() => refresh()} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── My time entries ─────────────────────────────────────────────────────────

function LogTimeDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("1");
  const [description, setDescription] = useState("");
  const run = useMutation({
    mutationFn: () => tasksApi.timeEntries.create({ date, hours, description: description || undefined }),
    onSuccess: () => { setOpen(false); setDescription(""); toast.success("Time logged"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Log time</button>
      <ConfirmDialog open={open} title="Log time" confirmLabel="Save" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Date" required><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Hours" required><input className="input-base" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
          <Field label="Description"><textarea className="input-base" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

export function MyTimeEntriesPage() {
  const q = useQuery({ queryKey: ["tasks-my-time"], queryFn: tasksApi.myTimeEntries });
  const refresh = () => q.refetch();
  return (
    <div className="space-y-6">
      <PageHeader title="My Timesheet" actions={<LogTimeDialog onDone={refresh} />} />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message={errorMessage(q.error)} /> : (
        <section className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Date</th><th>Hours</th><th>Billable</th><th>Status</th></tr></thead>
            <tbody>
              {q.data!.items.map((e) => (
                <tr key={e.id}><td>{formatDate(e.date)}</td><td>{(e.hours / 1000).toFixed(2)}</td><td>{e.billable ? "Yes" : "No"}</td><td><StatusBadge status={e.approved ? "approved" : "pending"} /></td></tr>
              ))}
              {q.data!.items.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-6">No time logged yet.</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export const TASKS_SCREENS: Record<string, MasterConfig<never>> = {
  all: tasks as unknown as MasterConfig<never>,
};
