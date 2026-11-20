"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, humanize } from "@/lib/format";
import { portalErrorMessage, portalTicketsApi } from "@/lib/portal-api";
import { ErrorState, Spinner, StatusBadge } from "@/components/ui/kit";
import { usePortalGuard } from "./useGuard";

export function PortalTicketDetail({ id }: { id: string }) {
  const ready = usePortalGuard();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const ticket = useQuery({ queryKey: ["portal", "ticket", id], queryFn: () => portalTicketsApi.get(id), enabled: ready });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["portal", "ticket", id] });

  const sendReply = useMutation({
    mutationFn: () => portalTicketsApi.reply(id, reply),
    onSuccess: () => { setReply(""); refresh(); },
    onError: (e) => toast.error(portalErrorMessage(e)),
  });
  const reopen = useMutation({
    mutationFn: () => portalTicketsApi.reopen(id),
    onSuccess: () => { toast.success("Reopened"); refresh(); },
    onError: (e) => toast.error(portalErrorMessage(e)),
  });
  const rate = useMutation({
    mutationFn: () => portalTicketsApi.rate(id, rating, comment || undefined),
    onSuccess: () => { toast.success("Thanks for the feedback"); refresh(); },
    onError: (e) => toast.error(portalErrorMessage(e)),
  });

  if (!ready) return null;
  if (ticket.isLoading) return <div className="py-16 flex justify-center"><Spinner /></div>;
  if (ticket.isError) return <ErrorState message={portalErrorMessage(ticket.error, "Ticket not found")} onRetry={() => ticket.refetch()} />;
  const t = ticket.data!;
  const closed = ["resolved", "closed"].includes(t.status);

  return (
    <div>
      <button onClick={() => router.push("/portal/tickets")} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3">
        <ArrowLeft size={14} /> My tickets
      </button>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t.subject}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t.number} · {humanize(t.priority)} priority</p>
        </div>
        <StatusBadge status={t.status} />
      </div>
      {t.description && <p className="card p-4 text-sm whitespace-pre-line mb-4">{t.description}</p>}

      <div className="space-y-3 mb-4">
        {t.replies.map((r, i) => (
          <div key={i} className={r.authorType === "staff" ? "card p-3" : "card p-3 bg-blue-50 dark:bg-blue-950/30 ml-6"}>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium">{r.authorType === "staff" ? "Support team" : "You"}</span>
              <span>{formatDateTime(r.at)}</span>
            </div>
            <p className="text-sm whitespace-pre-line">{r.body}</p>
          </div>
        ))}
      </div>

      {!closed && (
        <div className="card p-4 space-y-3">
          <textarea className="input-base" rows={3} placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="flex justify-end">
            <button className="btn-primary" disabled={!reply.trim() || sendReply.isPending} onClick={() => sendReply.mutate()}>
              {sendReply.isPending && <Loader2 size={14} className="animate-spin" />} Send reply
            </button>
          </div>
        </div>
      )}

      {closed && t.satisfactionRating == null && (
        <div className="card p-4 space-y-3">
          <p className="text-sm font-medium">How did we do?</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} aria-label={`${n} star`}>
                <Star size={22} className={n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
              </button>
            ))}
          </div>
          <textarea className="input-base" rows={2} placeholder="Any comments? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex justify-between">
            <button className="btn-ghost" disabled={reopen.isPending} onClick={() => reopen.mutate()}>Still need help? Reopen</button>
            <button className="btn-primary" disabled={!rating || rate.isPending} onClick={() => rate.mutate()}>Submit rating</button>
          </div>
        </div>
      )}

      {closed && t.satisfactionRating != null && (
        <div className="card p-4 flex items-center justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-300">You rated this {t.satisfactionRating} / 5. Thanks for the feedback.</p>
          <button className="btn-ghost" disabled={reopen.isPending} onClick={() => reopen.mutate()}>Reopen</button>
        </div>
      )}

      <p className="text-center mt-6">
        <Link href="/portal/tickets" className="text-sm text-blue-600 hover:underline">Back to my tickets</Link>
      </p>
    </div>
  );
}
