"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/kit";
import { portalErrorMessage, portalTicketsApi, TICKET_PRIORITIES } from "@/lib/portal-api";
import { humanize } from "@/lib/format";
import { usePortalGuard } from "@/modules/portal/useGuard";

export default function NewPortalTicketPage() {
  const ready = usePortalGuard();
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [busy, setBusy] = useState(false);

  if (!ready) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ticket = await portalTicketsApi.create({ subject, description: description || undefined, priority });
      toast.success(`Ticket ${ticket.number} opened`);
      router.push(`/portal/tickets/${ticket.id}`);
    } catch (err) {
      toast.error(portalErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button onClick={() => router.push("/portal/tickets")} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3">
        <ArrowLeft size={14} /> My tickets
      </button>
      <PageHeader title="New ticket" />
      <form onSubmit={onSubmit} className="card p-5 space-y-4">
        <div>
          <label className="form-label">Subject</label>
          <input className="input-base" required value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="form-label">What&apos;s going on?</label>
          <textarea className="input-base" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Priority</label>
          <select className="input-base" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}
          </select>
        </div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy && <Loader2 size={16} className="animate-spin" />}
          Open ticket
        </button>
      </form>
    </div>
  );
}
