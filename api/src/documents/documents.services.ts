import { BadRequestException, Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { APPROVAL_COMPLETED, ApprovalCompletedPayload } from "../platform/approvals/approvals.models.js";
import { ApprovalsService } from "../platform/approvals/approvals.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { CreateDocumentDto, CreateFolderDto, CreateFromTemplateDto, UpdateDocumentDto, UpdateFolderDto } from "./documents.dto.js";
import { DOCUMENT_COLLECTIONS, DocumentDoc, DocumentFolderDoc } from "./documents.models.js";
import { ESignatureProvider, SIGNATURE_PROVIDER } from "./signature-provider.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

@Injectable()
export class DocumentFolderService extends MasterDataService<DocumentFolderDoc, CreateFolderDto, UpdateFolderDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "documents", entity: "folder", label: "Folder", collection: DOCUMENT_COLLECTIONS.folders, route: "/documents/folders",
      parentField: "parentId", customFields: false,
    });
  }

  protected toNew(dto: CreateFolderDto): NewDoc<DocumentFolderDoc> {
    return { name: dto.name, parentId: orNull(dto.parentId) };
  }

  protected searchEntry(doc: DocumentFolderDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: null };
  }
}

@Injectable()
export class DocumentService extends MasterDataService<DocumentDoc, CreateDocumentDto, UpdateDocumentDto> implements OnModuleInit {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly approvals: ApprovalsService,
    private readonly events: EventBusService,
    @Inject(SIGNATURE_PROVIDER) private readonly signatureProvider: ESignatureProvider,
  ) {
    super(fs, audit, unique, {
      module: "documents", entity: "document", label: "Document", collection: DOCUMENT_COLLECTIONS.documents, route: "/documents/records",
      references: [{ field: "folderId", collection: DOCUMENT_COLLECTIONS.folders, label: "Folder" }],
      filterFields: ["category", "status", "folderId", "isTemplate"], customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "documents.documentApproval", async (event) => {
      if (event.payload.entityType !== this.entityType) return;
      const ctx = { tenantId: event.tenantId, companyId: event.companyId, userId: event.payload.decidedBy };
      await this.firestore.runTransaction(async (tx) => {
        const doc = await this.repo.find(ctx, event.payload.entityId, tx);
        if (!doc || doc.status !== "pending_approval") return;
        this.repo.applyUpdate(ctx, tx, doc, { status: event.payload.outcome === "approved" ? "approved" : "draft" });
      });
    });
  }

  protected toNew(dto: CreateDocumentDto & { templateId?: string | null }): NewDoc<DocumentDoc> {
    return {
      title: dto.title, category: dto.category, folderId: orNull(dto.folderId), status: "draft",
      isTemplate: dto.isTemplate ?? false, templateId: dto.templateId ?? null, expiryDate: orNull(dto.expiryDate),
      signatureRequired: dto.signatureRequired ?? false, signatureStatus: "none", signatureProviderRef: null, notes: orNull(dto.notes),
    };
  }

  /** Copies a template's metadata into a new draft document; the file itself is uploaded separately, same as any other document. */
  async createFromTemplate(ctx: RequestContext, templateId: string, dto: CreateFromTemplateDto): Promise<DocumentDoc> {
    const template = await this.repo.get(ctx, templateId);
    if (!template.isTemplate) throw new BadRequestException("That document is not a template");
    return super.create(ctx, {
      title: dto.title, category: template.category, folderId: dto.folderId ?? template.folderId ?? undefined,
      signatureRequired: template.signatureRequired, notes: template.notes ?? undefined, templateId,
    } as CreateDocumentDto & { templateId: string });
  }

  /** Always goes through the approval engine; with no matching workflow for `documents.document` it auto-approves, same as every other `submit`. */
  async submitForApproval(ctx: RequestContext, id: string): Promise<DocumentDoc> {
    const doc = await this.repo.get(ctx, id);
    if (doc.status !== "draft") throw new BadRequestException(`A ${doc.status} document cannot be submitted`);
    const prepared = await this.approvals.prepare(ctx, {
      entityType: this.entityType, entityId: id, entityLabel: doc.title, link: `${this.config.route}/${id}`,
      facts: { category: doc.category },
    });
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const request = await this.approvals.open(tx, ctx, prepared);
      return this.repo.applyUpdate(ctx, tx, before, { status: request.status === "approved" ? "approved" : "pending_approval" }).after;
    });
  }

  /** Kicks off a signature request through whichever provider is configured; recording the outcome is always a staff action (see `recordSignatureOutcome`) until a provider with a real webhook is added. */
  async requestSignature(ctx: RequestContext, id: string): Promise<DocumentDoc> {
    const doc = await this.repo.get(ctx, id);
    if (doc.status !== "approved") throw new BadRequestException("Approve the document before requesting a signature");
    const { providerRef } = await this.signatureProvider.requestSignature({ id: doc.id, title: doc.title });
    return (await this.repo.update(ctx, id, { signatureStatus: "pending", signatureProviderRef: providerRef } as Patch<DocumentDoc>)).after;
  }

  async recordSignatureOutcome(ctx: RequestContext, id: string, outcome: "signed" | "declined"): Promise<DocumentDoc> {
    const doc = await this.repo.get(ctx, id);
    if (doc.signatureStatus !== "pending") throw new BadRequestException("No signature request is pending for this document");
    return (await this.repo.update(ctx, id, { signatureStatus: outcome } as Patch<DocumentDoc>)).after;
  }

  protected searchEntry(doc: DocumentDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.title, subtitle: doc.category };
  }
}
