"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { ErrorState, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { api } from "@/lib/api";
import { HR_SCREENS, OrgChartNode } from "./config";

export function HrList({ entity }: { entity: string }) {
  const config = HR_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function HrRecord({ entity, id }: { entity: string; id: string }) {
  const config = HR_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}

function OrgChartTree({ node }: { node: OrgChartNode }) {
  return (
    <li>
      <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
        <Link className="font-medium text-blue-700 dark:text-blue-400 hover:underline" href={`/hr/employees/${node.id}`}>{node.name}</Link>
        <span className="text-xs text-slate-500">{node.employeeNumber}</span>
        {node.status !== "active" && <StatusBadge status={node.status} />}
      </div>
      {node.reports.length > 0 && (
        <ul className="mt-2 ml-6 space-y-2 border-l border-slate-200 dark:border-slate-800 pl-4">
          {node.reports.map((r) => <OrgChartTree key={r.id} node={r} />)}
        </ul>
      )}
    </li>
  );
}

export function OrgChartPage() {
  const q = useQuery({ queryKey: ["hr-org-chart"], queryFn: () => api.get("/hr/employees/org-chart").then((r) => r.data as OrgChartNode[]) });
  return (
    <div className="space-y-6">
      <PageHeader title="Org chart" subtitle="The reporting line from the top." />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message="Could not load the org chart" /> : (
        <section className="card p-5 overflow-x-auto">
          {q.data!.length === 0 ? <p className="text-sm text-slate-500">No one is set up yet.</p> : (
            <ul className="space-y-2">{q.data!.map((n) => <OrgChartTree key={n.id} node={n} />)}</ul>
          )}
        </section>
      )}
    </div>
  );
}
