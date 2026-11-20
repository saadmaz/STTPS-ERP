"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { StatusBadge } from "@/components/ui/kit";

export interface ApiKey extends BaseRecord {
  name: string; prefix: string; permissions: string[]; status: "active" | "revoked";
  rateLimitPerMinute: number; lastUsedAt: string | null; requestCount: number;
}
export interface Webhook extends BaseRecord {
  name: string; url: string; eventTypes: string[]; active: boolean;
  lastDeliveryAt: string | null; lastDeliveryStatus: "delivered" | "failed" | null; lastDeliveryError: string | null;
}

export const apiKeysApi = { keys: crud<ApiKey>("/platform/api-keys") };
export const webhooksApi = { webhooks: crud<Webhook>("/platform/webhooks") };

function RevokeButton({ r, refresh }: { r: ApiKey; refresh: (k: ApiKey) => void }) {
  const canEdit = useCan("integrations.apiKey.edit");
  const revoke = useMutation({
    mutationFn: () => api.post<ApiKey>(`/platform/api-keys/${r.id}/revoke`).then((res) => res.data),
    onSuccess: (k) => { toast.success("Revoked"); refresh(k); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit || r.status === "revoked") return null;
  return <button className="btn-ghost" disabled={revoke.isPending} onClick={() => revoke.mutate()}>Revoke</button>;
}

export const apiKeys: MasterConfig<ApiKey> = {
  entityType: "integrations.apiKey",
  permission: "integrations.apiKey",
  plural: "API keys",
  singular: "API key",
  description: "Scoped keys for external systems to call this API with, via an x-api-key header instead of signing in.",
  route: "/settings/api-keys",
  client: apiKeysApi.keys,
  defaultSort: "-createdAt",
  createHref: "/settings/api-keys/new",
  columns: [
    { key: "name", label: "Name" },
    { key: "prefix", label: "Prefix", render: (r) => <code className="text-xs">{r.prefix}…</code> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "lastUsedAt", label: "Last used", render: (r) => (r.lastUsedAt ? formatDateTime(r.lastUsedAt) : "Never") },
  ],
  fields: [],
  title: (r) => r.name,
  subtitle: (r) => r.prefix,
  status: (r) => r.status,
  actions: (r, refresh) => <RevokeButton r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Permissions", value: r.permissions.join(", ") || "None" },
    { label: "Rate limit", value: `${r.rateLimitPerMinute} / minute` },
    { label: "Requests made", value: String(r.requestCount) },
    { label: "Last used", value: r.lastUsedAt ? formatDateTime(r.lastUsedAt) : "Never" },
  ],
};

function EventTypesEditor({ r }: { r: Webhook }) {
  const canEdit = useCan("integrations.webhook.edit");
  const [text, setText] = useState(r.eventTypes.join(", "));
  const save = useMutation({
    mutationFn: () => webhooksApi.webhooks.update(r.id, { eventTypes: text.split(",").map((s) => s.trim()).filter(Boolean) }, r.version),
    onSuccess: () => toast.success("Event types saved"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="card p-4">
      <h2 className="font-semibold mb-3">Event types</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Comma-separated domain event names, e.g. InvoicePosted, SalesOrderConfirmed.</p>
      <input className="input-base" disabled={!canEdit} value={text} onChange={(e) => setText(e.target.value)} />
      {canEdit && <div className="mt-3"><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save</button></div>}
    </section>
  );
}

export const webhooks: MasterConfig<Webhook> = {
  entityType: "integrations.webhook",
  permission: "integrations.webhook",
  plural: "Webhooks",
  singular: "Webhook",
  description: "POSTs a JSON payload to your URL when one of the chosen domain events happens.",
  route: "/settings/webhooks",
  client: webhooksApi.webhooks,
  defaultSort: "-createdAt",
  createHref: "/settings/webhooks/new",
  columns: [
    { key: "name", label: "Name" },
    { key: "url", label: "URL" },
    { key: "active", label: "Active", render: (r) => (r.active ? "Yes" : "No") },
    { key: "lastDeliveryStatus", label: "Last delivery", render: (r) => (r.lastDeliveryStatus ? <StatusBadge status={r.lastDeliveryStatus} /> : "—") },
  ],
  filters: [{ key: "active", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] }],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "url", label: "URL", type: "text", required: true },
    { key: "active", label: "Active", type: "boolean" },
  ],
  title: (r) => r.name,
  subtitle: (r) => r.url,
  status: (r) => (r.active ? "active" : "inactive"),
  details: (r) => [
    { label: "Event types", value: r.eventTypes.join(", ") },
    { label: "Last delivery", value: r.lastDeliveryAt ? formatDateTime(r.lastDeliveryAt) : "Never" },
    { label: "Last delivery error", value: r.lastDeliveryError },
  ],
  extra: (r) => <EventTypesEditor r={r} />,
};

export const INTEGRATIONS_SCREENS: Record<string, MasterConfig<never>> = {
  "api-keys": apiKeys as unknown as MasterConfig<never>,
  webhooks: webhooks as unknown as MasterConfig<never>,
};
