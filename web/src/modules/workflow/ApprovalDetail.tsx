"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Check, CircleDot, ExternalLink, MinusCircle, X } from "lucide-react";
import { toast } from "sonner";
import { approvalsApi, ApprovalRequest, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, humanize } from "@/lib/format";
import { ConfirmDialog, ErrorState, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { useUserName } from "@/components/record/panels";

type Action = "approve" | "reject" | "changes" | "cancel" | null;

export function ApprovalDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const name = useUserName();
  const [action, setAction] = useState<Action>(null);
  const request = useQuery({ queryKey: ["approval", id], queryFn: () => approvalsApi.get(id) });

  const act = useMutation({
    mutationFn: ({ kind, comment }: { kind: Exclude<Action, null>; comment: string }): Promise<ApprovalRequest> => {
      if (kind === "approve") return approvalsApi.approve(id, comment || undefined);
      if (kind === "reject") return approvalsApi.reject(id, comment);
      if (kind === "changes") return approvalsApi.requestChanges(id, comment);
      return approvalsApi.cancel(id, comment || undefined);
    },
    onSuccess: (row) => {
      queryClient.setQueryData(["approval", id], row);
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["my-work"] });
      setAction(null);
      toast.success(`Request ${humanize(row.status).toLowerCase()}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (request.isLoading) return <div className="py-20 flex justify-center"><Spinner /></div>;
  if (request.isError) return <ErrorState message={errorMessage(request.error)} onRetry={() => request.refetch()} />;
  const r = request.data!;
  const step = r.steps[r.currentStep];
  const pending = r.status === "pending";
  const isRequester = user?.id === r.requesterId;
  // Delegates are not listed as approvers, so offer the actions to anyone but the requester; the API decides.
  const canDecide = pending && !!user && !!step && !step.approvedBy.includes(user.id) && (step.approverIds.includes(user.id) || !isRequester);

  const dialog = {
    approve: { title: "Approve this request?", label: "Approve", reason: "optional" as const, danger: false },
    reject: { title: "Reject this request?", label: "Reject", reason: "required" as const, danger: true },
    changes: { title: "Ask for changes?", label: "Request changes", reason: "required" as const, danger: false },
    cancel: { title: "Withdraw this request?", label: "Withdraw", reason: "optional" as const, danger: true },
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={r.entityLabel}
        subtitle={`${r.definitionName} · submitted by ${name(r.requesterId)} on ${formatDateTime(r.createdAt)}`}
        actions={
          <>
            <StatusBadge status={r.status} />
            {r.link && (
              <Link href={r.link} className="btn-secondary">
                <ExternalLink size={15} /> Open record
              </Link>
            )}
          </>
        }
      />

      {pending && (
        <div className="card p-4 flex flex-wrap items-center gap-2">
          <p className="text-sm flex-1 min-w-[200px]">
            Waiting on <span className="font-medium">{step?.name}</span>
            {step && step.minApprovals > 1 && ` (${step.approvedBy.length} of ${step.minApprovals} approvals)`}
          </p>
          {canDecide && (
            <>
              <button className="btn-primary" onClick={() => setAction("approve")}>
                <Check size={15} /> Approve
              </button>
              <button className="btn-secondary" onClick={() => setAction("changes")}>
                Request changes
              </button>
              <button className="btn-danger" onClick={() => setAction("reject")}>
                <X size={15} /> Reject
              </button>
            </>
          )}
          {isRequester && (
            <button className="btn-ghost" onClick={() => setAction("cancel")}>
              Withdraw
            </button>
          )}
        </div>
      )}

      <section className="card p-5">
        <h2 className="font-semibold mb-4">Steps</h2>
        <ol className="space-y-4">
          {r.steps.map((s, i) => {
            const Icon = s.status === "approved" ? Check : s.status === "rejected" ? X : s.status === "skipped" ? MinusCircle : CircleDot;
            return (
              <li key={i} className="flex gap-3">
                <div
                  className={clsx(
                    "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
                    s.status === "approved" && "bg-green-100 text-green-700",
                    s.status === "rejected" && "bg-red-100 text-red-700",
                    s.status === "pending" && "bg-yellow-100 text-yellow-700",
                    (s.status === "waiting" || s.status === "skipped") && "bg-slate-100 text-slate-400 dark:bg-slate-800",
                  )}
                >
                  <Icon size={14} />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {s.name} <span className="ml-1"><StatusBadge status={s.status} /></span>
                    {s.escalated && <span className="ml-1 badge-orange">Escalated</span>}
                  </p>
                  {s.status !== "skipped" && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Approvers: {s.approverIds.map((a) => `${name(a)}${s.approvedBy.includes(a) ? " ✓" : ""}`).join(", ")}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold mb-4">Decisions</h2>
        {r.decisions.length === 0 ? (
          <p className="text-sm text-slate-500">No decisions yet.</p>
        ) : (
          <ul className="space-y-3">
            {r.decisions.map((d, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{name(d.userId)}</span>
                {d.onBehalfOf && <span className="text-slate-500"> for {name(d.onBehalfOf)}</span>} <span className="text-slate-600 dark:text-slate-400">{humanize(d.decision).toLowerCase()}</span>
                <span className="text-xs text-slate-400 ml-2">{formatDateTime(d.at)}</span>
                {d.comment && <p className="text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">{d.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {action && (
        <ConfirmDialog
          open
          title={dialog[action].title}
          confirmLabel={dialog[action].label}
          reason={dialog[action].reason}
          danger={dialog[action].danger}
          busy={act.isPending}
          onConfirm={(comment) => act.mutate({ kind: action, comment })}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}
