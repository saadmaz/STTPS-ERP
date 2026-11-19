"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage, platformApi } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { ErrorState, PageHeader, Spinner } from "@/components/ui/kit";

const GROUPS: Record<string, string> = {
  platform: "Platform",
  core: "Core operations",
  finance: "Finance",
  people: "People",
  operations: "Operations",
  advanced: "Advanced operations",
  intelligence: "Intelligence",
};

export default function ModulesPage() {
  const queryClient = useQueryClient();
  const { context } = useWorkspace();
  const modules = useQuery({ queryKey: ["modules"], queryFn: platformApi.modules });
  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => platformApi.setModule(key, enabled),
    onSuccess: (next) => {
      queryClient.setQueryData(["modules"], next);
      queryClient.invalidateQueries({ queryKey: ["me-context"] });
      toast.success("Modules updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const isAdmin = !!context?.allPermissions;

  if (modules.isLoading) return <Spinner />;
  if (modules.isError) return <ErrorState message={errorMessage(modules.error)} />;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Modules" subtitle="Switch on the parts of the ERP your organisation uses. Switching a module off hides it but keeps its data." />
      {Object.entries(GROUPS).map(([group, label]) => {
        const items = modules.data!.filter((m) => m.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{label}</h2>
            <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((m) => (
                <li key={m.key} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-slate-500">{m.description}</p>
                  </div>
                  {m.core ? (
                    <span className="badge-blue">Always on</span>
                  ) : !m.available ? (
                    <span className="badge-slate">Coming soon</span>
                  ) : (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={m.enabled}
                        disabled={!isAdmin || toggle.isPending}
                        onChange={(e) => toggle.mutate({ key: m.key, enabled: e.target.checked })}
                      />
                      {m.enabled ? "On" : "Off"}
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
