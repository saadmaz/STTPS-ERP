"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDateTime, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";
import { crmApi } from "@/modules/crm/config";

export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TICKET_STATUSES = ["new", "open", "assigned", "in_progress", "waiting_customer", "resolved", "closed"] as const;

export interface SlaTarget {
  priority: (typeof TICKET_PRIORITIES)[number];
  responseMinutes: number;
  resolutionMinutes: number;
}
export interface SlaPolicy extends BaseRecord {
  name: string;
  tier: string;
  targets: SlaTarget[];
  isDefault: boolean;
}
export interface TicketReply {
  authorType: "staff" | "customer";
  authorId: string;
  body: string;
  at: string;
}
export interface Ticket extends BaseRecord {
  number: string;
  customerId: string | null;
  contactId: string | null;
  channel: string;
  subject: string;
  description: string | null;
  category: string | null;
  priority: (typeof TICKET_PRIORITIES)[number];
  status: (typeof TICKET_STATUSES)[number];
  assignedTo: string | null;
  slaPolicyId: string | null;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  mergedIntoId: string | null;
  reopenedCount: number;
  satisfactionRating: number | null;
  satisfactionComment: string | null;
  replies: TicketReply[];
}
export interface PortalUser extends BaseRecord {
  email: string;
  customerId: string;
  contactId: string | null;
  isActive: boolean;
}

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
export const accountOptions = {
  queryKey: ["options", "crm.accounts"],
  load: async () => (await crmApi.accounts.list({ limit: 200, sort: "name" })).items.map((a) => ({ value: a.id, label: a.name })),
};

export const supportApi = {
  slaPolicies: crud<SlaPolicy>("/support/sla-policies"),
  tickets: crud<Ticket>("/support/tickets"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
  portalUsers: {
    list: (params: { customerId?: string } = {}) => api.get("/support/portal-users", { params: { ...params, limit: 200 } }).then((r) => r.data as { items: PortalUser[] }),
    provision: (body: { customerId: string; contactId?: string; email: string }) =>
      api.post("/support/portal-users", body).then((r) => r.data as { user: PortalUser; setupToken: string }),
    deactivate: (id: string) => api.post(`/support/portal-users/${id}/deactivate`).then((r) => r.data as PortalUser),
    reactivate: (id: string) => api.post(`/support/portal-users/${id}/reactivate`).then((r) => r.data as PortalUser),
    reissue: (id: string) => api.post(`/support/portal-users/${id}/reissue-setup-token`).then((r) => r.data as { setupToken: string }),
  },
};

/** "Due in 2h" / "Overdue by 40 min", or "—" once it no longer matters. */
function dueLabel(value: string | null): { text: string; overdue: boolean } | null {
  if (!value) return null;
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  const overdue = minutes < 0;
  const abs = Math.abs(minutes);
  const text = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  return { text: overdue ? `Overdue by ${text}` : `Due in ${text}`, overdue };
}

function SlaCell({ ticket }: { ticket: Ticket }) {
  const target = ["resolved", "closed"].includes(ticket.status) ? null : !ticket.respondedAt ? ticket.firstResponseDueAt : ticket.resolutionDueAt;
  const due = dueLabel(target);
  if (!due) return <span className="text-slate-400">—</span>;
  return <span className={due.overdue ? "text-red-600 font-medium" : "text-slate-600 dark:text-slate-300"}>{due.text}</span>;
}

function TicketActions({ r, refresh }: { r: Ticket; refresh: (t: Ticket) => void }) {
  const can = useCan("support.ticket.edit");
  const canManage = useCan("support.ticket.manage");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignedTo, setAssignedTo] = useState(r.assignedTo ?? "");
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateTo, setEscalateTo] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeInto, setMergeInto] = useState("");

  const onSuccess = (t: Ticket) => refresh(t);
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const assign = useMutation({ mutationFn: (body: { assignedTo: string }) => supportApi.post<Ticket>(`/support/tickets/${r.id}/assign`, body), onSuccess, onError });
  const sendReply = useMutation({ mutationFn: (body: { body: string }) => supportApi.post<Ticket>(`/support/tickets/${r.id}/reply`, body), onSuccess, onError });
  const escalate = useMutation({ mutationFn: (body: { to: string }) => supportApi.post<Ticket>(`/support/tickets/${r.id}/escalate`, body), onSuccess, onError });
  const merge = useMutation({ mutationFn: (body: { intoId: string }) => supportApi.post<Ticket>(`/support/tickets/${r.id}/merge`, body), onSuccess, onError });
  const reopen = useMutation({ mutationFn: () => supportApi.post<Ticket>(`/support/tickets/${r.id}/reopen`), onSuccess, onError });
  const setStatus = useMutation({ mutationFn: (status: string) => supportApi.post<Ticket>(`/support/tickets/${r.id}/status`, { status }), onSuccess, onError });

  const open = !["resolved", "closed"].includes(r.status);
  if (!can) return null;
  return (
    <>
      {open && (
        <button className="btn-ghost" onClick={() => setAssignOpen(true)}>Assign</button>
      )}
      <button className="btn-ghost" onClick={() => setReplyOpen(true)}>Reply</button>
      {open && r.status !== "waiting_customer" && (
        <button className="btn-ghost" disabled={setStatus.isPending} onClick={() => setStatus.mutate("waiting_customer")}>Waiting on customer</button>
      )}
      {open && (
        <button className="btn-primary" disabled={setStatus.isPending} onClick={() => setStatus.mutate("resolved")}>Resolve</button>
      )}
      {r.status === "resolved" && (
        <button className="btn-ghost" disabled={setStatus.isPending} onClick={() => setStatus.mutate("closed")}>Close</button>
      )}
      {!open && (
        <button className="btn-ghost" disabled={reopen.isPending} onClick={() => reopen.mutate(undefined)}>Reopen</button>
      )}
      {canManage && open && (
        <>
          <button className="btn-ghost" onClick={() => setEscalateOpen(true)}>Escalate</button>
          <button className="btn-ghost" onClick={() => setMergeOpen(true)}>Merge into…</button>
        </>
      )}

      <ConfirmDialog open={assignOpen} title="Assign this ticket" confirmLabel="Assign" busy={assign.isPending} onClose={() => setAssignOpen(false)}
        onConfirm={() => assign.mutate({ assignedTo }, { onSuccess: () => setAssignOpen(false) })}>
        <Field label="Staff user id" required><input className="input-base" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} /></Field>
      </ConfirmDialog>
      <ConfirmDialog open={replyOpen} title="Reply to the customer" confirmLabel="Send" busy={sendReply.isPending} onClose={() => setReplyOpen(false)}
        onConfirm={() => sendReply.mutate({ body: reply }, { onSuccess: () => { setReplyOpen(false); setReply(""); } })}>
        <Field label="Message" required><textarea className="input-base" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} /></Field>
      </ConfirmDialog>
      <ConfirmDialog open={escalateOpen} title="Escalate this ticket" confirmLabel="Escalate" busy={escalate.isPending} onClose={() => setEscalateOpen(false)}
        onConfirm={() => escalate.mutate({ to: escalateTo }, { onSuccess: () => setEscalateOpen(false) })}>
        <Field label="Escalate to (staff user id)" required hint="Raises priority one level and reassigns.">
          <input className="input-base" value={escalateTo} onChange={(e) => setEscalateTo(e.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog open={mergeOpen} title="Merge into another ticket" confirmLabel="Merge" busy={merge.isPending} onClose={() => setMergeOpen(false)}
        onConfirm={() => merge.mutate({ intoId: mergeInto }, { onSuccess: () => setMergeOpen(false) })}>
        <Field label="Target ticket id" required hint="This ticket closes and points at the target.">
          <input className="input-base" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </>
  );
}

function TicketExtra({ r }: { r: Ticket }) {
  const firstResponse = dueLabel(r.respondedAt ? null : r.firstResponseDueAt);
  const resolution = dueLabel(["resolved", "closed"].includes(r.status) ? null : r.resolutionDueAt);
  return (
    <div className="space-y-6">
      <section className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><p className="text-slate-500">First response</p><p className="font-semibold">{r.respondedAt ? `Responded ${formatDateTime(r.respondedAt)}` : firstResponse?.text ?? "—"}</p></div>
        <div><p className="text-slate-500">Resolution</p><p className="font-semibold">{resolution?.text ?? "—"}</p></div>
        <div><p className="text-slate-500">Reopened</p><p className="font-semibold">{r.reopenedCount} time(s)</p></div>
        <div><p className="text-slate-500">Satisfaction</p><p className="font-semibold">{r.satisfactionRating ? `${r.satisfactionRating} / 5` : "Not rated"}</p></div>
      </section>
      <section className="card p-4">
        <h2 className="font-semibold mb-3">Conversation</h2>
        <div className="space-y-3">
          {r.replies.length === 0 && <p className="text-sm text-slate-500">No replies yet.</p>}
          {r.replies.map((reply, i) => (
            <div key={i} className={reply.authorType === "customer" ? "rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3" : "rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3"}>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span className="font-medium">{reply.authorType === "customer" ? "Customer" : "Staff"}</span>
                <span>{formatDateTime(reply.at)}</span>
              </div>
              <p className="text-sm whitespace-pre-line">{reply.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SlaTargetsEditor({ r }: { r: SlaPolicy }) {
  const canEdit = useCan("support.slaPolicy.edit");
  const [rows, setRows] = useState<SlaTarget[]>(
    TICKET_PRIORITIES.map((p) => r.targets.find((t) => t.priority === p) ?? { priority: p, responseMinutes: 0, resolutionMinutes: 0 }),
  );
  const save = useMutation({
    mutationFn: () => supportApi.slaPolicies.update(r.id, { targets: rows }, r.version),
    onSuccess: () => toast.success("SLA targets saved"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setRow = (priority: string, key: "responseMinutes" | "resolutionMinutes", value: string) =>
    setRows((prev) => prev.map((t) => (t.priority === priority ? { ...t, [key]: Number(value) || 0 } : t)));
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">SLA targets</h2>
        {canEdit && <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save targets</button>}
      </div>
      <table className="table-base">
        <thead><tr><th>Priority</th><th>Response (minutes)</th><th>Resolution (minutes)</th></tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.priority}>
              <td>{humanize(t.priority)}</td>
              <td><input className="input-base" disabled={!canEdit} value={t.responseMinutes} onChange={(e) => setRow(t.priority, "responseMinutes", e.target.value)} /></td>
              <td><input className="input-base" disabled={!canEdit} value={t.resolutionMinutes} onChange={(e) => setRow(t.priority, "resolutionMinutes", e.target.value)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export const slaPolicies: MasterConfig<SlaPolicy> = {
  entityType: "support.slaPolicy",
  permission: "support.slaPolicy",
  plural: "SLA policies",
  singular: "SLA policy",
  description: "Response and resolution targets by priority. Calendar time, not business hours.",
  route: "/support/sla-policies",
  client: supportApi.slaPolicies,
  columns: [
    { key: "name", label: "Name" },
    { key: "tier", label: "Tier" },
    { key: "isDefault", label: "Default", render: (r) => (r.isDefault ? "Yes" : "—") },
  ],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "tier", label: "Tier", type: "text", required: true, hint: "e.g. standard, premium" },
    { key: "isDefault", label: "Default policy", type: "boolean" },
  ],
  title: (r) => r.name,
  subtitle: (r) => r.tier,
  details: (r) => [{ label: "Default", value: r.isDefault ? "Yes" : "No" }],
  extra: (r) => <SlaTargetsEditor r={r} />,
};

export const tickets: MasterConfig<Ticket> = {
  entityType: "support.ticket",
  permission: "support.ticket",
  plural: "Tickets",
  singular: "Ticket",
  description: "Support requests from customers and staff, tracked against SLA targets.",
  route: "/support/tickets",
  client: supportApi.tickets,
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "subject", label: "Subject" },
    { key: "priority", label: "Priority", render: (r) => humanize(r.priority) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "id", label: "SLA", render: (r) => <SlaCell ticket={r} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(TICKET_STATUSES) },
    { key: "priority", label: "Priority", options: opts(TICKET_PRIORITIES) },
  ],
  fields: [
    { key: "customerId", label: "Customer", type: "reference", reference: accountOptions },
    { key: "subject", label: "Subject", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", wide: true },
    { key: "category", label: "Category", type: "text" },
    { key: "priority", label: "Priority", type: "select", options: opts(TICKET_PRIORITIES) },
    { key: "channel", label: "Channel", type: "select", options: opts(["internal", "phone", "email", "website", "whatsapp", "sales"]), createOnly: true },
  ],
  defaults: { priority: "medium", channel: "internal" },
  editable: (r) => !["resolved", "closed"].includes(r.status),
  title: (r) => r.subject,
  subtitle: (r) => r.number,
  status: (r) => r.status,
  actions: (r, refresh) => <TicketActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Assigned to", value: r.assignedTo },
    { label: "Priority", value: humanize(r.priority) },
    { label: "Category", value: r.category },
    { label: "Channel", value: humanize(r.channel) },
    { label: "Merged into", value: r.mergedIntoId },
  ],
  extra: (r) => <TicketExtra r={r} />,
};

export const SUPPORT_SCREENS: Record<string, MasterConfig<never>> = {
  "sla-policies": slaPolicies as unknown as MasterConfig<never>,
  tickets: tickets as unknown as MasterConfig<never>,
};
