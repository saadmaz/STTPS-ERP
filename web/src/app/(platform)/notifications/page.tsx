"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { errorMessage, notificationsApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, Spinner, Tabs } from "@/components/ui/kit";

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const list = useQuery({ queryKey: ["notifications", "page", tab], queryFn: () => notificationsApi.list(tab === "unread") });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        actions={
          <button className="btn-secondary" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            Mark all read
          </button>
        }
      />
      <Tabs
        tabs={[
          { key: "all" as const, label: "All" },
          { key: "unread" as const, label: "Unread" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-4">
        {list.isLoading ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : list.data!.length === 0 ? (
          <EmptyState title="You're all caught up" />
        ) : (
          <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
            {list.data!.map((n) => (
              <li key={n.id}>
                <button
                  className={clsx("w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800", !n.readAt && "bg-blue-50/60 dark:bg-blue-950/30")}
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                    if (n.link) router.push(n.link);
                  }}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{n.body}</p>}
                  <p className="text-xs text-slate-400 mt-1">{formatDateTime(n.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
