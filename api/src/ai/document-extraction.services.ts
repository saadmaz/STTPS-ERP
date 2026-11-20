import { BadRequestException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { ExpenseClaimService } from "../finance/expenses.js";
import { CreateDraftDto, ExtractDocumentDto, UpdateDocumentExtractionDto } from "./document-extraction.dto.js";
import { DOCUMENT_EXTRACTION_COLLECTIONS, DocumentExtractionDoc } from "./document-extraction.models.js";
import { DocumentExtractorService } from "./document-extractor.services.js";

type ExtractInput = ExtractDocumentDto & { built?: { extractedData: Record<string, unknown>; error: string | null } };

@Injectable()
export class DocumentExtractionService extends MasterDataService<DocumentExtractionDoc, ExtractInput, UpdateDocumentExtractionDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly extractor: DocumentExtractorService,
    private readonly expenseClaims: ExpenseClaimService,
  ) {
    super(fs, audit, unique, {
      module: "ai", entity: "documentExtraction", label: "Document extraction", collection: DOCUMENT_EXTRACTION_COLLECTIONS.extractions,
      route: "/ai/document-extractions", filterFields: ["docType", "status"], customFields: false,
    });
  }

  async create(ctx: RequestContext, dto: ExtractDocumentDto): Promise<DocumentExtractionDoc> {
    const { extractedData, error } = await this.extractor.extract(dto.docType, dto.contentType, dto.fileBase64);
    return super.create(ctx, { ...dto, built: { extractedData, error } });
  }

  protected toNew(dto: ExtractInput): NewDoc<DocumentExtractionDoc> {
    const data = dto.built?.extractedData ?? {};
    return {
      docType: dto.docType, fileName: dto.fileName, status: dto.built?.error ? "failed" : "extracted",
      extractedData: data, reviewedData: data, draftEntityType: null, draftEntityId: null, error: dto.built?.error ?? null,
    };
  }

  protected toPatch(dto: UpdateDocumentExtractionDto): Patch<DocumentExtractionDoc> {
    return dto.reviewedData !== undefined ? ({ reviewedData: dto.reviewedData, status: "reviewed" } as Patch<DocumentExtractionDoc>) : ({} as Patch<DocumentExtractionDoc>);
  }

  protected searchEntry(doc: DocumentExtractionDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.fileName, subtitle: doc.docType };
  }

  /**
   * Only "receipt" → an expense claim draft is wired up in this version —
   * see CLAUDE.md §9's AI document processing note for why the other four
   * doc types aren't (each needs its own target-module mapping, not a
   * generic one).
   */
  async createDraft(ctx: RequestContext, id: string, dto: CreateDraftDto): Promise<DocumentExtractionDoc> {
    const doc = await this.repo.get(ctx, id);
    if (doc.draftEntityId) throw new BadRequestException("A draft was already created for this extraction");
    if (doc.docType !== "receipt") throw new BadRequestException(`Creating a draft record from a "${doc.docType}" extraction isn't supported yet — only "receipt" is wired up`);
    if (!dto.categoryId) throw new BadRequestException("categoryId is required to create an expense claim draft");
    const data = doc.reviewedData;
    const amount = String(data.totalAmount ?? data.amount ?? "0");
    const claim = await this.expenseClaims.create(ctx, {
      title: String(data.merchant ?? doc.fileName),
      lines: [{ categoryId: dto.categoryId, description: String(data.description ?? data.merchant ?? "Extracted receipt"), amount }],
    });
    return (await this.repo.update(ctx, id, { status: "draft_created", draftEntityType: "expenses.claim", draftEntityId: claim.id } as Patch<DocumentExtractionDoc>)).after;
  }
}
