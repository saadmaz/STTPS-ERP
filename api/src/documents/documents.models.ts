import type { BaseDoc } from "../platform/data/repository.js";

export const DOCUMENT_COLLECTIONS = {
  folders: "documentFolders",
  documents: "documents",
} as const;

export const DOCUMENT_CATEGORIES = [
  "contract", "quotation", "invoice", "purchaseOrder", "supplierDocument", "employeeDocument",
  "policy", "certificate", "legal", "product", "project", "other",
] as const;

export const DOCUMENT_STATUSES = ["draft", "pending_approval", "approved", "rejected"] as const;
export const SIGNATURE_STATUSES = ["none", "pending", "signed", "declined"] as const;

/** A folder for organising documents; a document's own category/tags carry most of the filtering, so this stays a thin tree. */
export interface DocumentFolderDoc extends BaseDoc {
  name: string;
  parentId: string | null;
}

/**
 * Metadata and lifecycle for one document; the file bytes themselves live in
 * the existing generic Files feature (`/files/upload-url` with
 * `entityType: "documents.document"`), not duplicated here — version
 * history, preview and download are free because of that. Linking to another
 * record (the quote, the employee, the project this document belongs to)
 * is the existing generic related-records feature, for the same reason.
 */
export interface DocumentDoc extends BaseDoc {
  title: string;
  category: (typeof DOCUMENT_CATEGORIES)[number];
  folderId: string | null;
  status: (typeof DOCUMENT_STATUSES)[number];
  isTemplate: boolean;
  /** The template this was created from, if any. */
  templateId: string | null;
  expiryDate: string | null;
  signatureRequired: boolean;
  signatureStatus: (typeof SIGNATURE_STATUSES)[number];
  signatureProviderRef: string | null;
  notes: string | null;
}
