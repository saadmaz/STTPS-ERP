"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, Spinner, StatusBadge } from "@/components/ui/kit";

export interface Project extends BaseRecord {
  code: string; name: string; customerId: string | null; managerId: string | null; status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent"; currency: string; budget: number | null; billingMethod: string; billedToDate: number; description: string | null;
}
export interface ProjectPhase extends BaseRecord { projectId: string; name: string; sequence: number; status: "not_started" | "in_progress" | "completed"; }
export interface Milestone extends BaseRecord { projectId: string; phaseId: string | null; name: string; dueDate: string | null; status: "pending" | "completed"; }
export interface ProjectCost extends BaseRecord { projectId: string; category: string; amount: number; date: string; description: string | null; }
export interface ProjectSummary {
  project: Project; phases: ProjectPhase[]; milestones: Milestone[]; costs: ProjectCost[];
  laborCost: number; laborHours: number; materialCost: number; actualCost: number; budgetVariance: number | null; billedToDate: number; profitability: number;
}

const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const projectsApi = {
  projects: crud<Project>("/projects"),
  phases: crud<ProjectPhase>("/projects/phases"),
  milestones: crud<Milestone>("/projects/milestones"),
  costs: crud<ProjectCost>("/projects/costs"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
  summary: (id: string) => api.get(`/projects/${id}/summary`).then((r) => r.data as ProjectSummary),
};

function BillProject({ project }: { project: Project }) {
  const can = useCan("projects.billing.edit");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const run = useMutation({
    mutationFn: () => projectsApi.post(`/projects/${project.id}/bill`, { amount, description }),
    onSuccess: () => { setOpen(false); setAmount(""); setDescription(""); toast.success("Invoice raised"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can || !project.customerId) return null;
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Bill customer</button>
      <ConfirmDialog open={open} title="Raise an invoice" confirmLabel="Raise invoice" busy={run.isPending} onConfirm={() => run.mutate()} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Amount" required><input className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100000.00" /></Field>
          <Field label="Description" required><input className="input-base" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function ProjectStatusPicker({ project }: { project: Project }) {
  const run = useMutation({
    mutationFn: (status: Project["status"]) => projectsApi.projects.update(project.id, { status }),
    onSuccess: () => toast.success("Status updated"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <select className="input-base text-sm" defaultValue={project.status} disabled={run.isPending} onChange={(e) => run.mutate(e.target.value as Project["status"])}>
      {["planning", "active", "on_hold", "completed", "cancelled"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
    </select>
  );
}

function CompleteMilestone({ m, onDone }: { m: Milestone; onDone: () => void }) {
  const run = useMutation({
    mutationFn: () => projectsApi.post(`/projects/milestones/${m.id}/complete`),
    onSuccess: () => { toast.success("Milestone completed"); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (m.status === "completed") return null;
  return <button className="btn-ghost" disabled={run.isPending} onClick={() => run.mutate()}>Complete</button>;
}

function ProjectSummaryPanel({ project }: { project: Project }) {
  const q = useQuery({ queryKey: ["project-summary", project.id], queryFn: () => projectsApi.summary(project.id) });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return null;
  const s = q.data!;
  return (
    <div className="space-y-6">
      <section className="card p-4 flex flex-wrap gap-6 text-sm">
        <div><p className="text-slate-500">Labour</p><p className="font-semibold">{formatMoney(s.laborCost, project.currency)} ({(s.laborHours / 1000).toFixed(1)}h)</p></div>
        <div><p className="text-slate-500">Material/other</p><p className="font-semibold">{formatMoney(s.materialCost, project.currency)}</p></div>
        <div><p className="text-slate-500">Actual cost</p><p className="font-semibold">{formatMoney(s.actualCost, project.currency)}</p></div>
        {s.budgetVariance !== null && <div><p className="text-slate-500">Budget variance</p><p className={`font-semibold ${s.budgetVariance < 0 ? "text-red-600" : ""}`}>{formatMoney(s.budgetVariance, project.currency)}</p></div>}
        <div><p className="text-slate-500">Billed to date</p><p className="font-semibold">{formatMoney(s.billedToDate, project.currency)}</p></div>
        <div><p className="text-slate-500">Profitability</p><p className={`font-semibold ${s.profitability < 0 ? "text-red-600" : "text-green-600"}`}>{formatMoney(s.profitability, project.currency)}</p></div>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Milestones</h2>
        <table className="table-base">
          <thead><tr><th>Name</th><th>Due</th><th>Status</th><th /></tr></thead>
          <tbody>
            {s.milestones.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.dueDate ? formatDate(m.dueDate) : "—"}</td><td><StatusBadge status={m.status} /></td><td><CompleteMilestone m={m} onDone={() => q.refetch()} /></td></tr>)}
            {s.milestones.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-6">No milestones yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 mb-2">Costs</h2>
        <table className="table-base">
          <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Description</th></tr></thead>
          <tbody>
            {s.costs.map((c) => <tr key={c.id}><td>{formatDate(c.date)}</td><td>{humanize(c.category)}</td><td>{formatMoney(c.amount, project.currency)}</td><td>{c.description}</td></tr>)}
            {s.costs.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-6">No costs recorded yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export const projects: MasterConfig<Project> = {
  entityType: "projects.project",
  permission: "projects.project",
  plural: "Projects",
  singular: "Project",
  description: "Setup, budget vs actual, milestones and billing. Tasks for a project live in Tasks, filtered by project.",
  route: "/projects/all",
  client: projectsApi.projects,
  defaultSort: "-createdAt",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "budget", label: "Budget", render: (r) => (r.budget !== null ? formatMoney(r.budget, r.currency) : "—") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(["planning", "active", "on_hold", "completed", "cancelled"]) }],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "customerId", label: "Customer id", type: "text" },
    { key: "managerId", label: "Manager (user id)", type: "text" },
    { key: "priority", label: "Priority", type: "select", options: opts(["low", "medium", "high", "urgent"]) },
    { key: "billingMethod", label: "Billing method", type: "select", options: opts(["fixed", "time_and_materials", "milestone", "retainer", "recurring"]) },
    { key: "budget", label: "Budget", type: "text", placeholder: "500000.00" },
    { key: "startDate", label: "Start date", type: "date" },
    { key: "endDate", label: "End date", type: "date" },
    { key: "description", label: "Description", type: "textarea", wide: true },
  ],
  defaults: { priority: "medium", billingMethod: "fixed" },
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => r.status,
  actions: (r) => <><ProjectStatusPicker project={r} /><BillProject project={r} /></>,
  details: (r) => [{ label: "Billing method", value: humanize(r.billingMethod) }, { label: "Billed to date", value: formatMoney(r.billedToDate, r.currency) }],
  extra: (r) => <ProjectSummaryPanel project={r} />,
};

export const phases: MasterConfig<ProjectPhase> = {
  entityType: "projects.phase", permission: "projects.phase", plural: "Project phases", singular: "Phase",
  description: "A stage of a project's plan.", route: "/projects/phases-list", client: projectsApi.phases, defaultSort: "sequence",
  columns: [{ key: "name", label: "Name" }, { key: "sequence", label: "Order" }, { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> }],
  fields: [
    { key: "projectId", label: "Project id", type: "text", required: true, createOnly: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "sequence", label: "Order", type: "number" },
    { key: "startDate", label: "Start date", type: "date" },
    { key: "endDate", label: "End date", type: "date" },
  ],
  title: (r) => r.name, subtitle: (r) => `#${r.sequence}`, status: (r) => r.status,
};

export const milestones: MasterConfig<Milestone> = {
  entityType: "projects.milestone", permission: "projects.milestone", plural: "Milestones", singular: "Milestone",
  description: "A project deliverable due by a date.", route: "/projects/milestones-list", client: projectsApi.milestones, defaultSort: "dueDate",
  columns: [{ key: "name", label: "Name" }, { key: "dueDate", label: "Due", render: (r) => (r.dueDate ? formatDate(r.dueDate) : "—") }, { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> }],
  fields: [
    { key: "projectId", label: "Project id", type: "text", required: true, createOnly: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "dueDate", label: "Due date", type: "date" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => r.name, subtitle: (r) => (r.dueDate ? formatDate(r.dueDate) : ""), status: (r) => r.status,
};

export const projectCosts: MasterConfig<ProjectCost> = {
  entityType: "projects.projectCost", permission: "projects.projectCost", plural: "Project costs", singular: "Project cost",
  description: "Material, contractor or other non-labour cost against a project; labour comes from logged time instead.",
  route: "/projects/costs-list", client: projectsApi.costs, defaultSort: "-date",
  columns: [{ key: "date", label: "Date", render: (r) => formatDate(r.date) }, { key: "category", label: "Category", render: (r) => humanize(r.category) }, { key: "amount", label: "Amount", render: (r) => formatMoney(r.amount, "LKR") }],
  fields: [
    { key: "projectId", label: "Project id", type: "text", required: true, createOnly: true },
    { key: "category", label: "Category", type: "select", options: opts(["material", "expense", "contractor", "other"]), required: true },
    { key: "amount", label: "Amount", type: "text", placeholder: "30000.00", required: true },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "description", label: "Description", type: "textarea", wide: true },
  ],
  title: (r) => r.description ?? humanize(r.category), subtitle: (r) => formatDate(r.date),
};

export const PROJECTS_SCREENS: Record<string, MasterConfig<never>> = {
  all: projects as unknown as MasterConfig<never>,
  "phases-list": phases as unknown as MasterConfig<never>,
  "milestones-list": milestones as unknown as MasterConfig<never>,
  "costs-list": projectCosts as unknown as MasterConfig<never>,
};
