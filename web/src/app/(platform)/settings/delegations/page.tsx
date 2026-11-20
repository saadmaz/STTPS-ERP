"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { delegationsApi } from "@/modules/settings/config";
import { SchemaForm } from "@/components/forms/SchemaForm";
import { Drawer, EmptyState, ErrorState, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { useUserName } from "@/components/record/panels";

export default function DelegationsPage() {
  const queryClient = useQueryClient();
  const name = useUserName();
  const [open, setOpen] = useState(false);
  const list = useQuery({ queryKey: ["my-delegations"], queryFn: delegationsApi.mine });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["my-delegations"] });
  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      delegationsApi.create({ delegateUserId: v.delegateUserId as string, startDate: v.startDate as string, endDate: v.endDate as string, reason: (v.reason as string) || undefined }),
    onSuccess: () => {
      toast.success("Delegation saved");
      setOpen(false);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const end = useMutation({ mutationFn: delegationsApi.end, onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="My delegations"
        subtitle="While you are away, someone else can approve requests on your behalf. Their decisions are recorded as made for you."
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Delegate
          </button>
        }
      />
      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} />
      ) : list.data!.length === 0 ? (
        <EmptyState title="No delegations" body="Set one up before you go on leave." />
      ) : (
        <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
          {list.data!.map((d) => {
            const status = d.archivedAt ? "cancelled" : d.endDate < today ? "closed" : d.startDate > today ? "waiting" : "active";
            return (
              <li key={d.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{name(d.delegateUserId)}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(d.startDate)} to {formatDate(d.endDate)}
                    {d.reason ? ` · ${d.reason}` : ""}
                  </p>
                </div>
                <StatusBadge status={status} />
                {(status === "active" || status === "waiting") && (
                  <button className="btn-ghost" onClick={() => end.mutate(d.id)}>
                    End
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Drawer
        open={open}
        title="Delegate my approvals"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="delegation-form" disabled={create.isPending}>
              Save
            </button>
          </>
        }
      >
        <SchemaForm
          id="delegation-form"
          mode="create"
          initial={{ startDate: today, endDate: today }}
          fields={[
            { key: "delegateUserId", label: "Delegate to", type: "user", required: true, wide: true },
            { key: "startDate", label: "From", type: "date", required: true },
            { key: "endDate", label: "Until", type: "date", required: true },
            { key: "reason", label: "Reason", type: "text", wide: true },
          ]}
          onSubmit={(v) => create.mutate(v)}
        />
      </Drawer>
    </div>
  );
}
