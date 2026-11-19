"use client";

import { api, BaseRecord, crud, CustomFieldDefinition } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { MasterConfig } from "@/components/master/MasterData";
import { StatusBadge } from "@/components/ui/kit";

const FIELD_TYPES = ["text", "longText", "number", "decimal", "date", "boolean", "select", "multiselect", "user", "url", "email"].map((t) => ({ value: t, label: humanize(t) }));

const recordTypeOptions = {
  queryKey: ["record-types"],
  load: async () => {
    const types = (await api.get("/records/types")).data as { type: string; label: string }[];
    return types.map((t) => ({ value: t.type, label: `${t.label} (${t.type})` }));
  },
};

export const customFields: MasterConfig<CustomFieldDefinition> = {
  entityType: "platform.customField",
  permission: "platform.customField",
  plural: "Custom fields",
  singular: "Custom field",
  description: "Extra fields your company tracks on any record type. They appear in forms and record pages.",
  route: "/settings/custom-fields",
  client: crud<CustomFieldDefinition>("/settings/custom-fields"),
  defaultSort: "entityType",
  columns: [
    { key: "label", label: "Label", sortable: true },
    { key: "entityType", label: "Record type", sortable: true },
    { key: "key", label: "Key" },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "required", label: "Required", render: (r) => (r.required ? "Yes" : "No") },
    { key: "isActive", label: "Status", render: (r) => <StatusBadge status={r.isActive ? "active" : "inactive"} /> },
  ],
  fields: [
    { key: "entityType", label: "Record type", type: "reference", required: true, createOnly: true, reference: recordTypeOptions },
    { key: "key", label: "Key", type: "text", required: true, createOnly: true, hint: "camelCase, e.g. region. Cannot change later." },
    { key: "label", label: "Label", type: "text", required: true },
    { key: "type", label: "Type", type: "select", required: true, createOnly: true, options: FIELD_TYPES },
    { key: "options", label: "Options (one per line)", type: "textarea", hint: "For select and multi-select fields" },
    { key: "helpText", label: "Help text", type: "text" },
    { key: "order", label: "Order", type: "number" },
    { key: "required", label: "Required", type: "boolean" },
    { key: "isActive", label: "Active", type: "boolean" },
  ],
  defaults: { type: "text", isActive: true, order: 100 },
  toForm: (r) => ({ label: r.label, options: r.options.join("\n"), helpText: r.helpText ?? "", order: r.order, required: r.required, isActive: r.isActive }),
  title: (r) => r.label,
  subtitle: (r) => `${r.entityType} · ${r.key}`,
  status: (r) => (r.isActive ? "active" : "inactive"),
  details: (r) => [
    { label: "Type", value: humanize(r.type) },
    { label: "Required", value: r.required ? "Yes" : "No" },
    { label: "Options", value: r.options.length ? r.options.join(", ") : null },
    { label: "Help text", value: r.helpText },
  ],
};

/** Custom-field forms send options as text; the API wants a list. */
export const customFieldClient = {
  ...customFields.client,
  create: (body: Record<string, unknown>) => customFields.client.create(splitOptions(body)),
  update: (id: string, body: Record<string, unknown>, version?: number) => customFields.client.update(id, splitOptions(body), version),
};
customFields.client = customFieldClient as typeof customFields.client;

function splitOptions(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof body.options === "string") return { ...body, options: body.options.split("\n").map((o) => o.trim()).filter(Boolean) };
  if (body.options === null) return { ...body, options: [] };
  return body;
}

export interface Delegation extends BaseRecord {
  userId: string;
  delegateUserId: string;
  startDate: string;
  endDate: string;
  entityTypes: string[];
  reason: string | null;
}

export const delegationsApi = {
  mine: () => api.get("/me/delegations").then((r) => r.data as Delegation[]),
  create: (body: { delegateUserId: string; startDate: string; endDate: string; reason?: string }) => api.post("/me/delegations", body).then((r) => r.data as Delegation),
  end: (id: string) => api.post(`/me/delegations/${id}/end`).then((r) => r.data as Delegation),
};

export { formatDate };
