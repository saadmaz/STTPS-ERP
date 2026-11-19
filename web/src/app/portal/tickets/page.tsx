"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { formatDateTime, humanize } from "@/lib/format";
import { portalErrorMessage, portalTicketsApi } from "@/lib/portal-api";
import { ErrorState, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { usePortalGuard } from "@/modules/portal/useGuard";

export default function PortalTicketsPage() {
  const ready = usePortalGuard();
  const tickets = useQuery({ queryKey: ["portal", "tickets"], queryFn: portalTicketsApi.mine, enabled: ready });

  if (!ready) return null;
  return (
    <div>
      <PageHeader
        title="My tickets"
        actions={
          <Link href="/portal/tickets/new" className="btn-primary">
            <Plus size={16} /> New ticket
          </Link>
        }
      />
      {tickets.isLoading && <div className="py-16 flex justify-center"><Spinner /></div>}
      {tickets.isError && <ErrorState message={portalErrorMessage(tickets.error)} onRetry={() => tickets.refetch()} />}
      {tickets.data && (
        <div className="space-y-2">
          {tickets.data.items.map((t) => (
            <Link key={t.id} href={`/portal/tickets/${t.id}`} className="card p-4 flex items-center justify-between hover:border-blue-300 dark:hover:border-blue-700 block">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{t.subject}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t.number} · {formatDateTime(t.createdAt)} · {humanize(t.priority)} priority</p>
              </div>
              <StatusBadge status={t.status} />
            </Link>
          ))}
          {tickets.data.items.length === 0 && (
            <div className="card p-10 text-center text-sm text-slate-500">You haven&apos;t opened any tickets yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
