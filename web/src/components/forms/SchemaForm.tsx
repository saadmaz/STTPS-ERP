"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CustomFieldDefinition, platformApi, recordsApi } from "@/lib/api";
import { Field } from "@/components/ui/kit";

export type FieldType = "text" | "textarea" | "select" | "boolean" | "date" | "number" | "email" | "reference" | "user" | "users";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** For type "reference": loads the choices. */
  reference?: { queryKey: unknown[]; load: () => Promise<{ value: string; label: string }[]> };
  /** Only shown when creating (e.g. fields that cannot change later). */
  createOnly?: boolean;
  /** Span both columns. */
  wide?: boolean;
}

export type FormValues = Record<string, unknown>;

/** Turns form state into an API body: blank optional fields are omitted on create and cleared (null) on update. */
export function toBody(fields: FieldDef[], values: FormValues, mode: "create" | "edit"): FormValues {
  const body: FormValues = {};
  for (const f of fields) {
    if (mode === "edit" && f.createOnly) continue;
    const v = values[f.key];
    if (v === "" || v === undefined || (Array.isArray(v) && v.length === 0 && f.type !== "users")) {
      if (mode === "edit" && !f.required) body[f.key] = f.type === "users" ? [] : null;
      continue;
    }
    body[f.key] = f.type === "number" ? Number(v) : v;
  }
  const custom = values.customFields as Record<string, unknown> | undefined;
  if (custom && Object.keys(custom).length) body.customFields = custom;
  return body;
}

function ReferenceSelect({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  const { data = [], isLoading } = useQuery({ queryKey: def.reference!.queryKey, queryFn: def.reference!.load });
  return (
    <select className="input-base" value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading}>
      <option value="">{isLoading ? "Loading…" : "None"}</option>
      {data.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function useDirectory() {
  return useQuery({ queryKey: ["directory"], queryFn: platformApi.directory, staleTime: 5 * 60_000 });
}

function UserSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data = [] } = useDirectory();
  return (
    <select className="input-base" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">None</option>
      {data.map((u) => (
        <option key={u.id} value={u.id}>
          {u.firstName} {u.lastName} · {u.email}
        </option>
      ))}
    </select>
  );
}

function UsersSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data = [] } = useDirectory();
  return (
    <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-1">
      {data.map((u) => (
        <label key={u.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.includes(u.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, u.id] : value.filter((id) => id !== u.id))}
          />
          {u.firstName} {u.lastName}
        </label>
      ))}
    </div>
  );
}

function input(def: FieldDef, value: unknown, set: (v: unknown) => void) {
  switch (def.type) {
    case "textarea":
      return <textarea className="input-base" rows={3} value={(value as string) ?? ""} onChange={(e) => set(e.target.value)} />;
    case "select":
      return (
        <select className="input-base" value={(value as string) ?? ""} onChange={(e) => set(e.target.value)}>
          {!def.required && <option value="">None</option>}
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <div className="pt-1">
          <input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />
        </div>
      );
    case "reference":
      return <ReferenceSelect def={def} value={(value as string) ?? ""} onChange={set} />;
    case "user":
      return <UserSelect value={(value as string) ?? ""} onChange={set} />;
    case "users":
      return <UsersSelect value={(value as string[]) ?? []} onChange={set} />;
    default:
      return (
        <input
          className="input-base"
          type={def.type === "number" ? "number" : def.type === "date" ? "date" : def.type === "email" ? "email" : "text"}
          placeholder={def.placeholder}
          value={(value as string | number) ?? ""}
          onChange={(e) => set(e.target.value)}
        />
      );
  }
}

function customInput(def: CustomFieldDefinition, value: unknown, set: (v: unknown) => void) {
  switch (def.type) {
    case "boolean":
      return <input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />;
    case "select":
      return (
        <select className="input-base" value={(value as string) ?? ""} onChange={(e) => set(e.target.value || null)}>
          <option value="">None</option>
          {def.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case "multiselect":
      return (
        <select
          multiple
          className="input-base"
          value={(value as string[]) ?? []}
          onChange={(e) => set([...e.target.selectedOptions].map((o) => o.value))}
        >
          {def.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case "longText":
      return <textarea className="input-base" rows={3} value={(value as string) ?? ""} onChange={(e) => set(e.target.value || null)} />;
    case "number":
      return <input className="input-base" type="number" value={(value as number) ?? ""} onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))} />;
    default:
      return (
        <input
          className="input-base"
          type={def.type === "date" ? "date" : def.type === "email" ? "email" : def.type === "url" ? "url" : "text"}
          value={(value as string) ?? ""}
          onChange={(e) => set(e.target.value || null)}
        />
      );
  }
}

/**
 * Renders a form from field definitions, followed by the company's custom
 * fields for the record type. Required fields are checked before submit; the
 * API validates everything again.
 */
export function SchemaForm({
  id,
  entityType,
  fields,
  initial,
  mode,
  onSubmit,
}: {
  id: string;
  entityType?: string;
  fields: FieldDef[];
  initial: FormValues;
  mode: "create" | "edit";
  onSubmit: (values: FormValues) => void;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const custom = useQuery({ queryKey: ["custom-fields", entityType], queryFn: () => recordsApi.customFields(entityType!), enabled: !!entityType });
  const shown = fields.filter((f) => mode === "create" || !f.createOnly);
  const customValues = (values.customFields as Record<string, unknown>) ?? {};

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    for (const f of shown) {
      const v = values[f.key];
      if (f.required && (v === undefined || v === "" || v === null)) next[f.key] = `${f.label} is required`;
    }
    for (const d of custom.data ?? []) {
      if (d.required && (customValues[d.key] === undefined || customValues[d.key] === null || customValues[d.key] === "")) next[`cf.${d.key}`] = `${d.label} is required`;
    }
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(values);
  };

  return (
    <form id={id} onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {shown.map((f) => (
        <div key={f.key} className={f.wide || f.type === "textarea" || f.type === "users" ? "sm:col-span-2" : undefined}>
          <Field label={f.label} required={f.required} error={errors[f.key]} hint={f.hint}>
            {input(f, values[f.key], (v) => setValues((s) => ({ ...s, [f.key]: v })))}
          </Field>
        </div>
      ))}
      {(custom.data?.length ?? 0) > 0 && (
        <div className="sm:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Additional fields</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {custom.data!.map((d) => (
              <Field key={d.key} label={d.label} required={d.required} hint={d.helpText} error={errors[`cf.${d.key}`]}>
                {customInput(d, customValues[d.key], (v) => setValues((s) => ({ ...s, customFields: { ...customValues, [d.key]: v } })))}
              </Field>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
