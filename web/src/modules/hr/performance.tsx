"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, ErrorState, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { employeeOptions, useEmployeeName } from "./config";

export interface PerformanceCycle extends BaseRecord {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "closed";
  description: string | null;
}
export interface Goal extends BaseRecord {
  employeeId: string;
  cycleId: string;
  title: string;
  description: string | null;
  type: "goal" | "kpi" | "okr";
  weight: number | null;
  targetValue: string | null;
  currentValue: string | null;
  status: "not_started" | "in_progress" | "completed" | "missed";
  dueDate: string | null;
}
export interface Review extends BaseRecord {
  employeeId: string;
  cycleId: string;
  reviewerId: string;
  type: "self" | "manager" | "peer";
  rating: number | null;
  strengths: string | null;
  improvements: string | null;
  comments: string | null;
  recommendsPromotion: boolean;
  promotionNote: string | null;
  status: "draft" | "submitted";
  submittedAt: string | null;
}
export interface DevelopmentPlan extends BaseRecord {
  employeeId: string;
  cycleId: string | null;
  title: string;
  focusAreas: string | null;
  actions: string | null;
  targetDate: string | null;
  status: "active" | "completed" | "cancelled";
  notes: string | null;
}

export const performanceApi = {
  cycles: crud<PerformanceCycle>("/hr/performance-cycles"),
  goals: crud<Goal>("/hr/goals"),
  reviews: crud<Review>("/hr/reviews"),
  developmentPlans: crud<DevelopmentPlan>("/hr/development-plans"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
  myGoals: () => api.get("/hr/performance/me/goals").then((r) => r.data as { items: Goal[] }),
  myReviews: () => api.get("/hr/performance/me/reviews").then((r) => r.data as Review[]),
  myDevelopmentPlan: () => api.get("/hr/performance/me/development-plan").then((r) => r.data as DevelopmentPlan[]),
};

const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
export const cycleOptions = { queryKey: ["options", "hr.performanceCycles"], load: async () => (await performanceApi.cycles.list({ limit: 200 })).items.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })) };

function EmployeeLink({ id }: { id: string }) {
  const name = useEmployeeName();
  return <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/hr/employees/${id}`}>{name(id)}</Link>;
}
function useCycleName() {
  const { data } = useQuery({ queryKey: ["options", "hr.performanceCycles-raw"], queryFn: () => performanceApi.cycles.list({ limit: 200 }) });
  return (id: string) => data?.items.find((c) => c.id === id)?.name ?? "…";
}
function CycleLabel({ id }: { id: string }) {
  const name = useCycleName();
  return <>{name(id)}</>;
}

// ─── Admin: cycles, goals, reviews, development plans ───────────────────────

export const performanceCycles: MasterConfig<PerformanceCycle> = {
  entityType: "hr.performanceCycle",
  permission: "hr.performanceCycle",
  plural: "Performance cycles",
  singular: "Performance cycle",
  description: "A review period. Goals and reviews can only be added while its status is not closed.",
  route: "/hr/performance-cycles",
  client: performanceApi.cycles,
  defaultSort: "-startDate",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "dates", label: "Dates", render: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}` },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "startDate", label: "Start date", type: "date", required: true },
    { key: "endDate", label: "End date", type: "date", required: true },
    { key: "status", label: "Status", type: "select", options: opts(["draft", "active", "closed"]) },
    { key: "description", label: "Description", type: "textarea", wide: true },
  ],
  defaults: { status: "draft" },
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => r.status,
};

export const goals: MasterConfig<Goal> = {
  entityType: "hr.goal",
  permission: "hr.goal",
  plural: "Goals",
  singular: "Goal",
  description: "A goal, KPI or OKR for one employee in one cycle. Employees set their own from My Performance; use New for one set on their behalf.",
  route: "/hr/goals",
  client: performanceApi.goals,
  defaultSort: "-createdAt",
  columns: [
    { key: "employeeId", label: "Employee", render: (r) => <EmployeeLink id={r.employeeId} /> },
    { key: "title", label: "Title" },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "type", label: "Type", options: opts(["goal", "kpi", "okr"]) },
    { key: "status", label: "Status", options: opts(["not_started", "in_progress", "completed", "missed"]) },
  ],
  fields: [
    { key: "employeeId", label: "Employee", type: "reference", reference: employeeOptions, required: true, createOnly: true },
    { key: "cycleId", label: "Cycle", type: "reference", reference: cycleOptions, required: true, createOnly: true },
    { key: "title", label: "Title", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: opts(["goal", "kpi", "okr"]) },
    { key: "weight", label: "Weight (%)", type: "number" },
    { key: "targetValue", label: "Target", type: "text" },
    { key: "currentValue", label: "Current", type: "text" },
    { key: "status", label: "Status", type: "select", options: opts(["not_started", "in_progress", "completed", "missed"]) },
    { key: "dueDate", label: "Due date", type: "date" },
    { key: "description", label: "Description", type: "textarea", wide: true },
  ],
  title: (r) => r.title,
  subtitle: (r) => humanize(r.type),
  status: (r) => r.status,
  details: (r) => [
    { label: "Employee", value: <EmployeeLink id={r.employeeId} /> },
    { label: "Cycle", value: <CycleLabel id={r.cycleId} /> },
    { label: "Target", value: r.targetValue },
    { label: "Current", value: r.currentValue },
    { label: "Due", value: r.dueDate ? formatDate(r.dueDate) : null },
    { label: "Description", value: r.description },
  ],
};

function SubmitReview({ r, refresh }: { r: Review; refresh: (r: Review) => void }) {
  const run = useMutation({
    mutationFn: () => performanceApi.post<Review>(`/hr/reviews/${r.id}/submit`),
    onSuccess: (updated) => { toast.success("Submitted"); refresh(updated); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (r.status !== "draft") return null;
  return <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate()}>Submit</button>;
}

export const reviews: MasterConfig<Review> = {
  entityType: "hr.review",
  permission: "hr.review",
  plural: "Reviews",
  singular: "Review",
  description: "A self-assessment, manager review or peer feedback entry. A self-review is created by the employee; set up a manager or peer review here, fill it in, then submit it.",
  route: "/hr/reviews",
  client: performanceApi.reviews,
  defaultSort: "-createdAt",
  columns: [
    { key: "employeeId", label: "Employee", render: (r) => <EmployeeLink id={r.employeeId} /> },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "rating", label: "Rating", render: (r) => (r.rating ? `${r.rating}/5` : "—") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "type", label: "Type", options: opts(["self", "manager", "peer"]) },
    { key: "status", label: "Status", options: opts(["draft", "submitted"]) },
  ],
  fields: [
    { key: "employeeId", label: "Employee", type: "reference", reference: employeeOptions, required: true, createOnly: true },
    { key: "cycleId", label: "Cycle", type: "reference", reference: cycleOptions, required: true, createOnly: true },
    { key: "type", label: "Type", type: "select", options: [{ value: "manager", label: "Manager" }, { value: "peer", label: "Peer" }], required: true, createOnly: true },
    { key: "rating", label: "Rating (1-5)", type: "number" },
    { key: "strengths", label: "Strengths", type: "textarea", wide: true },
    { key: "improvements", label: "Areas to improve", type: "textarea", wide: true },
    { key: "comments", label: "Comments", type: "textarea", wide: true },
    { key: "recommendsPromotion", label: "Recommends promotion", type: "boolean" },
    { key: "promotionNote", label: "Promotion note", type: "textarea", wide: true },
  ],
  title: (r) => `${humanize(r.type)} review`,
  subtitle: (r) => (r.rating ? `${r.rating}/5` : "Not yet rated"),
  status: (r) => r.status,
  editable: (r) => r.status === "draft",
  actions: (r, refresh) => <SubmitReview r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Employee", value: <EmployeeLink id={r.employeeId} /> },
    { label: "Cycle", value: <CycleLabel id={r.cycleId} /> },
    { label: "Recommends promotion", value: r.recommendsPromotion ? r.promotionNote ?? "Yes" : null },
  ],
};

export const developmentPlans: MasterConfig<DevelopmentPlan> = {
  entityType: "hr.developmentPlan",
  permission: "hr.developmentPlan",
  plural: "Development plans",
  singular: "Development plan",
  description: "A growth plan for one employee: focus areas and actions toward a target date.",
  route: "/hr/development-plans",
  client: performanceApi.developmentPlans,
  defaultSort: "-createdAt",
  columns: [
    { key: "employeeId", label: "Employee", render: (r) => <EmployeeLink id={r.employeeId} /> },
    { key: "title", label: "Title" },
    { key: "targetDate", label: "Target", render: (r) => (r.targetDate ? formatDate(r.targetDate) : "—") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { key: "employeeId", label: "Employee", type: "reference", reference: employeeOptions, required: true, createOnly: true },
    { key: "title", label: "Title", type: "text", required: true },
    { key: "focusAreas", label: "Focus areas", type: "textarea", wide: true },
    { key: "actions", label: "Actions", type: "textarea", wide: true },
    { key: "targetDate", label: "Target date", type: "date" },
    { key: "status", label: "Status", type: "select", options: opts(["active", "completed", "cancelled"]) },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  defaults: { status: "active" },
  title: (r) => r.title,
  subtitle: (r) => (r.targetDate ? `By ${formatDate(r.targetDate)}` : ""),
  status: (r) => r.status,
  details: (r) => [{ label: "Employee", value: <EmployeeLink id={r.employeeId} /> }, { label: "Notes", value: r.notes }],
};

export const PERFORMANCE_SCREENS: Record<string, MasterConfig<never>> = {
  "performance-cycles": performanceCycles as unknown as MasterConfig<never>,
  goals: goals as unknown as MasterConfig<never>,
  reviews: reviews as unknown as MasterConfig<never>,
  "development-plans": developmentPlans as unknown as MasterConfig<never>,
};

// ─── Self-service: My Performance ───────────────────────────────────────────

function AddGoal({ onDone }: { onDone: () => void }) {
  const q = useQuery({ queryKey: cycleOptions.queryKey, queryFn: cycleOptions.load });
  const [open, setOpen] = useState(false);
  const [cycleId, setCycleId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"goal" | "kpi" | "okr">("goal");
  const run = useMutation({
    mutationFn: () => performanceApi.post("/hr/performance/me/goals", { cycleId, title, type }),
    onSuccess: () => { setOpen(false); setCycleId(""); setTitle(""); toast.success("Goal set"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Set a goal</button>
      <ConfirmDialog open={open} title="Set a goal" confirmLabel="Save" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Cycle" required>
            <select className="input-base" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              <option value="">Select…</option>
              {q.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Title" required><input className="input-base" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Type">
            <select className="input-base" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              {["goal", "kpi", "okr"].map((v) => <option key={v} value={v}>{humanize(v)}</option>)}
            </select>
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function UpdateGoalProgress({ g, onDone }: { g: Goal; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(g.status);
  const [currentValue, setCurrentValue] = useState(g.currentValue ?? "");
  const run = useMutation({
    mutationFn: () => performanceApi.post(`/hr/performance/me/goals/${g.id}/progress`, { status, currentValue: currentValue || undefined }),
    onSuccess: () => { setOpen(false); toast.success("Updated"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>Update</button>
      <ConfirmDialog open={open} title="Update progress" confirmLabel="Save" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Status">
            <select className="input-base" value={status} onChange={(e) => setStatus(e.target.value as Goal["status"])}>
              {["not_started", "in_progress", "completed", "missed"].map((v) => <option key={v} value={v}>{humanize(v)}</option>)}
            </select>
          </Field>
          <Field label="Current value"><input className="input-base" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function SubmitSelfAssessment({ onDone }: { onDone: () => void }) {
  const q = useQuery({ queryKey: cycleOptions.queryKey, queryFn: cycleOptions.load });
  const [open, setOpen] = useState(false);
  const [cycleId, setCycleId] = useState("");
  const [rating, setRating] = useState(3);
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [comments, setComments] = useState("");
  const run = useMutation({
    mutationFn: () => performanceApi.post("/hr/performance/me/reviews/self", { cycleId, rating, strengths: strengths || undefined, improvements: improvements || undefined, comments: comments || undefined }),
    onSuccess: () => { setOpen(false); toast.success("Self-assessment submitted"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Submit self-assessment</button>
      <ConfirmDialog open={open} title="Self-assessment" confirmLabel="Submit" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Cycle" required>
            <select className="input-base" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              <option value="">Select…</option>
              {q.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Rating (1-5)"><input type="number" min={1} max={5} className="input-base" value={rating} onChange={(e) => setRating(Number(e.target.value))} /></Field>
          <Field label="Strengths"><textarea className="input-base" rows={2} value={strengths} onChange={(e) => setStrengths(e.target.value)} /></Field>
          <Field label="Areas to improve"><textarea className="input-base" rows={2} value={improvements} onChange={(e) => setImprovements(e.target.value)} /></Field>
          <Field label="Comments"><textarea className="input-base" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

export function MyPerformancePage() {
  const queryClient = useQueryClient();
  const goalsQ = useQuery({ queryKey: ["hr-performance-goals-me"], queryFn: performanceApi.myGoals });
  const reviewsQ = useQuery({ queryKey: ["hr-performance-reviews-me"], queryFn: performanceApi.myReviews });
  const planQ = useQuery({ queryKey: ["hr-performance-plan-me"], queryFn: performanceApi.myDevelopmentPlan });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["hr-performance-goals-me"] }); queryClient.invalidateQueries({ queryKey: ["hr-performance-reviews-me"] }); };

  if (goalsQ.isLoading || reviewsQ.isLoading || planQ.isLoading) return <div className="p-6"><Spinner /></div>;
  if (goalsQ.isError || reviewsQ.isError || planQ.isError) return <ErrorState message="Could not load your performance record. Make sure you have an employee record linked to your account." />;

  return (
    <div className="space-y-6">
      <PageHeader title="My Performance" />
      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4"><h2 className="font-semibold">Goals</h2><AddGoal onDone={refresh} /></div>
        <table className="table-base">
          <thead><tr><th>Title</th><th>Type</th><th>Current</th><th>Status</th><th /></tr></thead>
          <tbody>
            {goalsQ.data!.items.map((g) => (
              <tr key={g.id}>
                <td>{g.title}</td><td>{humanize(g.type)}</td><td>{g.currentValue ?? "—"}</td><td><StatusBadge status={g.status} /></td>
                <td><UpdateGoalProgress g={g} onDone={refresh} /></td>
              </tr>
            ))}
            {goalsQ.data!.items.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-6">No goals set yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="card p-4">
        <div className="flex items-center justify-between mb-2"><h2 className="font-semibold">Reviews about me</h2><SubmitSelfAssessment onDone={refresh} /></div>
        {reviewsQ.data!.length === 0 ? <p className="text-sm text-slate-500">Nothing submitted yet.</p> : (
          <ul className="space-y-2">
            {reviewsQ.data!.map((r) => (
              <li key={r.id} className="border-t border-slate-200 dark:border-slate-800 pt-2 text-sm">
                <div className="flex items-center justify-between"><span className="font-medium">{humanize(r.type)} review</span>{r.rating && <span>{r.rating}/5</span>}</div>
                {r.comments && <p className="text-slate-600 dark:text-slate-300 mt-1">{r.comments}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card p-4">
        <h2 className="font-semibold mb-2">Development plan</h2>
        {planQ.data!.length === 0 ? <p className="text-sm text-slate-500">No development plan yet.</p> : (
          <ul className="space-y-2">
            {planQ.data!.map((p) => (
              <li key={p.id} className="border-t border-slate-200 dark:border-slate-800 pt-2 text-sm">
                <div className="flex items-center justify-between"><span className="font-medium">{p.title}</span><StatusBadge status={p.status} /></div>
                {p.focusAreas && <p className="text-slate-600 dark:text-slate-300 mt-1">{p.focusAreas}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
