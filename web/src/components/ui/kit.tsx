"use client";

import { useEffect, useId, useState } from "react";
import { clsx } from "clsx";
import { AlertTriangle, Inbox, Loader2, X } from "lucide-react";
import { humanize } from "@/lib/format";

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={clsx("animate-spin text-blue-600", className)} aria-label="Loading" />;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <Inbox size={32} className="text-slate-300 dark:text-slate-600 mb-3" />
      <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {body && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6" role="alert">
      <AlertTriangle size={28} className="text-red-500 mb-2" />
      <p className="text-sm text-slate-700 dark:text-slate-200">{message}</p>
      {onRetry && (
        <button className="btn-secondary mt-3" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  active: "badge-green",
  approved: "badge-green",
  open: "badge-green",
  ready: "badge-green",
  pending: "badge-yellow",
  soft_closed: "badge-yellow",
  waiting: "badge-slate",
  changes_requested: "badge-orange",
  rejected: "badge-red",
  locked: "badge-red",
  closed: "badge-slate",
  cancelled: "badge-slate",
  archived: "badge-slate",
  inactive: "badge-slate",
  skipped: "badge-slate",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={STATUS_TONES[status] ?? "badge-blue"}>{humanize(status)}</span>;
}

/** Side panel for create and edit forms. Closes on Escape. */
export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className={clsx("relative h-full w-full bg-white dark:bg-slate-900 shadow-xl flex flex-col", wide ? "max-w-2xl" : "max-w-lg")}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation dialog; optionally asks for a reason (rejections, archiving). */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  reason,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  reason?: "optional" | "required";
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const id = useId();
  if (!open) return null;
  const blocked = reason === "required" && !text.trim();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby={id}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative card w-full max-w-md p-5">
        <h2 id={id} className="font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        {body && <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{body}</p>}
        {reason && (
          <textarea
            className="input-base mt-3"
            rows={3}
            placeholder={reason === "required" ? "Reason (required)" : "Reason (optional)"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={danger ? "btn-danger" : "btn-primary"} disabled={blocked || busy} onClick={() => onConfirm(text.trim())}>
            {busy && <Spinner size={14} className="text-white" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="border-b border-slate-200 dark:border-slate-800 flex gap-1 overflow-x-auto" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={clsx(
            "px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap",
            active === t.key
              ? "border-blue-600 text-blue-700 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-xs text-slate-400">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string | null;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="form-label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
      {error && <span className="form-error block">{error}</span>}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-header gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="page-title truncate">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
