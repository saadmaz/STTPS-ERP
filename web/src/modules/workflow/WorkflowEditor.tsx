"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage, platformApi } from "@/lib/api";
import { useCan } from "@/lib/workspace";
import { Field, PageHeader, Spinner, ErrorState } from "@/components/ui/kit";

type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "nin";
type ApproverType = "user" | "role" | "permission" | "departmentManager" | "requesterManager";

interface Condition {
  fact: string;
  op: Op;
  value: string | number | boolean | (string | number)[];
}
interface Approver {
  type: ApproverType;
  ids?: string[];
}
interface Step {
  name: string;
  approvers: Approver[];
  minApprovals?: number;
  conditions?: Condition[];
  timeoutHours?: number | null;
  escalateTo?: Approver[] | null;
}
export interface WorkflowDefinition extends BaseRecord {
  code: string;
  name: string;
  entityType: string;
  priority: number;
  conditions: Condition[];
  steps: Step[];
  allowSelfApproval: boolean;
  isActive: boolean;
}

export const workflowsApi = crud<WorkflowDefinition>("/workflow/definitions");

const OPS: { value: Op; label: string }[] = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "is not" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "in", label: "is one of" },
  { value: "nin", label: "is none of" },
];
const APPROVER_TYPES: { value: ApproverType; label: string }[] = [
  { value: "user", label: "Specific people" },
  { value: "role", label: "Anyone with a role (role ids)" },
  { value: "permission", label: "Anyone with a permission" },
  { value: "departmentManager", label: "Manager of the record's department" },
  { value: "requesterManager", label: "Requester's department manager" },
];

/** Form text "100000" becomes a number; "a, b" becomes a list for in / not in. */
function parseValue(op: Op, text: string): Condition["value"] {
  if (op === "in" || op === "nin") return text.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s));
  if (/^-?\d+(\.\d+)?$/.test(text.trim())) return Number(text);
  if (text === "true" || text === "false") return text === "true";
  return text;
}
const valueText = (v: Condition["value"]) => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));

function ConditionsEditor({ value, onChange, hint }: { value: Condition[]; onChange: (c: Condition[]) => void; hint: string }) {
  return (
    <div className="space-y-2">
      {value.map((c, i) => (
        <div key={i} className="flex gap-2">
          <input className="input-base" placeholder="fact, e.g. amount" value={c.fact} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, fact: e.target.value } : x)))} aria-label="Fact" />
          <select className="input-base w-36" value={c.op} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, op: e.target.value as Op } : x)))} aria-label="Operator">
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input className="input-base" placeholder="value" value={valueText(c.value)} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, value: parseValue(x.op, e.target.value) } : x)))} aria-label="Value" />
          <button type="button" className="btn-ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove condition">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost text-blue-600" onClick={() => onChange([...value, { fact: "amount", op: "gte", value: 0 }])}>
        <Plus size={14} /> Condition
      </button>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function ApproversEditor({ value, onChange }: { value: Approver[]; onChange: (a: Approver[]) => void }) {
  const directory = useQuery({ queryKey: ["directory"], queryFn: platformApi.directory, staleTime: 5 * 60_000 });
  return (
    <div className="space-y-2">
      {value.map((a, i) => (
        <div key={i} className="flex flex-col sm:flex-row gap-2">
          <select className="input-base sm:w-72" value={a.type} onChange={(e) => onChange(value.map((x, j) => (j === i ? { type: e.target.value as ApproverType, ids: [] } : x)))} aria-label="Approver type">
            {APPROVER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {a.type === "user" ? (
            <select
              multiple
              className="input-base flex-1 h-24"
              value={a.ids ?? []}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, ids: [...e.target.selectedOptions].map((o) => o.value) } : x)))}
              aria-label="People"
            >
              {(directory.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          ) : a.type === "role" || a.type === "permission" ? (
            <input
              className="input-base flex-1"
              placeholder={a.type === "role" ? "role ids, comma separated" : "e.g. finance.payment.approve"}
              value={(a.ids ?? []).join(", ")}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, ids: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x)))}
            />
          ) : (
            <div className="flex-1" />
          )}
          <button type="button" className="btn-ghost self-start" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove approver">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost text-blue-600" onClick={() => onChange([...value, { type: "user", ids: [] }])}>
        <Plus size={14} /> Approver
      </button>
    </div>
  );
}

const blank = (): Omit<WorkflowDefinition, keyof BaseRecord> => ({
  code: "",
  name: "",
  entityType: "",
  priority: 100,
  conditions: [],
  steps: [{ name: "Manager approval", approvers: [{ type: "departmentManager" }], minApprovals: 1, conditions: [] }],
  allowSelfApproval: false,
  isActive: true,
});

function Editor({ initial }: { initial: WorkflowDefinition | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canEdit = useCan(initial ? "workflow.definition.edit" : "workflow.definition.create");
  const [form, setForm] = useState(() => (initial ? { ...initial } : blank()));
  const types = useQuery({ queryKey: ["record-types"], queryFn: () => api.get("/records/types").then((r) => r.data as { type: string; label: string }[]) });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: form.code,
        name: form.name,
        entityType: form.entityType,
        priority: Number(form.priority),
        conditions: form.conditions,
        allowSelfApproval: form.allowSelfApproval,
        isActive: form.isActive,
        steps: form.steps.map((s) => ({
          name: s.name,
          approvers: s.approvers,
          minApprovals: Number(s.minApprovals ?? 1),
          conditions: s.conditions ?? [],
          ...(s.timeoutHours ? { timeoutHours: Number(s.timeoutHours), escalateTo: s.escalateTo ?? [] } : {}),
        })),
      };
      return initial ? workflowsApi.update(initial.id, body, initial.version) : workflowsApi.create(body);
    },
    onSuccess: (row) => {
      toast.success("Workflow saved");
      queryClient.invalidateQueries({ queryKey: ["workflow.definition"] });
      router.push(`/settings/workflows/${row.id}`);
      if (initial) queryClient.setQueryData(["workflow", initial.id], row);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const setStep = (i: number, patch: Partial<Step>) => setForm({ ...form, steps: form.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <form
      className="max-w-4xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Link href="/settings/workflows" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> Approval workflows
      </Link>
      <PageHeader
        title={initial ? initial.name : "New approval workflow"}
        actions={
          canEdit && (
            <button className="btn-primary" disabled={save.isPending}>
              {save.isPending && <Spinner size={14} className="text-white" />}
              Save
            </button>
          )
        }
      />
      <fieldset disabled={!canEdit} className="space-y-6">
        <section className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" required>
            <input className="input-base" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Code" required hint="Unique, e.g. PR-STANDARD">
            <input className="input-base" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          </Field>
          <Field label="Applies to" required hint="The record type, e.g. procurement.requisition">
            <input className="input-base" list="record-types" value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })} required />
            <datalist id="record-types">
              {(types.data ?? []).map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label="Priority" hint="Lower runs first when several workflows match">
            <input className="input-base" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.allowSelfApproval} onChange={(e) => setForm({ ...form, allowSelfApproval: e.target.checked })} /> Requesters may approve their own requests
          </label>
          <div className="sm:col-span-2">
            <p className="form-label">Use this workflow when</p>
            <ConditionsEditor value={form.conditions} onChange={(conditions) => setForm({ ...form, conditions })} hint="All conditions must hold. Leave empty to match every record of this type. Amounts are in minor units (cents)." />
          </div>
        </section>

        {form.steps.map((s, i) => (
          <section key={i} className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">{i + 1}</span>
              <input className="input-base flex-1" value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} aria-label="Step name" required />
              <button type="button" className="btn-ghost" disabled={form.steps.length === 1} onClick={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })} aria-label="Remove step">
                <Trash2 size={15} />
              </button>
            </div>
            <div>
              <p className="form-label">Approvers</p>
              <ApproversEditor value={s.approvers} onChange={(approvers) => setStep(i, { approvers })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Approvals needed" hint="1 = any one approver; more = several must approve">
                <input className="input-base" type="number" min={1} value={s.minApprovals ?? 1} onChange={(e) => setStep(i, { minApprovals: Number(e.target.value) })} />
              </Field>
              <Field label="Escalate after (hours)" hint="Leave empty for no escalation">
                <input className="input-base" type="number" min={1} value={s.timeoutHours ?? ""} onChange={(e) => setStep(i, { timeoutHours: e.target.value ? Number(e.target.value) : null })} />
              </Field>
            </div>
            {s.timeoutHours ? (
              <div>
                <p className="form-label">Escalate to</p>
                <ApproversEditor value={s.escalateTo ?? []} onChange={(escalateTo) => setStep(i, { escalateTo })} />
              </div>
            ) : null}
            <div>
              <p className="form-label">Only include this step when</p>
              <ConditionsEditor value={s.conditions ?? []} onChange={(conditions) => setStep(i, { conditions })} hint="Leave empty to always include it." />
            </div>
          </section>
        ))}
        <button type="button" className="btn-secondary" onClick={() => setForm({ ...form, steps: [...form.steps, { name: `Step ${form.steps.length + 1}`, approvers: [{ type: "user", ids: [] }], minApprovals: 1, conditions: [] }] })}>
          <Plus size={15} /> Add step
        </button>
      </fieldset>
    </form>
  );
}

export function WorkflowEditor({ id }: { id: string | null }) {
  const existing = useQuery({ queryKey: ["workflow", id], queryFn: () => workflowsApi.get(id!), enabled: !!id });
  if (!id) return <Editor initial={null} />;
  if (existing.isLoading) return <Spinner />;
  if (existing.isError) return <ErrorState message={errorMessage(existing.error)} />;
  return <Editor key={existing.data!.version} initial={existing.data!} />;
}
