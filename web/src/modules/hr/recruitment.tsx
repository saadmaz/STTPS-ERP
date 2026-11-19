"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, CalendarClock, Check, ClipboardCheck, Gift, Megaphone, Send, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { FieldDef } from "@/components/forms/SchemaForm";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";
import { branchOptions, departmentOptions, employeeOptions, positionOptions, useEmployeeName } from "./config";

export interface JobRequisition extends BaseRecord {
  number: string;
  positionId: string;
  departmentId: string | null;
  branchId: string | null;
  openings: number;
  filledCount: number;
  justification: string;
  hiringManagerId: string | null;
  currency: string;
  targetSalaryMin: number | null;
  targetSalaryMax: number | null;
  status: string;
  notes: string | null;
}
export interface JobPosting extends BaseRecord {
  requisitionId: string;
  title: string;
  description: string;
  location: string | null;
  employmentType: string;
  status: string;
  publishedAt: string | null;
  closedAt: string | null;
}
export interface InterviewEntry {
  interviewId: string;
  scheduledAt: string;
  type: string;
  interviewerId: string | null;
  status: string;
  rating: number | null;
  comments: string | null;
}
export interface Offer {
  salary: number | null;
  currency: string;
  startDate: string | null;
  status: string;
  extendedAt: string | null;
  notes: string | null;
}
export interface Candidate extends BaseRecord {
  postingId: string | null;
  requisitionId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  resumeUrl: string | null;
  linkedInUrl: string | null;
  source: string;
  stage: string;
  score: number | null;
  skills: string[];
  notes: string | null;
  interviews: InterviewEntry[];
  offer: Offer;
  rejectionReason: string | null;
  hiredAt: string | null;
  employeeId: string | null;
}

export const recruitmentApi = {
  requisitions: crud<JobRequisition>("/hr/requisitions"),
  postings: crud<JobPosting>("/hr/postings"),
  candidates: crud<Candidate>("/hr/candidates"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const linkCls = "text-blue-700 dark:text-blue-400 hover:underline";

const requisitionOptions = {
  queryKey: ["options", "hr.requisitions"],
  load: async () => (await recruitmentApi.requisitions.list({ limit: 200, where: "status:approved" })).items.map((r) => ({ value: r.id, label: `${r.number} (${r.openings - r.filledCount} open)` })),
};

function useRequisitionNumber() {
  const { data } = useQuery({ queryKey: ["options", "hr.requisitions"], queryFn: () => recruitmentApi.requisitions.list({ limit: 200 }) });
  return (id: string | null) => (id ? data?.items.find((x) => x.id === id)?.number ?? "…" : "—");
}

// ─── Job requisitions ───────────────────────────────────────────────────────────

function SubmitRequisition({ req, refresh }: { req: JobRequisition; refresh: (r: JobRequisition) => void }) {
  const can = useCan("hr.jobRequisition.edit");
  const run = useMutation({
    mutationFn: () => recruitmentApi.post<JobRequisition>(`/hr/requisitions/${req.id}/submit`),
    onSuccess: (r) => { toast.success(r.status === "approved" ? "Approved" : "Sent for approval"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return <button className="btn-primary" onClick={() => run.mutate()} disabled={run.isPending}><Send size={15} /> Submit</button>;
}

function CancelRequisition({ req, refresh }: { req: JobRequisition; refresh: (r: JobRequisition) => void }) {
  const can = useCan("hr.jobRequisition.edit");
  const run = useMutation({
    mutationFn: () => recruitmentApi.post<JobRequisition>(`/hr/requisitions/${req.id}/cancel`),
    onSuccess: (r) => { toast.success("Cancelled"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return <button className="btn-ghost" onClick={() => run.mutate()} disabled={run.isPending}><Ban size={15} /> Cancel</button>;
}

export const requisitions: MasterConfig<JobRequisition> = {
  entityType: "hr.jobRequisition",
  permission: "hr.jobRequisition",
  plural: "Job requisitions",
  singular: "Job requisition",
  description: "A request to hire into a position, routed through hiring approval.",
  route: "/hr/requisitions",
  client: recruitmentApi.requisitions,
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "openings", label: "Openings", render: (r) => `${r.filledCount} / ${r.openings}` },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "pending_approval", "approved", "rejected", "closed", "cancelled"]) }],
  fields: [
    { key: "positionId", label: "Position", type: "reference", reference: positionOptions, required: true },
    { key: "departmentId", label: "Department", type: "reference", reference: departmentOptions },
    { key: "branchId", label: "Branch", type: "reference", reference: branchOptions },
    { key: "openings", label: "Openings", type: "number" },
    { key: "hiringManagerId", label: "Hiring manager", type: "reference", reference: employeeOptions },
    { key: "targetSalaryMin", label: "Target salary (min)", type: "text", placeholder: "0.00" },
    { key: "targetSalaryMax", label: "Target salary (max)", type: "text", placeholder: "0.00" },
    { key: "justification", label: "Justification", type: "textarea", required: true, wide: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ] as FieldDef[],
  defaults: { openings: 1 },
  title: (r) => r.number,
  subtitle: (r) => `${r.filledCount} / ${r.openings} filled`,
  status: (r) => r.status,
  editable: (r) => ["draft", "rejected"].includes(r.status),
  actions: (r, refresh) => (
    <>
      {["draft", "rejected"].includes(r.status) && <SubmitRequisition req={r} refresh={refresh} />}
      {!["closed", "cancelled"].includes(r.status) && <CancelRequisition req={r} refresh={refresh} />}
    </>
  ),
  details: (r) => [
    { label: "Target salary", value: r.targetSalaryMin || r.targetSalaryMax ? `${formatMoney(r.targetSalaryMin, r.currency)} – ${formatMoney(r.targetSalaryMax, r.currency)}` : null },
    { label: "Justification", value: r.justification },
    { label: "Notes", value: r.notes },
  ],
};

// ─── Job postings ───────────────────────────────────────────────────────────────

function PublishPosting({ posting, refresh }: { posting: JobPosting; refresh: (p: JobPosting) => void }) {
  const can = useCan("hr.jobPosting.edit");
  const run = useMutation({
    mutationFn: () => recruitmentApi.post<JobPosting>(`/hr/postings/${posting.id}/publish`),
    onSuccess: (p) => { toast.success("Published to the career page"); refresh(p); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return <button className="btn-primary" onClick={() => run.mutate()} disabled={run.isPending}><Megaphone size={15} /> Publish</button>;
}

function ClosePosting({ posting, refresh }: { posting: JobPosting; refresh: (p: JobPosting) => void }) {
  const can = useCan("hr.jobPosting.edit");
  const run = useMutation({
    mutationFn: () => recruitmentApi.post<JobPosting>(`/hr/postings/${posting.id}/close`),
    onSuccess: (p) => { toast.success("Closed"); refresh(p); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can) return null;
  return <button className="btn-ghost" onClick={() => run.mutate()} disabled={run.isPending}><Ban size={15} /> Close</button>;
}

export const postings: MasterConfig<JobPosting> = {
  entityType: "hr.jobPosting",
  permission: "hr.jobPosting",
  plural: "Job postings",
  singular: "Job posting",
  description: "A job ad for an approved requisition; publishing puts it on the public career page.",
  route: "/hr/postings",
  client: recruitmentApi.postings,
  defaultSort: "-createdAt",
  columns: [
    { key: "title", label: "Title" },
    { key: "location", label: "Location" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["draft", "published", "closed"]) }],
  fields: [
    { key: "requisitionId", label: "Requisition", type: "reference", reference: requisitionOptions, required: true, createOnly: true },
    { key: "title", label: "Title", type: "text", required: true },
    { key: "employmentType", label: "Employment type", type: "select", options: opts(["full_time", "part_time", "contract", "intern", "probation"]) },
    { key: "location", label: "Location", type: "text" },
    { key: "description", label: "Description", type: "textarea", required: true, wide: true },
  ],
  title: (r) => r.title,
  subtitle: (r) => r.location ?? "",
  status: (r) => r.status,
  editable: (r) => r.status !== "closed",
  actions: (r, refresh) => (
    <>
      {r.status === "draft" && <PublishPosting posting={r} refresh={refresh} />}
      {r.status === "published" && <ClosePosting posting={r} refresh={refresh} />}
    </>
  ),
  details: (r) => [
    { label: "Description", value: r.description },
    { label: "Published", value: r.publishedAt ? formatDate(r.publishedAt) : null },
    { label: "Closed", value: r.closedAt ? formatDate(r.closedAt) : null },
    { label: "Career page link", value: r.status === "published" ? <Link className={linkCls} href={`/careers/${r.companyId}/${r.id}`} target="_blank">Open public page</Link> : null },
  ],
};

// ─── Candidates ─────────────────────────────────────────────────────────────────

const LOCKED = new Set(["hired", "rejected"]);

function ScheduleInterview({ c, refresh }: { c: Candidate; refresh: (c: Candidate) => void }) {
  const can = useCan("hr.candidate.edit");
  const [open, setOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [type, setType] = useState("phone");
  const [interviewerId, setInterviewerId] = useState("");
  const run = useMutation({
    mutationFn: () => recruitmentApi.post<Candidate>(`/hr/candidates/${c.id}/interviews`, { scheduledAt: new Date(scheduledAt).toISOString(), type, interviewerId: interviewerId || undefined }),
    onSuccess: (r) => { toast.success("Interview scheduled"); setOpen(false); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || LOCKED.has(c.stage)) return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><CalendarClock size={15} /> Schedule interview</button>
      <ConfirmDialog open={open} title="Schedule an interview" confirmLabel="Schedule" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="When" required><input type="datetime-local" className="input-base" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></Field>
          <Field label="Type">
            <select className="input-base" value={type} onChange={(e) => setType(e.target.value)}>
              {["phone", "video", "onsite", "technical", "panel", "other"].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </Field>
          <Field label="Interviewer">
            <select className="input-base" value={interviewerId} onChange={(e) => setInterviewerId(e.target.value)}>
              <option value="">Unassigned</option>
              <EmployeePickerOptions />
            </select>
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function EmployeePickerOptions() {
  const { data } = useQuery({ queryKey: employeeOptions.queryKey, queryFn: employeeOptions.load });
  return <>{(data ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</>;
}

function Scorecard({ c, interview, refresh }: { c: Candidate; interview: InterviewEntry; refresh: (c: Candidate) => void }) {
  const can = useCan("hr.candidate.edit");
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(interview.rating ? String(interview.rating) : "3");
  const [comments, setComments] = useState(interview.comments ?? "");
  const run = useMutation({
    mutationFn: (status: "completed" | "cancelled") => recruitmentApi.post<Candidate>(`/hr/candidates/${c.id}/interviews/${interview.interviewId}/scorecard`, { status, rating: status === "completed" ? Number(rating) : undefined, comments: comments || undefined }),
    onSuccess: (r) => { toast.success("Saved"); setOpen(false); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || interview.status !== "scheduled") return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><ClipboardCheck size={15} /> Record outcome</button>
      <ConfirmDialog open={open} title="Interview outcome" confirmLabel="Save as completed" busy={run.isPending} onConfirm={() => run.mutate("completed")} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Rating (1–5)"><input className="input-base" value={rating} onChange={(e) => setRating(e.target.value)} /></Field>
          <Field label="Comments"><textarea className="input-base" rows={3} value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
          <button type="button" className="btn-ghost text-sm" disabled={run.isPending} onClick={() => run.mutate("cancelled")}>Mark cancelled instead</button>
        </div>
      </ConfirmDialog>
    </>
  );
}

function ExtendOffer({ c, refresh }: { c: Candidate; refresh: (c: Candidate) => void }) {
  const can = useCan("hr.candidate.edit");
  const [open, setOpen] = useState(false);
  const [salary, setSalary] = useState("");
  const [currency, setCurrency] = useState(c.offer.currency || "LKR");
  const [startDate, setStartDate] = useState("");
  const run = useMutation({
    mutationFn: () => recruitmentApi.post<Candidate>(`/hr/candidates/${c.id}/offer`, { salary: salary || undefined, currency, startDate: startDate || undefined }),
    onSuccess: (r) => { toast.success("Offer extended"); setOpen(false); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || LOCKED.has(c.stage)) return null;
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Gift size={15} /> {c.offer.status === "none" ? "Extend offer" : "Revise offer"}</button>
      <ConfirmDialog open={open} title="Offer" confirmLabel="Save" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Salary"><input className="input-base" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0.00" /></Field>
          <Field label="Currency"><input className="input-base" value={currency} onChange={(e) => setCurrency(e.target.value)} /></Field>
          <Field label="Start date"><input type="date" className="input-base" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function RespondToOffer({ c, refresh }: { c: Candidate; refresh: (c: Candidate) => void }) {
  const can = useCan("hr.candidate.edit");
  const run = useMutation({
    mutationFn: (accepted: boolean) => recruitmentApi.post<Candidate>(`/hr/candidates/${c.id}/offer/respond`, { accepted }),
    onSuccess: (r) => { toast.success("Recorded"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || c.offer.status !== "extended") return null;
  return (
    <>
      <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate(true)}><Check size={15} /> Offer accepted</button>
      <button className="btn-ghost" disabled={run.isPending} onClick={() => run.mutate(false)}><X size={15} /> Offer declined</button>
    </>
  );
}

function RejectCandidate({ c, refresh }: { c: Candidate; refresh: (c: Candidate) => void }) {
  const can = useCan("hr.candidate.edit");
  const [open, setOpen] = useState(false);
  const run = useMutation({
    mutationFn: (reason: string) => recruitmentApi.post<Candidate>(`/hr/candidates/${c.id}/reject`, { reason }),
    onSuccess: (r) => { setOpen(false); toast.success("Rejected"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || LOCKED.has(c.stage)) return null;
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><X size={15} /> Reject</button>
      <ConfirmDialog open={open} title={`Reject ${c.firstName} ${c.lastName}?`} confirmLabel="Reject" danger reason="required" busy={run.isPending} onConfirm={(why) => run.mutate(why)} onClose={() => setOpen(false)} />
    </>
  );
}

function HireCandidate({ c, refresh }: { c: Candidate; refresh: (c: Candidate) => void }) {
  const can = useCan("hr.employee.create");
  const [open, setOpen] = useState(false);
  const [joiningDate, setJoiningDate] = useState(c.offer.startDate ?? "");
  const run = useMutation({
    mutationFn: () => recruitmentApi.post<Candidate>(`/hr/candidates/${c.id}/hire`, { joiningDate: joiningDate || undefined }),
    onSuccess: (r) => { toast.success("Hired"); setOpen(false); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || LOCKED.has(c.stage)) return null;
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><UserPlus size={15} /> Hire</button>
      <ConfirmDialog open={open} title={`Hire ${c.firstName} ${c.lastName}?`} confirmLabel="Hire" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <Field label="Joining date"><input type="date" className="input-base" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  );
}

function CandidateExtra({ c }: { c: Candidate }) {
  const [current, setCurrent] = useState(c);
  const empName = useEmployeeName();
  return (
    <div className="space-y-6">
      <section className="card p-4 flex flex-wrap gap-2">
        <ScheduleInterview c={current} refresh={setCurrent} />
        <ExtendOffer c={current} refresh={setCurrent} />
        <RespondToOffer c={current} refresh={setCurrent} />
        <HireCandidate c={current} refresh={setCurrent} />
        <RejectCandidate c={current} refresh={setCurrent} />
      </section>
      {current.offer.status !== "none" && (
        <section className="card p-4">
          <h2 className="font-semibold mb-2">Offer</h2>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between"><dt>Status</dt><dd><StatusBadge status={current.offer.status} /></dd></div>
            {current.offer.salary !== null && <div className="flex justify-between"><dt>Salary</dt><dd>{formatMoney(current.offer.salary, current.offer.currency)}</dd></div>}
            {current.offer.startDate && <div className="flex justify-between"><dt>Start date</dt><dd>{formatDate(current.offer.startDate)}</dd></div>}
          </dl>
        </section>
      )}
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Interviews</h2>
        {current.interviews.length === 0 ? <p className="text-sm text-slate-500 px-4 pb-4">None scheduled yet.</p> : (
          <table className="table-base">
            <thead><tr><th>When</th><th>Type</th><th>Interviewer</th><th>Status</th><th>Rating</th><th /></tr></thead>
            <tbody>
              {current.interviews.map((i) => (
                <tr key={i.interviewId}>
                  <td>{formatDateTime(i.scheduledAt)}</td><td>{humanize(i.type)}</td><td>{empName(i.interviewerId)}</td>
                  <td><StatusBadge status={i.status} /></td><td>{i.rating ?? "—"}</td>
                  <td><Scorecard c={current} interview={i} refresh={setCurrent} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export const candidates: MasterConfig<Candidate> = {
  entityType: "hr.candidate",
  permission: "hr.candidate",
  plural: "Candidates",
  singular: "Candidate",
  description: "The pipeline from application to hire: Applied → Screening → Shortlisted → Interview → Assessment → Final Interview → Offer → Hired / Rejected.",
  route: "/hr/candidates",
  client: recruitmentApi.candidates,
  defaultSort: "-createdAt",
  columns: [
    { key: "name", label: "Name", render: (r) => `${r.firstName} ${r.lastName}`, text: (r) => `${r.firstName} ${r.lastName}` },
    { key: "email", label: "Email" },
    { key: "stage", label: "Stage", render: (r) => <StatusBadge status={r.stage} /> },
    { key: "score", label: "Score", render: (r) => r.score ?? "—" },
    { key: "source", label: "Source", render: (r) => humanize(r.source) },
  ],
  filters: [
    { key: "stage", label: "Stage", options: opts(["applied", "screening", "shortlisted", "interview", "assessment", "final_interview", "offer", "hired", "rejected"]) },
    { key: "source", label: "Source", options: opts(["career_page", "referral", "agency", "direct", "other"]) },
  ],
  fields: [
    { key: "firstName", label: "First name", type: "text", required: true },
    { key: "lastName", label: "Last name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "text" },
    { key: "resumeUrl", label: "Resume link", type: "text" },
    { key: "linkedInUrl", label: "LinkedIn", type: "text" },
    { key: "source", label: "Source", type: "select", options: opts(["career_page", "referral", "agency", "direct", "other"]) },
    { key: "postingId", label: "Posting", type: "reference", reference: { queryKey: ["options", "hr.postings"], load: async () => (await recruitmentApi.postings.list({ limit: 200 })).items.map((p) => ({ value: p.id, label: p.title })) } },
    { key: "requisitionId", label: "Requisition", type: "reference", reference: requisitionOptions },
    { key: "stage", label: "Stage", type: "select", options: opts(["applied", "screening", "shortlisted", "interview", "assessment", "final_interview"]), hint: "Offer, Hired and Rejected are set from the actions below" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  defaults: { source: "direct" },
  title: (r) => `${r.firstName} ${r.lastName}`,
  subtitle: (r) => `${r.email} · ${humanize(r.stage)}`,
  status: (r) => r.stage,
  editable: (r) => !LOCKED.has(r.stage),
  details: (r) => [
    { label: "Phone", value: r.phone },
    { label: "Resume", value: r.resumeUrl ? <a className={linkCls} href={r.resumeUrl} target="_blank" rel="noreferrer">Open link</a> : null },
    { label: "LinkedIn", value: r.linkedInUrl ? <a className={linkCls} href={r.linkedInUrl} target="_blank" rel="noreferrer">Open profile</a> : null },
    { label: "Requisition", value: r.requisitionId ? <RequisitionLink id={r.requisitionId} /> : null },
    { label: "Rejected because", value: r.rejectionReason },
    { label: "Hired", value: r.employeeId ? <Link className={linkCls} href={`/hr/employees/${r.employeeId}`}>Open employee record</Link> : null },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <CandidateExtra c={r} />,
};

function RequisitionLink({ id }: { id: string }) {
  const number = useRequisitionNumber();
  return <Link className={linkCls} href={`/hr/requisitions/${id}`}>{number(id)}</Link>;
}

export const RECRUITMENT_SCREENS: Record<string, MasterConfig<never>> = {
  requisitions: requisitions as unknown as MasterConfig<never>,
  postings: postings as unknown as MasterConfig<never>,
  candidates: candidates as unknown as MasterConfig<never>,
};
