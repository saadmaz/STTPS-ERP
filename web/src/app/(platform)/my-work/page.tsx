"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { approvalsApi, ApprovalRequest, errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, Spinner, StatusBadge, Tabs } from "@/components/ui/kit";

type Tab = "waiting" | "submitted";

function RequestList({ scope }: { scope: Tab }) {
  const list = useQuery({ queryKey: ["approvals", scope], queryFn: () => approvalsApi.list(scope) });
  if (list.isLoading) return <div className="py-12 flex justify-center"><Spinner /></div>;
  if (list.isError) return <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />;
  const rows: ApprovalRequest[] = list.data!;
  if (rows.length === 0) return <EmptyState title={scope === "waiting" ? "Nothing waiting for you" : "You have not submitted anything for approval"} />;
  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Record</th>
            <th>Workflow</th>
            <th>Step</th>
            <th>Status</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/approvals/${r.id}`} className="font-medium text-blue-700 dark:text-blue-400 hover:underline">
                  {r.entityLabel}
                </Link>
              </td>
              <td>{r.definitionName}</td>
              <td>{r.steps[r.currentStep]?.name ?? "—"}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td>{timeAgo(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MyWork() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "submitted" ? "submitted" : "waiting");
  return (
    <div>
      <PageHeader title="My Work" subtitle="Approvals waiting for you and requests you have submitted" />
      <Tabs<Tab>
        tabs={[
          { key: "waiting", label: "Waiting for me" },
          { key: "submitted", label: "Submitted by me" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-4">
        <RequestList scope={tab} />
      </div>
    </div>
  );
}

export default function MyWorkPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <MyWork />
    </Suspense>
  );
}
