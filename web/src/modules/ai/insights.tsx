"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { humanize } from "@/lib/format";
import { PageHeader } from "@/components/ui/kit";

interface Insight { type: string; severity: "info" | "warning"; message: string }
interface InsightsResult { insights: Insight[]; summary: string }

export function AiInsights() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["ai-insights"], queryFn: () => api.get<InsightsResult>("/ai/insights/run").then((r) => r.data) });

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="AI insights" subtitle="Automatically detected signals from your own data: sales decline and unusually large expense claims." actions={<button className="btn-ghost" onClick={() => refetch()}>Refresh</button>} />
      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {data && (
        <div className="space-y-4">
          <div className="card p-4 text-sm">{data.summary}</div>
          {data.insights.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nothing flagged right now.</p>}
          {data.insights.map((i, idx) => (
            <div key={idx} className={`card p-3 text-sm ${i.severity === "warning" ? "border-amber-400 dark:border-amber-600" : ""}`}>
              <span className="font-medium">{humanize(i.type)}:</span> {i.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
