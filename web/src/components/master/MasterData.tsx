"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, ArrowLeft, Archive, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { BaseRecord, CrudClient, errorMessage } from "@/lib/api";
import { formatDateTime, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { Column, DataTable, Filter } from "@/components/data/DataTable";
import { FieldDef, FormValues, SchemaForm, toBody } from "@/components/forms/SchemaForm";
import { ConfirmDialog, Drawer, ErrorState, PageHeader, Spinner, StatusBadge, Tabs } from "@/components/ui/kit";
import { ActivityPanel, FilesPanel, RelatedPanel, TagsEditor, useUserName } from "@/components/record/panels";

export interface MasterConfig<T extends BaseRecord> {
  /** Record type, e.g. "org.branch". */
  entityType: string;
  /** Permission prefix, e.g. "org.branch". */
  permission: string;
  plural: string;
  singular: string;
  description?: string;
  /** Staff-app route of the list, e.g. "/org/branches". */
  route: string;
  client: CrudClient<T>;
  columns: Column<T>[];
  filters?: Filter[];
  defaultSort?: string;
  fields: FieldDef[];
  /** Initial form values when editing; defaults to the record's own field values. */
  toForm?: (row: T) => FormValues;
  defaults?: FormValues;
  title: (row: T) => string;
  subtitle?: (row: T) => string | null;
  status?: (row: T) => string | null;
  /** Rows shown in the Details tab. */
  details?: (row: T) => { label: string; value: React.ReactNode }[];
  /** Extra content under the details (e.g. fiscal periods). */
  extra?: (row: T) => React.ReactNode;
}

function formFrom<T extends BaseRecord>(config: MasterConfig<T>, row: T): FormValues {
  if (config.toForm) return { ...config.toForm(row), customFields: row.customFields ?? {} };
  const values: FormValues = { customFields: row.customFields ?? {} };
  const record = row as unknown as Record<string, unknown>;
  for (const f of config.fields) values[f.key] = record[f.key] ?? (f.type === "users" ? [] : "");
  return values;
}

export function MasterListPage<T extends BaseRecord>({ config }: { config: MasterConfig<T> }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const canCreate = useCan(`${config.permission}.create`);
  const [open, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: (values: FormValues) => config.client.create(toBody(config.fields, values, "create")),
    onSuccess: (row) => {
      toast.success(`${config.singular} created`);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: [config.entityType] });
      router.push(`${config.route}/${row.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const newButton = canCreate ? (
    <button className="btn-primary" onClick={() => setOpen(true)}>
      <Plus size={16} />
      New {config.singular.toLowerCase()}
    </button>
  ) : null;

  return (
    <div>
      <PageHeader title={config.plural} subtitle={config.description} actions={newButton} />
      <DataTable<T>
        entityType={config.entityType}
        queryKey={[config.entityType, "list"]}
        fetchPage={config.client.list}
        columns={config.columns}
        filters={config.filters}
        defaultSort={config.defaultSort}
        rowHref={(row) => `${config.route}/${row.id}`}
        emptyTitle={`No ${config.plural.toLowerCase()} yet`}
        emptyAction={newButton}
      />
      <Drawer
        open={open}
        title={`New ${config.singular.toLowerCase()}`}
        onClose={() => setOpen(false)}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="create-form" disabled={create.isPending}>
              {create.isPending && <Spinner size={14} className="text-white" />}
              Create
            </button>
          </>
        }
      >
        <SchemaForm id="create-form" entityType={config.entityType} fields={config.fields} initial={config.defaults ?? {}} mode="create" onSubmit={(v) => create.mutate(v)} />
      </Drawer>
    </div>
  );
}

type RecordTab = "details" | "activity" | "files" | "related";

export function MasterRecordPage<T extends BaseRecord>({ config, id }: { config: MasterConfig<T>; id: string }) {
  const queryClient = useQueryClient();
  const userName = useUserName();
  const canEdit = useCan(`${config.permission}.edit`);
  const canArchive = useCan(`${config.permission}.delete`);
  const [tab, setTab] = useState<RecordTab>("details");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const record = useQuery({ queryKey: [config.entityType, "one", id], queryFn: () => config.client.get(id) });

  const refresh = (row: T) => {
    queryClient.setQueryData([config.entityType, "one", id], row);
    queryClient.invalidateQueries({ queryKey: [config.entityType, "list"] });
    queryClient.invalidateQueries({ queryKey: ["activity", config.entityType, id] });
  };
  const update = useMutation({
    mutationFn: (values: FormValues) => config.client.update(id, toBody(config.fields, values, "edit"), record.data?.version),
    onSuccess: (row) => {
      toast.success("Saved");
      setEditing(false);
      refresh(row);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const archive = useMutation({
    mutationFn: (reason: string) => (record.data?.archivedAt ? config.client.restore(id) : config.client.archive(id, reason || undefined)),
    onSuccess: (row) => {
      setConfirming(false);
      toast.success(row.archivedAt ? "Archived" : "Restored");
      refresh(row);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (record.isLoading) return <div className="py-20 flex justify-center"><Spinner /></div>;
  if (record.isError) return <ErrorState message={errorMessage(record.error)} onRetry={() => record.refetch()} />;
  const row = record.data!;
  const status = row.archivedAt ? "archived" : config.status?.(row);
  const custom = Object.entries(row.customFields ?? {});

  return (
    <div className="max-w-5xl">
      <Link href={config.route} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3">
        <ArrowLeft size={14} /> {config.plural}
      </Link>
      <PageHeader
        title={config.title(row)}
        subtitle={config.subtitle?.(row) ?? undefined}
        actions={
          <>
            {status && <StatusBadge status={status} />}
            {canEdit && !row.archivedAt && (
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                <Pencil size={15} /> Edit
              </button>
            )}
            {canArchive && (
              <button className="btn-ghost" onClick={() => setConfirming(true)}>
                {row.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                {row.archivedAt ? "Restore" : "Archive"}
              </button>
            )}
          </>
        }
      />
      <div className="mb-4">
        <TagsEditor type={config.entityType} id={id} canEdit={canEdit} />
      </div>
      <Tabs<RecordTab>
        tabs={[
          { key: "details", label: "Details" },
          { key: "activity", label: "Activity" },
          { key: "files", label: "Files" },
          { key: "related", label: "Related" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-4">
        {tab === "details" && (
          <div className="space-y-4">
            <dl className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {(config.details?.(row) ?? []).map((d) => (
                <div key={d.label}>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">{d.label}</dt>
                  <dd className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">{d.value ?? "—"}</dd>
                </div>
              ))}
              {custom.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">{humanize(k)}</dt>
                  <dd className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Created</dt>
                <dd className="text-sm mt-0.5">
                  {formatDateTime(row.createdAt)} by {userName(row.createdBy)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Last changed</dt>
                <dd className="text-sm mt-0.5">
                  {formatDateTime(row.updatedAt)} by {userName(row.updatedBy)}
                </dd>
              </div>
            </dl>
            {config.extra?.(row)}
          </div>
        )}
        {tab === "activity" && <ActivityPanel type={config.entityType} id={id} />}
        {tab === "files" && <FilesPanel type={config.entityType} id={id} canEdit={canEdit} />}
        {tab === "related" && <RelatedPanel type={config.entityType} id={id} />}
      </div>

      <Drawer
        open={editing}
        title={`Edit ${config.singular.toLowerCase()}`}
        onClose={() => setEditing(false)}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="edit-form" disabled={update.isPending}>
              {update.isPending && <Spinner size={14} className="text-white" />}
              Save
            </button>
          </>
        }
      >
        {editing && <SchemaForm id="edit-form" entityType={config.entityType} fields={config.fields} initial={formFrom(config, row)} mode="edit" onSubmit={(v) => update.mutate(v)} />}
      </Drawer>
      <ConfirmDialog
        open={confirming}
        title={row.archivedAt ? `Restore this ${config.singular.toLowerCase()}?` : `Archive this ${config.singular.toLowerCase()}?`}
        body={row.archivedAt ? undefined : "It disappears from lists and pickers but keeps its history. You can restore it later."}
        confirmLabel={row.archivedAt ? "Restore" : "Archive"}
        danger={!row.archivedAt}
        reason={row.archivedAt ? undefined : "optional"}
        busy={archive.isPending}
        onConfirm={(reason) => archive.mutate(reason)}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
