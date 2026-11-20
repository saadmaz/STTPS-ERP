"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileText, MessageSquare, Pencil, Tag, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, filesApi, platformApi, recordsApi } from "@/lib/api";
import { formatBytes, formatDateTime, humanize, timeAgo } from "@/lib/format";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/kit";

/** Resolves user ids to names using the company directory. */
export function useUserName() {
  const { data = [] } = useQuery({ queryKey: ["directory"], queryFn: platformApi.directory, staleTime: 5 * 60_000 });
  return (id: string | null | undefined) => {
    if (!id) return "Unknown";
    if (id === "system") return "System";
    const u = data.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}` : "Former user";
  };
}

const KIND_ICON = { audit: Pencil, comment: MessageSquare, approval: CheckCircle2 } as const;

export function ActivityPanel({ type, id }: { type: string; id: string }) {
  const queryClient = useQueryClient();
  const name = useUserName();
  const [body, setBody] = useState("");
  const activity = useQuery({ queryKey: ["activity", type, id], queryFn: () => recordsApi.activity(type, id) });
  const comment = useMutation({
    mutationFn: () => recordsApi.addComment(type, id, body),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["activity", type, id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <form
        className="card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) comment.mutate();
        }}
      >
        <textarea className="input-base" rows={2} placeholder="Add a comment" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Comment" />
        <div className="flex justify-end mt-2">
          <button className="btn-primary" disabled={!body.trim() || comment.isPending}>
            {comment.isPending && <Spinner size={14} className="text-white" />}
            Comment
          </button>
        </div>
      </form>
      {activity.isLoading ? (
        <Spinner />
      ) : activity.isError ? (
        <ErrorState message={errorMessage(activity.error)} onRetry={() => activity.refetch()} />
      ) : (
        <ol className="space-y-3">
          {activity.data!.map((item, i) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={i} className="flex gap-3">
                <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Icon size={14} className="text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-200">
                    <span className="font-medium">{name(item.actorId)}</span>{" "}
                    <span className={item.kind === "comment" ? "" : "text-slate-600 dark:text-slate-400"}>
                      {item.kind === "comment" ? "" : item.summary}
                    </span>
                  </p>
                  {item.kind === "comment" && (
                    <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300 mt-0.5">{item.summary.replace(/@\[([^\]]+)\]\(user:[^)]+\)/g, "@$1")}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5" title={formatDateTime(item.at)}>
                    {timeAgo(item.at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function FilesPanel({ type, id, canEdit }: { type: string; id: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const files = useQuery({ queryKey: ["files", type, id], queryFn: () => recordsApi.files(type, id) });
  const upload = useMutation({
    mutationFn: (file: File) => filesApi.upload(type, id, file),
    onSuccess: () => {
      toast.success("File uploaded");
      queryClient.invalidateQueries({ queryKey: ["files", type, id] });
      queryClient.invalidateQueries({ queryKey: ["activity", type, id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (fileId: string) => filesApi.remove(fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files", type, id] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const download = async (fileId: string) => {
    try {
      const { url } = await filesApi.downloadUrl(fileId);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="card">
      {canEdit && (
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex justify-end">
          <input ref={input} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
          <button className="btn-secondary" onClick={() => input.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Spinner size={14} /> : <Upload size={15} />}
            Upload
          </button>
        </div>
      )}
      {files.isLoading ? (
        <div className="p-6"><Spinner /></div>
      ) : files.isError ? (
        <ErrorState message={errorMessage(files.error)} />
      ) : files.data!.length === 0 ? (
        <EmptyState title="No files" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {files.data!.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-3">
              <FileText size={18} className="text-slate-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.name}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(f.size)} · v{f.fileVersion} · {timeAgo(f.createdAt)}
                </p>
              </div>
              <button className="btn-ghost" onClick={() => download(f.id)} title="Download">
                <Download size={16} />
              </button>
              {canEdit && (
                <button className="btn-ghost" onClick={() => remove.mutate(f.id)} title="Remove">
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RelatedPanel({ type, id }: { type: string; id: string }) {
  const related = useQuery({ queryKey: ["related", type, id], queryFn: () => recordsApi.related(type, id) });
  if (related.isLoading) return <Spinner />;
  if (related.isError) return <ErrorState message={errorMessage(related.error)} />;
  if (related.data!.length === 0) return <EmptyState title="No related records" />;
  return (
    <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
      {related.data!.map((r) => (
        <li key={r.linkId} className="px-4 py-3 text-sm flex items-center gap-2">
          <span className="badge-slate">{r.typeLabel}</span>
          <span className="text-slate-500">{humanize(r.relation)}</span>
          <Link href={r.link} className="text-blue-700 dark:text-blue-400 hover:underline">
            Open
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TagsEditor({ type, id, canEdit }: { type: string; id: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const tags = useQuery({ queryKey: ["tags", type, id], queryFn: () => recordsApi.tags(type, id) });
  const save = useMutation({
    mutationFn: (next: string[]) => recordsApi.setTags(type, id, next),
    onSuccess: (next) => queryClient.setQueryData(["tags", type, id], next),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const current = tags.data ?? [];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag size={14} className="text-slate-400" />
      {current.map((t) => (
        <span key={t} className="badge-blue gap-1">
          {t}
          {canEdit && (
            <button onClick={() => save.mutate(current.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) save.mutate([...current, draft.trim()]);
            setDraft("");
          }}
        >
          <input className="text-xs bg-transparent border-b border-dashed border-slate-300 dark:border-slate-600 focus:outline-none w-20" placeholder="Add tag" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </form>
      )}
    </div>
  );
}
