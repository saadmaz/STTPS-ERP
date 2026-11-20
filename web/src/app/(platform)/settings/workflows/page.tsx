"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useCan } from "@/lib/workspace";
import { DataTable } from "@/components/data/DataTable";
import { PageHeader, StatusBadge } from "@/components/ui/kit";
import { WorkflowDefinition, workflowsApi } from "@/modules/workflow/WorkflowEditor";

export default function WorkflowsPage() {
  const canCreate = useCan("workflow.definition.create");
  return (
    <div>
      <PageHeader
        title="Approval workflows"
        subtitle="Who approves what. Modules ask the matching workflow before a record moves on."
        actions={
          canCreate && (
            <Link href="/settings/workflows/new" className="btn-primary">
              <Plus size={16} /> New workflow
            </Link>
          )
        }
      />
      <DataTable<WorkflowDefinition>
        entityType="workflow.approvalDefinition"
        queryKey={["workflow.definition", "list"]}
        fetchPage={workflowsApi.list}
        defaultSort="priority"
        rowHref={(r) => `/settings/workflows/${r.id}`}
        columns={[
          { key: "name", label: "Name", sortable: true },
          { key: "entityType", label: "Applies to" },
          { key: "steps", label: "Steps", render: (r) => r.steps.length, text: (r) => String(r.steps.length) },
          { key: "priority", label: "Priority", sortable: true },
          { key: "isActive", label: "Status", render: (r) => <StatusBadge status={r.isActive ? "active" : "inactive"} /> },
        ]}
      />
    </div>
  );
}
