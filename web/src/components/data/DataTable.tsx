"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { ArrowDown, ArrowUp, Bookmark, Columns3, Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BaseRecord, errorMessage, ListParams, Page, recordsApi, SavedView } from "@/lib/api";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/kit";

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  /** Plain-text value for CSV export; defaults to the field value. */
  text?: (row: T) => string;
  sortable?: boolean;
  defaultHidden?: boolean;
  className?: string;
}

export interface Filter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface Props<T extends BaseRecord> {
  /** Record type for saved views, e.g. "org.branch". */
  entityType: string;
  queryKey: unknown[];
  fetchPage: (params: ListParams) => Promise<Page<T>>;
  columns: Column<T>[];
  rowHref?: (row: T) => string;
  filters?: Filter[];
  defaultSort?: string;
  emptyTitle?: string;
  emptyAction?: React.ReactNode;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function readHidden(entityType: string, columns: Column<unknown>[]): string[] {
  if (typeof window === "undefined") return columns.filter((c) => c.defaultHidden).map((c) => c.key);
  try {
    const saved = localStorage.getItem(`cols:${entityType}`);
    if (saved) return JSON.parse(saved);
  } catch {
    /* storage unavailable */
  }
  return columns.filter((c) => c.defaultHidden).map((c) => c.key);
}

/**
 * The standard list (blueprint §35): search, sorting, filters, archived
 * toggle, column chooser, saved views, cursor paging and CSV export of the
 * rows loaded so far.
 */
export function DataTable<T extends BaseRecord>({
  entityType,
  queryKey,
  fetchPage,
  columns,
  rowHref,
  filters = [],
  defaultSort,
  emptyTitle = "Nothing here yet",
  emptyAction,
}: Props<T>) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 300);
  const [sort, setSort] = useState<string | undefined>(defaultSort);
  const [where, setWhere] = useState<Record<string, string>>({});
  const [archived, setArchived] = useState(false);
  const [hidden, setHidden] = useState<string[]>(() => readHidden(entityType, columns as Column<unknown>[]));
  const [chooser, setChooser] = useState(false);

  const whereParam = Object.entries(where)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}:${encodeURIComponent(v)}`)
    .join(",");

  const list = useInfiniteQuery({
    queryKey: [...queryKey, { q, sort, where: whereParam, archived }],
    queryFn: ({ pageParam }) => fetchPage({ q, sort, where: whereParam || undefined, includeArchived: archived, cursor: pageParam, limit: 50 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const views = useQuery({ queryKey: ["views", entityType], queryFn: () => recordsApi.views(entityType) });

  const visible = columns.filter((c) => !hidden.includes(c.key));

  const toggleColumn = (key: string) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    setHidden(next);
    try {
      localStorage.setItem(`cols:${entityType}`, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const applyView = (view: SavedView) => {
    setSearch(view.config.q ?? "");
    setSort(view.config.sort ?? defaultSort);
    const parsed: Record<string, string> = {};
    for (const part of (view.config.where ?? "").split(",").filter(Boolean)) {
      const [k, ...v] = part.split(":");
      parsed[k!] = decodeURIComponent(v.join(":"));
    }
    setWhere(parsed);
    if (view.config.columns) setHidden(columns.map((c) => c.key).filter((k) => !view.config.columns!.includes(k)));
  };

  const saveView = async () => {
    const name = window.prompt("Name this view");
    if (!name?.trim()) return;
    try {
      await recordsApi.createView({ entityType, name, config: { q: search || undefined, sort, where: whereParam || undefined, columns: visible.map((c) => c.key) } });
      await queryClient.invalidateQueries({ queryKey: ["views", entityType] });
      toast.success("View saved");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const deleteView = async (view: SavedView) => {
    try {
      await recordsApi.deleteView(view.id);
      await queryClient.invalidateQueries({ queryKey: ["views", entityType] });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const exportCsv = () => {
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [
      visible.map((c) => escape(c.label)).join(","),
      ...rows.map((row) =>
        visible
          .map((c) => escape(c.text ? c.text(row) : String((row as unknown as Record<string, unknown>)[c.key] ?? "")))
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entityType}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: string) => setSort(sort === key ? `-${key}` : sort === `-${key}` ? undefined : key);

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className="input-base pl-8" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        </div>
        {filters.map((f) => (
          <select
            key={f.key}
            className="input-base w-auto"
            value={where[f.key] ?? ""}
            onChange={(e) => setWhere({ ...where, [f.key]: e.target.value })}
            aria-label={f.label}
          >
            <option value="">{f.label}: all</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 px-1">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          Archived
        </label>
        <div className="flex-1" />
        {(views.data?.length ?? 0) > 0 && (
          <select
            className="input-base w-auto"
            value=""
            onChange={(e) => {
              const view = views.data?.find((v) => v.id === e.target.value);
              if (view) applyView(view);
            }}
            aria-label="Saved views"
          >
            <option value="">Saved views…</option>
            {views.data!.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.shared ? " (shared)" : ""}
              </option>
            ))}
          </select>
        )}
        <button className="btn-ghost" onClick={saveView} title="Save view">
          <Bookmark size={16} />
        </button>
        <div className="relative">
          <button className="btn-ghost" onClick={() => setChooser(!chooser)} title="Columns">
            <Columns3 size={16} />
          </button>
          {chooser && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setChooser(false)} />
              <div className="absolute right-0 mt-1 z-20 card p-2 w-56 shadow-lg">
                {columns.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1 text-sm">
                    <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggleColumn(c.key)} />
                    {c.label}
                  </label>
                ))}
                {views.data?.filter((v) => !v.shared).map((v) => (
                  <button key={v.id} className="w-full flex items-center justify-between px-2 py-1 text-xs text-slate-500 hover:text-red-600" onClick={() => deleteView(v)}>
                    Delete view “{v.name}” <Trash2 size={12} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button className="btn-ghost" onClick={exportCsv} disabled={rows.length === 0} title="Export CSV">
          <Download size={16} />
        </button>
      </div>

      {list.isLoading ? (
        <div className="py-16 flex justify-center">
          <Spinner />
        </div>
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title={q || whereParam ? "No matches" : emptyTitle} action={!q && !whereParam ? emptyAction : undefined} />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                {visible.map((c) => (
                  <th key={c.key} className={c.className}>
                    {c.sortable ? (
                      <button className="inline-flex items-center gap-1 uppercase" onClick={() => toggleSort(c.key)}>
                        {c.label}
                        {sort === c.key && <ArrowUp size={12} />}
                        {sort === `-${c.key}` && <ArrowDown size={12} />}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={clsx(row.archivedAt && "opacity-60")}>
                  {visible.map((c, i) => {
                    const content = c.render ? c.render(row) : String((row as unknown as Record<string, unknown>)[c.key] ?? "—");
                    return (
                      <td key={c.key} className={c.className}>
                        {i === 0 && rowHref ? (
                          <Link href={rowHref(row)} className="font-medium text-blue-700 dark:text-blue-400 hover:underline">
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {list.hasNextPage && (
            <div className="p-3 flex justify-center">
              <button className="btn-secondary" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage && <Spinner size={14} />}
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
