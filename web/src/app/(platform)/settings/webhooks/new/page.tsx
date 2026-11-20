"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { PageHeader, Field } from "@/components/ui/kit";
import { webhooksApi } from "@/modules/platform/integrations";

export default function Page() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [eventTypes, setEventTypes] = useState("");
  const create = useMutation({
    mutationFn: () => webhooksApi.webhooks.create({ name, url, eventTypes: eventTypes.split(",").map((s) => s.trim()).filter(Boolean) }),
    onSuccess: (w) => { toast.success("Webhook created"); router.push(`/settings/webhooks/${w.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title="New webhook" subtitle="POSTs a JSON payload to this URL for each event type you list." />
      <div className="card p-4 space-y-4">
        <Field label="Name"><input className="input-base" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="URL"><input className="input-base" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
        <Field label="Event types (comma-separated)"><input className="input-base" placeholder="InvoicePosted, SalesOrderConfirmed" value={eventTypes} onChange={(e) => setEventTypes(e.target.value)} /></Field>
        <button className="btn-primary" disabled={!name || !url || !eventTypes || create.isPending} onClick={() => create.mutate()}>Create</button>
      </div>
    </div>
  );
}
