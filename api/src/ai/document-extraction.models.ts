import type { BaseDoc } from "../platform/data/repository.js";

export const DOCUMENT_EXTRACTION_COLLECTIONS = { extractions: "aiDocumentExtractions" } as const;

export const DOCUMENT_TYPES = ["invoice", "receipt", "purchase_order", "cv", "bank_statement"] as const;
export const EXTRACTION_STATUSES = ["extracted", "reviewed", "draft_created", "failed"] as const;

export interface DocumentExtractionDoc extends BaseDoc {
  docType: (typeof DOCUMENT_TYPES)[number];
  fileName: string;
  status: (typeof EXTRACTION_STATUSES)[number];
  /** Claude's raw structured output — never posted anywhere on its own. */
  extractedData: Record<string, unknown>;
  /** The user's edited version; defaults to `extractedData` until reviewed. */
  reviewedData: Record<string, unknown>;
  /** Set once `create-draft` succeeds. */
  draftEntityType: string | null;
  draftEntityId: string | null;
  error: string | null;
}
