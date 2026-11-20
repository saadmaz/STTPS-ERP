"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, ErrorState, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { Employee } from "./config";

export interface Announcement extends BaseRecord {
  title: string;
  body: string;
  isPublished: boolean;
  expiresAt: string | null;
}
export interface HrRequest extends BaseRecord {
  employeeId: string;
  type: "document" | "address_change" | "general_query" | "other";
  subject: string;
  description: string | null;
  status: "open" | "in_progress" | "resolved" | "closed";
  resolution: string | null;
}
export interface EquipmentRequest extends BaseRecord {
  employeeId: string;
  itemDescription: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "fulfilled";
  decisionNote: string | null;
}

export const selfServiceApi = {
  announcements: crud<Announcement>("/hr/announcements"),
  requests: crud<HrRequest>("/hr/requests"),
  equipmentRequests: crud<EquipmentRequest>("/hr/equipment-requests"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
  myProfile: () => api.get("/hr/self-service/me/profile").then((r) => r.data as Employee),
  updateMyProfile: (body: object) => api.put("/hr/self-service/me/profile", body).then((r) => r.data as Employee),
  activeAnnouncements: () => api.get("/hr/self-service/announcements").then((r) => r.data as Announcement[]),
  myRequests: () => api.get("/hr/self-service/me/requests").then((r) => r.data as { items: HrRequest[] }),
  createMyRequest: (body: object) => api.post("/hr/self-service/me/requests", body).then((r) => r.data as HrRequest),
  myEquipmentRequests: () => api.get("/hr/self-service/me/equipment-requests").then((r) => r.data as { items: EquipmentRequest[] }),
  createMyEquipmentRequest: (body: object) => api.post("/hr/self-service/me/equipment-requests", body).then((r) => r.data as EquipmentRequest),
};

const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

// ─── Admin: announcements, requests, equipment requests ────────────────────

export const announcements: MasterConfig<Announcement> = {
  entityType: "hr.announcement",
  permission: "hr.announcement",
  plural: "Announcements",
  singular: "Announcement",
  description: "A company-wide post shown on the self-service portal while published and not expired.",
  route: "/hr/announcements",
  client: selfServiceApi.announcements,
  defaultSort: "-createdAt",
  columns: [
    { key: "title", label: "Title" },
    { key: "isPublished", label: "Published", render: (r) => (r.isPublished ? "Yes" : "No") },
    { key: "expiresAt", label: "Expires", render: (r) => (r.expiresAt ? formatDate(r.expiresAt) : "—") },
  ],
  fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "body", label: "Body", type: "textarea", wide: true, required: true },
    { key: "isPublished", label: "Published", type: "boolean" },
    { key: "expiresAt", label: "Expires", type: "date" },
  ],
  defaults: { isPublished: true },
  title: (r) => r.title,
  subtitle: (r) => (r.isPublished ? "Published" : "Draft"),
};

function DecideHrRequest({ r, refresh }: { r: HrRequest; refresh: (r: HrRequest) => void }) {
  const can = useCan("hr.hrRequest.edit");
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const run = useMutation({
    mutationFn: (status: HrRequest["status"]) => selfServiceApi.post<HrRequest>(`/hr/requests/${r.id}/decide`, { status, resolution: resolution || undefined }),
    onSuccess: (updated) => { setOpen(false); toast.success("Saved"); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || r.status === "closed") return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>Resolve</button>
      <ConfirmDialog open={open} title="Resolve this request" confirmLabel="Mark resolved" busy={run.isPending} onConfirm={() => run.mutate("resolved")} onClose={() => setOpen(false)}>
        <Field label="Resolution"><textarea className="input-base" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  );
}

export const hrRequests: MasterConfig<HrRequest> = {
  entityType: "hr.hrRequest",
  permission: "hr.hrRequest",
  plural: "HR requests",
  singular: "HR request",
  description: "A document, address change or general query an employee raised with HR.",
  route: "/hr/requests",
  client: selfServiceApi.requests,
  defaultSort: "-createdAt",
  columns: [
    { key: "subject", label: "Subject" },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["open", "in_progress", "resolved", "closed"]) }],
  fields: [{ key: "description", label: "Description", type: "textarea", wide: true }],
  title: (r) => r.subject,
  subtitle: (r) => humanize(r.type),
  status: (r) => r.status,
  editable: () => false,
  actions: (r, refresh) => <DecideHrRequest r={r} refresh={refresh} />,
  details: (r) => [{ label: "Description", value: r.description }, { label: "Resolution", value: r.resolution }],
};

function DecideEquipment({ r, refresh }: { r: EquipmentRequest; refresh: (r: EquipmentRequest) => void }) {
  const can = useCan("hr.equipmentRequest.edit");
  const run = useMutation({
    mutationFn: (approve: boolean) => selfServiceApi.post<EquipmentRequest>(`/hr/equipment-requests/${r.id}/decide`, { approve }),
    onSuccess: (updated) => { toast.success("Saved"); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fulfill = useMutation({
    mutationFn: () => selfServiceApi.post<EquipmentRequest>(`/hr/equipment-requests/${r.id}/fulfill`, {}),
    onSuccess: (updated) => { toast.success("Marked fulfilled"); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  if (r.status === "pending") return <><button className="btn-ghost" onClick={() => run.mutate(true)}>Approve</button><button className="btn-ghost" onClick={() => run.mutate(false)}>Reject</button></>;
  if (r.status === "approved") return <button className="btn-primary" disabled={fulfill.isPending} onClick={() => fulfill.mutate()}>Mark fulfilled</button>;
  return null;
}

export const equipmentRequests: MasterConfig<EquipmentRequest> = {
  entityType: "hr.equipmentRequest",
  permission: "hr.equipmentRequest",
  plural: "Equipment requests",
  singular: "Equipment request",
  description: "A request for equipment, approved and recorded by hand — there is no asset register to allocate from yet.",
  route: "/hr/equipment-requests",
  client: selfServiceApi.equipmentRequests,
  defaultSort: "-createdAt",
  columns: [
    { key: "itemDescription", label: "Item" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["pending", "approved", "rejected", "fulfilled"]) }],
  fields: [],
  title: (r) => r.itemDescription,
  subtitle: (r) => r.reason ?? "",
  status: (r) => r.status,
  editable: () => false,
  actions: (r, refresh) => <DecideEquipment r={r} refresh={refresh} />,
  details: (r) => [{ label: "Reason", value: r.reason }, { label: "Decision note", value: r.decisionNote }],
};

export const SELF_SERVICE_SCREENS: Record<string, MasterConfig<never>> = {
  announcements: announcements as unknown as MasterConfig<never>,
  requests: hrRequests as unknown as MasterConfig<never>,
  "equipment-requests": equipmentRequests as unknown as MasterConfig<never>,
};

// ─── Self-service: My HR ────────────────────────────────────────────────────

function EditProfile({ emp, onSaved }: { emp: Employee; onSaved: (e: Employee) => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(emp.phone ?? "");
  const [city, setCity] = useState(emp.address?.city ?? "");
  const [contactName, setContactName] = useState(emp.emergencyContact?.name ?? "");
  const [contactPhone, setContactPhone] = useState(emp.emergencyContact?.phone ?? "");
  const run = useMutation({
    mutationFn: () => selfServiceApi.updateMyProfile({
      phone: phone || undefined,
      address: city ? { city } : undefined,
      emergencyContact: contactName && contactPhone ? { name: contactName, phone: contactPhone } : undefined,
    }),
    onSuccess: (updated) => { setOpen(false); toast.success("Saved"); onSaved(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>Edit</button>
      <ConfirmDialog open={open} title="Update my details" confirmLabel="Save" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Phone"><input className="input-base" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="City"><input className="input-base" value={city} onChange={(e) => setCity(e.target.value)} /></Field>
          <Field label="Emergency contact name"><input className="input-base" value={contactName} onChange={(e) => setContactName(e.target.value)} /></Field>
          <Field label="Emergency contact phone"><input className="input-base" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function RaiseHrRequest({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<HrRequest["type"]>("general_query");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const run = useMutation({
    mutationFn: () => selfServiceApi.createMyRequest({ type, subject, description: description || undefined }),
    onSuccess: () => { setOpen(false); setSubject(""); setDescription(""); toast.success("Request sent"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Raise a request</button>
      <ConfirmDialog open={open} title="Raise a request to HR" confirmLabel="Send" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Type">
            <select className="input-base" value={type} onChange={(e) => setType(e.target.value as HrRequest["type"])}>
              {["document", "address_change", "general_query", "other"].map((v) => <option key={v} value={v}>{humanize(v)}</option>)}
            </select>
          </Field>
          <Field label="Subject" required><input className="input-base" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label="Description"><textarea className="input-base" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function RequestEquipment({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [itemDescription, setItemDescription] = useState("");
  const [reason, setReason] = useState("");
  const run = useMutation({
    mutationFn: () => selfServiceApi.createMyEquipmentRequest({ itemDescription, reason: reason || undefined }),
    onSuccess: () => { setOpen(false); setItemDescription(""); setReason(""); toast.success("Request sent"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Request equipment</button>
      <ConfirmDialog open={open} title="Request equipment" confirmLabel="Send" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Item" required><input className="input-base" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} /></Field>
          <Field label="Reason"><textarea className="input-base" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

export function MyHrPage() {
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ["hr-ss-profile"], queryFn: selfServiceApi.myProfile });
  const announcementsQ = useQuery({ queryKey: ["hr-ss-announcements"], queryFn: selfServiceApi.activeAnnouncements });
  const requestsQ = useQuery({ queryKey: ["hr-ss-requests"], queryFn: selfServiceApi.myRequests });
  const equipmentQ = useQuery({ queryKey: ["hr-ss-equipment"], queryFn: selfServiceApi.myEquipmentRequests });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["hr-ss-requests"] }); queryClient.invalidateQueries({ queryKey: ["hr-ss-equipment"] }); };

  if (profileQ.isLoading) return <div className="p-6"><Spinner /></div>;
  if (profileQ.isError) return <ErrorState message="Could not load your HR record. Make sure you have an employee record linked to your account." />;

  return (
    <div className="space-y-6">
      <PageHeader title="My HR" subtitle="Profile, announcements, and requests to HR. For attendance, leave, shifts and goals, see their own pages." />
      {announcementsQ.data && announcementsQ.data.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold mb-2">Announcements</h2>
          <ul className="space-y-2">
            {announcementsQ.data.map((a) => (
              <li key={a.id} className="border-t border-slate-200 dark:border-slate-800 pt-2 text-sm">
                <p className="font-medium">{a.title}</p>
                <p className="text-slate-600 dark:text-slate-300 whitespace-pre-line">{a.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card p-4">
        <div className="flex items-center justify-between mb-2"><h2 className="font-semibold">My details</h2><EditProfile emp={profileQ.data!} onSaved={() => queryClient.invalidateQueries({ queryKey: ["hr-ss-profile"] })} /></div>
        <dl className="text-sm space-y-1">
          <div className="flex justify-between"><dt>Phone</dt><dd>{profileQ.data!.phone ?? "—"}</dd></div>
          <div className="flex justify-between"><dt>City</dt><dd>{profileQ.data!.address?.city ?? "—"}</dd></div>
          <div className="flex justify-between"><dt>Emergency contact</dt><dd>{profileQ.data!.emergencyContact ? `${profileQ.data!.emergencyContact!.name} (${profileQ.data!.emergencyContact!.phone})` : "—"}</dd></div>
        </dl>
      </section>
      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4"><h2 className="font-semibold">My requests to HR</h2><RaiseHrRequest onDone={refresh} /></div>
        <table className="table-base">
          <thead><tr><th>Subject</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            {requestsQ.data?.items.map((r) => <tr key={r.id}><td>{r.subject}</td><td>{humanize(r.type)}</td><td><StatusBadge status={r.status} /></td></tr>)}
            {requestsQ.data?.items.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500 py-6">No requests yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4"><h2 className="font-semibold">My equipment requests</h2><RequestEquipment onDone={refresh} /></div>
        <table className="table-base">
          <thead><tr><th>Item</th><th>Status</th></tr></thead>
          <tbody>
            {equipmentQ.data?.items.map((r) => <tr key={r.id}><td>{r.itemDescription}</td><td><StatusBadge status={r.status} /></td></tr>)}
            {equipmentQ.data?.items.length === 0 && <tr><td colSpan={2} className="text-center text-slate-500 py-6">No requests yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
