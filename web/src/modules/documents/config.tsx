"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui/kit";

export const DOCUMENT_CATEGORIES = [
  "contract", "quotation", "invoice", "purchaseOrder", "supplierDocument", "employeeDocument",
  "policy", "certificate", "legal", "product", "project", "other",
] as const;

export interface DocumentFolder extends BaseRecord {
  name: string;
  parentId: string | null;
}
export interface Document extends BaseRecord {
  title: string;
  category: (typeof DOCUMENT_CATEGORIES)[number];
  folderId: string | null;
  status: "draft" | "pending_approval" | "approved" | "rejected";
  isTemplate: boolean;
  templateId: string | null;
  expiryDate: string | null;
  signatureRequired: boolean;
  signatureStatus: "none" | "pending" | "signed" | "declined";
  signatureProviderRef: string | null;
  notes: string | null;
}

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const documentsApi = {
  folders: crud<DocumentFolder>("/documents/folders"),
  documents: crud<Document>("/documents/records"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

const folderOptions = {
  queryKey: ["options", "documents.folder"],
  load: async () => (await documentsApi.folders.list({ limit: 200 })).items.map((f) => ({ value: f.id, label: f.name })),
};

function expiryLabel(value: string | null): { text: string; soon: boolean } | null {
  if (!value) return null;
  const days = Math.round((new Date(`${value}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `Expired ${formatDate(value)}`, soon: true };
  if (days <= 30) return { text: `Expires in ${days}d`, soon: true };
  return { text: `Expires ${formatDate(value)}`, soon: false };
}

export const folders: MasterConfig<DocumentFolder> = {
  entityType: "documents.folder",
  permission: "documents.folder",
  plural: "Document folders",
  singular: "Folder",
  route: "/documents/folders",
  client: documentsApi.folders,
  columns: [
    { key: "name", label: "Name" },
    { key: "parentId", label: "Parent", render: (r) => r.parentId ?? "—" },
  ],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "parentId", label: "Parent folder", type: "reference", reference: folderOptions },
  ],
  title: (r) => r.name,
};

function DocumentActions({ r, refresh }: { r: Document; refresh: (d: Document) => void }) {
  const router = useRouter();
  const canEdit = useCan("documents.document.edit");
  const canCreate = useCan("documents.document.create");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(`${r.title} copy`);
  const onSuccess = (d: Document) => refresh(d);
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const submit = useMutation({ mutationFn: () => documentsApi.post<Document>(`/documents/records/${r.id}/submit`), onSuccess, onError });
  const requestSignature = useMutation({ mutationFn: () => documentsApi.post<Document>(`/documents/records/${r.id}/request-signature`), onSuccess, onError });
  const recordOutcome = useMutation({ mutationFn: (outcome: "signed" | "declined") => documentsApi.post<Document>(`/documents/records/${r.id}/signature-outcome`, { outcome }), onSuccess, onError });
  const fromTemplate = useMutation({
    mutationFn: () => documentsApi.post<Document>(`/documents/records/${r.id}/from-template`, { title: newTitle }),
    onSuccess: (d) => { setTemplateOpen(false); toast.success(`Created ${d.title}`); router.push(`/documents/records/${d.id}`); },
    onError,
  });

  return (
    <>
      {canEdit && r.status === "draft" && <button className="btn-primary" disabled={submit.isPending} onClick={() => submit.mutate()}>Submit for approval</button>}
      {canEdit && r.status === "approved" && r.signatureRequired && r.signatureStatus === "none" && (
        <button className="btn-ghost" disabled={requestSignature.isPending} onClick={() => requestSignature.mutate()}>Request signature</button>
      )}
      {canEdit && r.signatureStatus === "pending" && (
        <>
          <button className="btn-ghost" disabled={recordOutcome.isPending} onClick={() => recordOutcome.mutate("signed")}>Mark signed</button>
          <button className="btn-ghost" disabled={recordOutcome.isPending} onClick={() => recordOutcome.mutate("declined")}>Mark declined</button>
        </>
      )}
      {canCreate && r.isTemplate && <button className="btn-ghost" onClick={() => setTemplateOpen(true)}>Use as template</button>}
      <ConfirmDialog open={templateOpen} title="Create a document from this template" confirmLabel="Create" busy={fromTemplate.isPending} onClose={() => setTemplateOpen(false)} onConfirm={() => fromTemplate.mutate()}>
        <Field label="Title" required><input className="input-base" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  );
}

export const documents: MasterConfig<Document> = {
  entityType: "documents.document",
  permission: "documents.document",
  plural: "Documents",
  singular: "Document",
  description: "Contracts, certificates, policies and other documents, versioned through the Files tab.",
  route: "/documents/records",
  client: documentsApi.documents,
  defaultSort: "-createdAt",
  columns: [
    { key: "title", label: "Title" },
    { key: "category", label: "Category", render: (r) => humanize(r.category) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "expiryDate", label: "Expiry", render: (r) => expiryLabel(r.expiryDate)?.text ?? "—" },
  ],
  filters: [
    { key: "category", label: "Category", options: opts(DOCUMENT_CATEGORIES) },
    { key: "status", label: "Status", options: opts(["draft", "pending_approval", "approved", "rejected"]) },
    { key: "isTemplate", label: "Template", options: [{ value: "true", label: "Templates only" }] },
  ],
  fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "category", label: "Category", type: "select", options: opts(DOCUMENT_CATEGORIES), required: true },
    { key: "folderId", label: "Folder", type: "reference", reference: folderOptions },
    { key: "expiryDate", label: "Expiry date", type: "date" },
    { key: "signatureRequired", label: "Needs a signature", type: "boolean" },
    { key: "isTemplate", label: "This is a template", type: "boolean", createOnly: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  editable: (r) => r.status === "draft",
  title: (r) => r.title,
  subtitle: (r) => (r.isTemplate ? "Template" : humanize(r.category)),
  status: (r) => r.status,
  actions: (r, refresh) => <DocumentActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Expiry", value: expiryLabel(r.expiryDate)?.text ?? null },
    { label: "Signature", value: r.signatureRequired ? humanize(r.signatureStatus) : "Not required" },
    { label: "From template", value: r.templateId },
    { label: "Notes", value: r.notes },
  ],
};

export const DOCUMENTS_SCREENS: Record<string, MasterConfig<never>> = {
  folders: folders as unknown as MasterConfig<never>,
  records: documents as unknown as MasterConfig<never>,
};
