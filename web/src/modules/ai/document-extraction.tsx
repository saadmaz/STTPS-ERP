"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDateTime, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";

export const DOCUMENT_TYPES = ["invoice", "receipt", "purchase_order", "cv", "bank_statement"] as const;

export interface DocumentExtraction extends BaseRecord {
  docType: (typeof DOCUMENT_TYPES)[number]; fileName: string; status: "extracted" | "reviewed" | "draft_created" | "failed";
  extractedData: Record<string, unknown>; reviewedData: Record<string, unknown>; draftEntityType: string | null; draftEntityId: string | null; error: string | null;
}

export const extractionsApi = {
  extractions: crud<DocumentExtraction>("/ai/document-extractions"),
};

function ReviewAndDraft({ r }: { r: DocumentExtraction }) {
  const canEdit = useCan("ai.documentExtraction.edit");
  const [current, setCurrent] = useState(r);
  const [json, setJson] = useState(JSON.stringify(r.reviewedData, null, 2));
  const [draftOpen, setDraftOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");

  const save = useMutation({
    mutationFn: () => {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(json); } catch { throw new Error("That isn't valid JSON"); }
      return extractionsApi.extractions.update(current.id, { reviewedData: parsed }, current.version);
    },
    onSuccess: (d) => { toast.success("Review saved"); setCurrent(d); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const draft = useMutation({
    mutationFn: () => api.post<DocumentExtraction>(`/ai/document-extractions/${current.id}/create-draft`, { categoryId: categoryId || undefined }).then((res) => res.data),
    onSuccess: (d) => { setDraftOpen(false); toast.success("Draft created"); setCurrent(d); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Reviewed data</h2>
        {canEdit && current.status !== "draft_created" && (
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={save.isPending} onClick={() => save.mutate()}>Save review</button>
            <button className="btn-primary" onClick={() => setDraftOpen(true)}>Create draft</button>
          </div>
        )}
      </div>
      {current.error && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{current.error}</p>}
      <textarea className="input-base font-mono text-xs" rows={12} disabled={!canEdit || current.status === "draft_created"} value={json} onChange={(e) => setJson(e.target.value)} />
      {current.draftEntityId && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Draft: {current.draftEntityType} / {current.draftEntityId}</p>}
      <ConfirmDialog open={draftOpen} title="Create a draft record" confirmLabel="Create" busy={draft.isPending} onConfirm={() => draft.mutate()} onClose={() => setDraftOpen(false)}>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Only the &quot;receipt&quot; document type can become a draft record today (an expense claim). Other types are extraction-and-review only for now.</p>
        <Field label="Expense category id"><input className="input-base" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} /></Field>
      </ConfirmDialog>
    </section>
  );
}

export const documentExtractions: MasterConfig<DocumentExtraction> = {
  entityType: "ai.documentExtraction",
  permission: "ai.documentExtraction",
  plural: "Document extractions",
  singular: "Document extraction",
  description: "Upload an invoice, receipt, purchase order, CV or bank statement for AI extraction, review the fields, then turn it into a draft record.",
  route: "/ai/document-extractions",
  client: extractionsApi.extractions,
  defaultSort: "-createdAt",
  createHref: "/ai/document-extractions/new",
  columns: [
    { key: "fileName", label: "File" },
    { key: "docType", label: "Type", render: (r) => humanize(r.docType) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "createdAt", label: "Uploaded", render: (r) => formatDateTime(r.createdAt) },
  ],
  filters: [
    { key: "docType", label: "Type", options: DOCUMENT_TYPES.map((t) => ({ value: t, label: humanize(t) })) },
    { key: "status", label: "Status", options: ["extracted", "reviewed", "draft_created", "failed"].map((s) => ({ value: s, label: humanize(s) })) },
  ],
  fields: [],
  title: (r) => r.fileName,
  subtitle: (r) => humanize(r.docType),
  status: (r) => r.status,
  details: (r) => [{ label: "Type", value: humanize(r.docType) }, { label: "Status", value: humanize(r.status) }],
  extra: (r) => <ReviewAndDraft r={r} />,
};

export const AI_SCREENS: Record<string, MasterConfig<never>> = {
  "document-extractions": documentExtractions as unknown as MasterConfig<never>,
};
