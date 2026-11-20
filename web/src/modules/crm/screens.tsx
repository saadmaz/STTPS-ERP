"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { EmptyState, ErrorState, PageHeader, Spinner } from "@/components/ui/kit";
import { errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { CRM_SCREENS, crmApi, Opportunity, StagePicker, STAGES } from "./config";

export function CrmList({ entity }: { entity: string }) {
  const config = CRM_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function CrmRecord({ entity, id }: { entity: string; id: string }) {
  const config = CRM_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}

/** Kanban view of open deals by stage. */
export function PipelineBoard() {
  const queryClient = useQueryClient();
  const open = useQuery({ queryKey: ["crm.opportunity", "board"], queryFn: () => crmApi.opportunities.list({ limit: 200, sort: "-createdAt" }) });
  if (open.isLoading) return <Spinner />;
  if (open.isError) return <ErrorState message={errorMessage(open.error)} onRetry={() => open.refetch()} />;
  const rows = open.data!.items;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["crm.opportunity"] });

  return (
    <div>
      <PageHeader title="Pipeline" subtitle="Open and recently closed deals by stage" actions={<Link href="/crm/opportunities" className="btn-secondary">List view</Link>} />
      {rows.length === 0 ? (
        <EmptyState title="No opportunities yet" />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((stage) => {
            const items = rows.filter((o) => o.stage === stage);
            const total = items.reduce((a, o) => a + o.amount, 0);
            return (
              <section key={stage} className="w-72 shrink-0">
                <header className="flex items-baseline justify-between px-1 mb-2">
                  <h2 className="text-sm font-semibold">{humanize(stage)} <span className="text-slate-400 font-normal">{items.length}</span></h2>
                  {items[0] && <span className="text-xs text-slate-500">{formatMoney(total, items[0].currency)}</span>}
                </header>
                <ul className="space-y-2">
                  {items.map((o: Opportunity) => (
                    <li key={o.id} className="card p-3">
                      <Link href={`/crm/opportunities/${o.id}`} className="text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline">{o.name}</Link>
                      <p className="text-xs text-slate-500 mt-0.5">{formatMoney(o.amount, o.currency)} · {o.probability}% · {formatDate(o.expectedCloseDate)}</p>
                      <div className="mt-2">
                        <StagePicker opp={o} refresh={refresh} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface Analytics {
  leads: { total: number; byStatus: Record<string, number>; bySource: Record<string, number>; conversionRate: number };
  pipeline: Record<string, { count: number; amount: number; weighted: number }>;
  openPipelineAmount: number;
  winRate: number;
  averageSalesCycleDays: number | null;
  reps: Record<string, { won: number; wonAmount: number; open: number }>;
}

function Bars({ data }: { data: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <ul className="space-y-2">
      {Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => (
          <li key={k} className="text-sm">
            <div className="flex justify-between"><span>{humanize(k)}</span><span className="text-slate-500">{v}</span></div>
            <div className="h-2 rounded bg-slate-100 dark:bg-slate-800 mt-1">
              <div className="h-2 rounded bg-blue-500" style={{ width: `${(v / max) * 100}%` }} />
            </div>
          </li>
        ))}
    </ul>
  );
}

export function CrmDashboard() {
  const q = useQuery({ queryKey: ["crm-analytics"], queryFn: () => crmApi.analytics() as Promise<Analytics> });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const a = q.data!;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const kpis = [
    { label: "Leads", value: String(a.leads.total) },
    { label: "Lead conversion", value: pct(a.leads.conversionRate) },
    { label: "Open pipeline", value: formatMoney(a.openPipelineAmount, "LKR") },
    { label: "Win rate", value: pct(a.winRate) },
    { label: "Avg. sales cycle", value: a.averageSalesCycleDays === null ? "—" : `${a.averageSalesCycleDays} days` },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="CRM" subtitle="Leads, pipeline and results" actions={<Link href="/crm/pipeline" className="btn-secondary">Pipeline board</Link>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="stat-card">
            <p className="text-xl font-semibold">{k.value}</p>
            <p className="text-sm text-slate-500">{k.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Leads by status</h2>
          <Bars data={a.leads.byStatus} />
        </section>
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Leads by source</h2>
          <Bars data={a.leads.bySource} />
        </section>
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Pipeline by stage</h2>
          <ul className="space-y-2 text-sm">
            {STAGES.filter((s) => a.pipeline[s]).map((s) => (
              <li key={s} className="flex justify-between">
                <span>{humanize(s)} <span className="text-slate-400">({a.pipeline[s]!.count})</span></span>
                <span>{formatMoney(a.pipeline[s]!.amount, "LKR")}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 mt-3">Amounts in mixed currencies are shown as recorded.</p>
        </section>
      </div>
    </div>
  );
}
