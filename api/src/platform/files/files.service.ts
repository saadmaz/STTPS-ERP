import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { AuditService } from "../audit/audit.service.js";
import { hasPermission, RequestContext } from "../context/request-context.js";
import { BaseDoc, TenantRepository } from "../data/repository.js";
import { RecordsService } from "../records/records.service.js";
import { recordType } from "../records/record-types.js";
import { ObjectStorageProvider } from "./object-storage.js";

export const FILES_COLLECTION = "files";

export interface FileDoc extends BaseDoc {
  entityType: string;
  entityId: string;
  name: string;
  contentType: string;
  size: number;
  storageKey: string;
  status: "pending" | "ready";
  /** The file this one replaced (a new version of the same document). */
  previousVersionId: string | null;
  /** Set on older versions once replaced. */
  supersededBy: string | null;
  fileVersion: number;
}

/** Served as plain downloads, never rendered inline, because they can run script. */
const UNSAFE_TYPES = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/javascript|application\/javascript|application\/x-sh)/i;
const UPLOAD_TTL_SECONDS = 15 * 60;
const DOWNLOAD_TTL_SECONDS = 5 * 60;

function maxBytes(): number {
  return Number(process.env.FILE_MAX_BYTES ?? 50 * 1024 * 1024);
}

/**
 * Files attached to records (blueprint §21). The browser uploads straight to
 * object storage with a short-lived presigned URL; the API records metadata,
 * checks permissions on the owning record and verifies the upload.
 */
@Injectable()
export class FilesService {
  readonly files: TenantRepository<FileDoc>;

  constructor(
    firestore: FirestoreService,
    private readonly audit: AuditService,
    private readonly records: RecordsService,
    private readonly storage: ObjectStorageProvider,
  ) {
    this.files = new TenantRepository(firestore, FILES_COLLECTION, "File");
  }

  async requestUpload(
    ctx: RequestContext,
    input: { entityType: string; entityId: string; name: string; contentType: string; size: number; replacesFileId?: string },
  ): Promise<{ file: FileDoc; uploadUrl: string; headers: Record<string, string>; expiresInSeconds: number }> {
    await this.records.assertAccess(ctx, input.entityType, input.entityId, "edit");
    if (input.size <= 0 || input.size > maxBytes()) throw new BadRequestException(`Files must be between 1 byte and ${Math.round(maxBytes() / 1048576)} MB`);
    const name = sanitizeName(input.name);
    let previous: FileDoc | null = null;
    if (input.replacesFileId) {
      previous = await this.files.get(ctx, input.replacesFileId);
      if (previous.entityType !== input.entityType || previous.entityId !== input.entityId) throw new BadRequestException("Can only replace a file of the same record");
      if (previous.supersededBy) throw new BadRequestException("That file has already been replaced");
    }
    const id = this.files.newId();
    const storageKey = `${ctx.tenantId}/${ctx.companyId}/${input.entityType}/${input.entityId}/${id}`;
    const file = await this.files.create(ctx, {
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      name,
      contentType: input.contentType || "application/octet-stream",
      size: input.size,
      storageKey,
      status: "pending",
      previousVersionId: previous?.id ?? null,
      supersededBy: null,
      fileVersion: (previous?.fileVersion ?? 0) + 1,
    });
    const uploadUrl = await this.storage.storage.presign({ method: "PUT", key: storageKey, expiresSeconds: UPLOAD_TTL_SECONDS, contentType: file.contentType });
    return { file, uploadUrl, headers: { "Content-Type": file.contentType }, expiresInSeconds: UPLOAD_TTL_SECONDS };
  }

  /** Confirms the object arrived with the declared size, then makes the file visible. */
  async completeUpload(ctx: RequestContext, id: string): Promise<FileDoc> {
    const file = await this.files.get(ctx, id);
    if (file.createdBy !== ctx.userId) throw new ForbiddenException("Only the uploader can complete this upload");
    if (file.status === "ready") return file;
    const object = await this.storage.storage.head(file.storageKey);
    if (!object) throw new BadRequestException("The upload has not arrived yet");
    if (object.size !== file.size) throw new BadRequestException(`Uploaded size ${object.size} does not match the declared ${file.size}`);
    const { after } = await this.files.update(ctx, id, { status: "ready" });
    if (file.previousVersionId) await this.files.update(ctx, file.previousVersionId, { supersededBy: id });
    this.audit.record(ctx, { module: file.entityType.split(".")[0]!, action: "file_attached", entity: file.entityType, entityId: file.entityId, after: { fileId: id, name: file.name, version: file.fileVersion } });
    return after;
  }

  /** Current versions of a record's files (pass all=true for every version). */
  async forRecord(ctx: RequestContext, entityType: string, entityId: string, all = false): Promise<FileDoc[]> {
    await this.records.assertAccess(ctx, entityType, entityId, "view");
    const snap = await this.files.collection
      .where("companyId", "==", ctx.companyId)
      .where("entityType", "==", entityType)
      .where("entityId", "==", entityId)
      .get();
    return snap.docs
      .map((d) => d.data())
      .filter((f) => f.status === "ready" && f.archivedAt == null && (all || !f.supersededBy))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async downloadUrl(ctx: RequestContext, id: string): Promise<{ url: string; expiresInSeconds: number; name: string }> {
    const file = await this.files.get(ctx, id);
    await this.records.assertAccess(ctx, file.entityType, file.entityId, "view");
    if (file.status !== "ready") throw new BadRequestException("The file is still uploading");
    const url = await this.storage.storage.presign({
      method: "GET",
      key: file.storageKey,
      expiresSeconds: DOWNLOAD_TTL_SECONDS,
      downloadName: file.name,
      responseContentType: UNSAFE_TYPES.test(file.contentType) ? "application/octet-stream" : file.contentType,
    });
    return { url, expiresInSeconds: DOWNLOAD_TTL_SECONDS, name: file.name };
  }

  async remove(ctx: RequestContext, id: string): Promise<{ deleted: true }> {
    const file = await this.files.get(ctx, id);
    const type = recordType(file.entityType);
    if (file.createdBy !== ctx.userId && !(type && hasPermission(ctx, type.editPermission))) throw new ForbiddenException("Not allowed to remove this file");
    await this.files.archive(ctx, id);
    this.audit.record(ctx, { module: file.entityType.split(".")[0]!, action: "file_removed", entity: file.entityType, entityId: file.entityId, after: { fileId: id, name: file.name } });
    return { deleted: true };
  }
}

export function sanitizeName(name: string): string {
  const cleaned = [...name]
    .map((ch) => (ch === "/" || ch === "\\" || ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? "_" : ch))
    .join("")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200);
  if (!cleaned) throw new BadRequestException("A file name is required");
  return cleaned;
}
