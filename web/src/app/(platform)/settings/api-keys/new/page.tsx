"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { PageHeader, Field } from "@/components/ui/kit";
import { ApiKey, apiKeysApi } from "@/modules/platform/integrations";

export default function Page() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState("");
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState("120");
  const [secret, setSecret] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      apiKeysApi.keys.create({
        name,
        permissions: permissions.split(",").map((s) => s.trim()).filter(Boolean),
        rateLimitPerMinute: Number(rateLimitPerMinute) || 120,
      }) as unknown as Promise<{ apiKey: ApiKey; key: string }>,
    onSuccess: (r) => setSecret(r.key),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (secret) {
    return (
      <div className="max-w-xl mx-auto">
        <PageHeader title="API key created" subtitle="This is shown once — copy it now. You can't retrieve it again." />
        <div className="card p-4 space-y-3">
          <code className="block select-all break-all rounded bg-slate-100 dark:bg-slate-800 p-2 text-sm">{secret}</code>
          <button className="btn-primary" onClick={() => router.push("/settings/api-keys")}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title="New API key" subtitle="Grant exactly the permission codes an external system needs, nothing more." />
      <div className="card p-4 space-y-4">
        <Field label="Name"><input className="input-base" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Permission codes (comma-separated)"><input className="input-base" placeholder="crm.lead.view, sales.order.view" value={permissions} onChange={(e) => setPermissions(e.target.value)} /></Field>
        <Field label="Rate limit (requests per minute)"><input className="input-base" type="number" value={rateLimitPerMinute} onChange={(e) => setRateLimitPerMinute(e.target.value)} /></Field>
        <button className="btn-primary" disabled={!name || create.isPending} onClick={() => create.mutate()}>Create</button>
      </div>
    </div>
  );
}
