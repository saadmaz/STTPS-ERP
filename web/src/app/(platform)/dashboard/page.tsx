"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCircle2, Clock } from "lucide-react";
import { platformApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";

function Kpi({ label, value, href, icon: Icon }: { label: string; value: number | undefined; href: string; icon: React.ElementType }) {
  return (
    <Link href={href} className="stat-card flex items-center gap-4 hover:border-blue-300 transition-colors">
      <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
        <Icon size={20} className="text-blue-600" />
      </div>
      <div>
        <p className="text-2xl font-semibold">{value ?? <Spinner size={16} />}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { user, activeCompany } = useAuth();
  const work = useQuery({ queryKey: ["my-work"], queryFn: platformApi.work, enabled: !!activeCompany });
  const modules = useQuery({ queryKey: ["modules"], queryFn: platformApi.modules });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <PageHeader title={`${greeting}, ${user?.firstName ?? ""}`} subtitle={activeCompany?.name} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label="Approvals waiting for you" value={work.data?.approvalsWaiting.length} href="/my-work" icon={CheckCircle2} />
        <Kpi label="Your open requests" value={work.data?.myOpenRequests.length} href="/my-work?tab=submitted" icon={Clock} />
        <Kpi label="Unread notifications" value={work.data?.unreadNotifications} href="/notifications" icon={Bell} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="card">
          <h2 className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold">Waiting for you</h2>
          {(work.data?.approvalsWaiting ?? []).length === 0 ? (
            <p className="px-5 py-8 text-sm text-center text-slate-500">Nothing needs your approval.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {work.data!.approvalsWaiting.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link href={`/approvals/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.entityLabel}</p>
                      <p className="text-xs text-slate-500">
                        {r.definitionName} · {timeAgo(r.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold">Modules</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800">
            {(modules.data ?? []).map((m) => (
              <li key={m.key} className="bg-white dark:bg-slate-900 px-5 py-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  {m.name}
                  {!m.available ? <span className="badge-slate">Coming soon</span> : m.enabled ? <span className="badge-green">On</span> : <span className="badge-slate">Off</span>}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
