import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { COLLECTIONS } from "../../firestore/collections.js";
import { UserDoc } from "../../firestore/models.js";
import { AuditService } from "../audit/audit.service.js";
import { hasPermission, RequestContext } from "../context/request-context.js";
import { BaseDoc, TenantRepository } from "../data/repository.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { ApprovalsService } from "../approvals/approvals.service.js";
import { recordType, RecordType } from "./record-types.js";

export const RECORD_COLLECTIONS = {
  comments: "comments",
  tags: "recordTags",
  links: "recordLinks",
  savedViews: "savedViews",
} as const;

export interface CommentDoc extends BaseDoc {
  entityType: string;
  entityId: string;
  body: string;
  mentions: string[];
  editedAt: string | null;
}

interface RecordTagsDoc {
  id: string;
  tenantId: string;
  companyId: string;
  entityType: string;
  entityId: string;
  tags: string[];
  /** `${companyId}|${tag}` for array-contains lookups without a composite index. */
  tagKeys: string[];
  updatedAt: string;
}

export interface RecordLinkDoc extends BaseDoc {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  /** e.g. "converted_to", "related", "invoiced_by". */
  relation: string;
  fromKey: string;
  toKey: string;
}

export interface SavedViewDoc extends BaseDoc {
  entityType: string;
  name: string;
  ownerId: string;
  shared: boolean;
  /** Columns, filters (`where`), sort, search text, density … as the list screen defines them. */
  config: Record<string, unknown>;
}

export interface ActivityItem {
  at: string;
  kind: "audit" | "comment" | "approval";
  actorId: string | null;
  action: string;
  summary: string;
  data: Record<string, unknown> | null;
}

const MENTION_RE = /@\[([^\]]{1,100})\]\(user:([A-Za-z0-9_-]{1,128})\)/g;

/**
 * Comments, tags, links, saved views and the activity timeline for any
 * registered record type (blueprint §3 shared services, §34 record design).
 */
@Injectable()
export class RecordsService {
  readonly comments: TenantRepository<CommentDoc>;
  readonly links: TenantRepository<RecordLinkDoc>;
  readonly savedViews: TenantRepository<SavedViewDoc>;

  constructor(
    private readonly firestore: FirestoreService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly approvals: ApprovalsService,
  ) {
    this.comments = new TenantRepository(firestore, RECORD_COLLECTIONS.comments, "Comment");
    this.links = new TenantRepository(firestore, RECORD_COLLECTIONS.links, "Link");
    this.savedViews = new TenantRepository(firestore, RECORD_COLLECTIONS.savedViews, "Saved view");
  }

  /** Throws unless the type is known, the user holds its view (or edit) permission and the record is in their company. */
  async assertAccess(ctx: RequestContext, entityType: string, entityId: string, mode: "view" | "edit"): Promise<{ type: RecordType; record: BaseDoc }> {
    const type = recordType(entityType);
    if (!type) throw new NotFoundException(`Unknown record type ${entityType}`);
    if (!hasPermission(ctx, mode === "view" ? type.viewPermission : type.editPermission)) {
      throw new ForbiddenException(`Permission required: ${mode === "view" ? type.viewPermission : type.editPermission}`);
    }
    const record = (await this.firestore.collection<BaseDoc>(type.collection).doc(entityId).get()).data();
    if (!record || record.companyId !== ctx.companyId) throw new NotFoundException(`${type.label} not found`);
    return { type, record };
  }

  // ---- Comments ----

  async listComments(ctx: RequestContext, entityType: string, entityId: string): Promise<CommentDoc[]> {
    await this.assertAccess(ctx, entityType, entityId, "view");
    const snap = await this.comments.collection
      .where("companyId", "==", ctx.companyId)
      .where("entityType", "==", entityType)
      .where("entityId", "==", entityId)
      .get();
    return snap.docs.map((d) => d.data()).filter((c) => c.archivedAt == null).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Body may mention users as `@[Name](user:<id>)`; mentioned users of the tenant are notified. */
  async addComment(ctx: RequestContext, entityType: string, entityId: string, body: string): Promise<CommentDoc> {
    const { type } = await this.assertAccess(ctx, entityType, entityId, "view");
    const mentions = await this.validMentions(ctx, body);
    return this.firestore.runTransaction(async (tx) => {
      const comment = await this.comments.create(ctx, { entityType, entityId, body: body.trim(), mentions, editedAt: null }, tx);
      const others = mentions.filter((m) => m !== ctx.userId);
      if (others.length) {
        this.notifications.notify({
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          userIds: others,
          category: "mention",
          title: `You were mentioned on a ${type.label.toLowerCase()}`,
          body: body.replace(MENTION_RE, "@$1").slice(0, 300),
          link: type.link(entityId),
          entityType,
          entityId,
        }, tx);
      }
      return comment;
    });
  }

  async editComment(ctx: RequestContext, id: string, body: string): Promise<CommentDoc> {
    const comment = await this.comments.get(ctx, id);
    if (comment.createdBy !== ctx.userId) throw new ForbiddenException("Only the author can edit a comment");
    const mentions = await this.validMentions(ctx, body);
    const { after } = await this.comments.update(ctx, id, { body: body.trim(), mentions, editedAt: new Date().toISOString() });
    return after;
  }

  async deleteComment(ctx: RequestContext, id: string): Promise<{ deleted: true }> {
    const comment = await this.comments.get(ctx, id);
    const type = recordType(comment.entityType);
    const canModerate = !!type && hasPermission(ctx, type.editPermission);
    if (comment.createdBy !== ctx.userId && !canModerate) throw new ForbiddenException("Only the author can delete a comment");
    await this.comments.archive(ctx, id);
    return { deleted: true };
  }

  private async validMentions(ctx: RequestContext, body: string): Promise<string[]> {
    const ids = [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[2]!))].slice(0, 20);
    if (ids.length === 0) return [];
    const snaps = await this.firestore.db.getAll(...ids.map((id) => this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(id)));
    return snaps.map((s) => s.data() as UserDoc | undefined).filter((u): u is UserDoc => !!u && u.tenantId === ctx.tenantId && u.isActive).map((u) => u.id);
  }

  // ---- Tags ----

  private tagRef(ctx: RequestContext, entityType: string, entityId: string) {
    return this.firestore.collection<RecordTagsDoc>(RECORD_COLLECTIONS.tags).doc(`${ctx.companyId}__${entityType}__${entityId}`);
  }

  async getTags(ctx: RequestContext, entityType: string, entityId: string): Promise<string[]> {
    await this.assertAccess(ctx, entityType, entityId, "view");
    return (await this.tagRef(ctx, entityType, entityId).get()).data()?.tags ?? [];
  }

  async setTags(ctx: RequestContext, entityType: string, entityId: string, tags: string[]): Promise<string[]> {
    await this.assertAccess(ctx, entityType, entityId, "edit");
    const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0))].sort();
    if (clean.some((t) => t.length > 40)) throw new BadRequestException("Tags are at most 40 characters");
    if (clean.length > 30) throw new BadRequestException("At most 30 tags per record");
    await this.tagRef(ctx, entityType, entityId).set({
      id: `${ctx.companyId}__${entityType}__${entityId}`,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      entityType,
      entityId,
      tags: clean,
      tagKeys: clean.map((t) => `${ctx.companyId}|${t}`),
      updatedAt: new Date().toISOString(),
    });
    this.audit.record(ctx, { module: entityType.split(".")[0]!, action: "tagged", entity: entityType, entityId, after: { tags: clean } });
    return clean;
  }

  /** Records carrying a tag, limited to types the user may view. */
  async taggedWith(ctx: RequestContext, tag: string): Promise<{ entityType: string; entityId: string; link: string }[]> {
    const snap = await this.firestore
      .collection<RecordTagsDoc>(RECORD_COLLECTIONS.tags)
      .where("tagKeys", "array-contains", `${ctx.companyId}|${tag.trim().toLowerCase()}`)
      .limit(500)
      .get();
    return snap.docs
      .map((d) => d.data())
      .filter((d) => {
        const type = recordType(d.entityType);
        return !!type && hasPermission(ctx, type.viewPermission);
      })
      .map((d) => ({ entityType: d.entityType, entityId: d.entityId, link: recordType(d.entityType)!.link(d.entityId) }));
  }

  /** Tags already used in the company, for autocomplete. */
  async tagSuggestions(ctx: RequestContext): Promise<string[]> {
    const snap = await this.firestore.collection<RecordTagsDoc>(RECORD_COLLECTIONS.tags).where("companyId", "==", ctx.companyId).limit(2000).get();
    return [...new Set(snap.docs.flatMap((d) => d.data().tags))].sort();
  }

  // ---- Links ----

  async link(ctx: RequestContext, from: { type: string; id: string }, to: { type: string; id: string }, relation: string): Promise<RecordLinkDoc> {
    await this.assertAccess(ctx, from.type, from.id, "edit");
    await this.assertAccess(ctx, to.type, to.id, "view");
    const id = `${ctx.companyId}__${from.type}__${from.id}__${relation}__${to.type}__${to.id}`.slice(0, 1400);
    const existing = await this.links.find(ctx, id);
    if (existing && existing.archivedAt == null) return existing;
    if (existing) return (await this.links.restore(ctx, id)).after;
    return this.links.create(ctx, {
      id,
      fromType: from.type,
      fromId: from.id,
      toType: to.type,
      toId: to.id,
      relation,
      fromKey: `${from.type}:${from.id}`,
      toKey: `${to.type}:${to.id}`,
    });
  }

  async unlink(ctx: RequestContext, linkId: string): Promise<{ deleted: true }> {
    const link = await this.links.get(ctx, linkId);
    await this.assertAccess(ctx, link.fromType, link.fromId, "edit");
    await this.links.archive(ctx, linkId);
    return { deleted: true };
  }

  /** Links from and to a record, each with the other side's type, id and link, filtered to viewable types. */
  async related(ctx: RequestContext, entityType: string, entityId: string) {
    await this.assertAccess(ctx, entityType, entityId, "view");
    const key = `${entityType}:${entityId}`;
    const [outgoing, incoming] = await Promise.all([
      this.links.collection.where("companyId", "==", ctx.companyId).where("fromKey", "==", key).get(),
      this.links.collection.where("companyId", "==", ctx.companyId).where("toKey", "==", key).get(),
    ]);
    const rows = [
      ...outgoing.docs.map((d) => d.data()).map((l) => ({ linkId: l.id, direction: "outgoing" as const, relation: l.relation, entityType: l.toType, entityId: l.toId, archivedAt: l.archivedAt })),
      ...incoming.docs.map((d) => d.data()).map((l) => ({ linkId: l.id, direction: "incoming" as const, relation: l.relation, entityType: l.fromType, entityId: l.fromId, archivedAt: l.archivedAt })),
    ];
    return rows
      .filter((r) => r.archivedAt == null)
      .filter((r) => {
        const type = recordType(r.entityType);
        return !!type && hasPermission(ctx, type.viewPermission);
      })
      .map(({ archivedAt: _a, ...r }) => ({ ...r, typeLabel: recordType(r.entityType)!.label, link: recordType(r.entityType)!.link(r.entityId) }));
  }

  // ---- Activity ----

  /** One timeline of changes, comments and approval decisions, newest first. */
  async activity(ctx: RequestContext, entityType: string, entityId: string): Promise<ActivityItem[]> {
    await this.assertAccess(ctx, entityType, entityId, "view");
    const [audits, comments, approvals] = await Promise.all([
      this.audit.forEntity(ctx, entityType, entityId, 200),
      this.listComments(ctx, entityType, entityId),
      this.approvals.forEntity(ctx, entityType, entityId),
    ]);
    const items: ActivityItem[] = [
      ...audits.map((a) => ({
        at: a.createdAt,
        kind: "audit" as const,
        actorId: a.userId,
        action: a.action,
        summary: summarise(a.action, a.after),
        data: a.after ? { before: a.before, after: a.after, reason: a.reason ?? null } : null,
      })),
      ...comments.map((c) => ({ at: c.createdAt, kind: "comment" as const, actorId: c.createdBy, action: "commented", summary: c.body, data: { commentId: c.id, editedAt: c.editedAt } })),
      ...approvals.flatMap((r) =>
        r.decisions.map((d) => ({
          at: d.at,
          kind: "approval" as const,
          actorId: d.userId,
          action: d.decision,
          summary: `${r.definitionName}: ${d.decision.replace("_", " ")}${d.comment ? ` · ${d.comment}` : ""}`,
          data: { requestId: r.id, step: d.step, onBehalfOf: d.onBehalfOf },
        })),
      ),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }

  // ---- Saved views ----

  async listViews(ctx: RequestContext, entityType: string): Promise<SavedViewDoc[]> {
    const snap = await this.savedViews.collection.where("companyId", "==", ctx.companyId).where("entityType", "==", entityType).get();
    return snap.docs
      .map((d) => d.data())
      .filter((v) => v.archivedAt == null && (v.ownerId === ctx.userId || v.shared))
      .sort((a, b) => Number(b.ownerId === ctx.userId) - Number(a.ownerId === ctx.userId) || a.name.localeCompare(b.name));
  }

  async createView(ctx: RequestContext, input: { entityType: string; name: string; shared?: boolean; config: Record<string, unknown> }): Promise<SavedViewDoc> {
    if (!recordType(input.entityType)) throw new NotFoundException(`Unknown record type ${input.entityType}`);
    if (input.shared && !hasPermission(ctx, "platform.savedView.create")) throw new ForbiddenException("Sharing views needs platform.savedView.create");
    assertSmall(input.config);
    return this.savedViews.create(ctx, { entityType: input.entityType, name: input.name.trim(), ownerId: ctx.userId, shared: !!input.shared, config: input.config });
  }

  async updateView(ctx: RequestContext, id: string, input: { name?: string; shared?: boolean; config?: Record<string, unknown> }): Promise<SavedViewDoc> {
    const view = await this.savedViews.get(ctx, id);
    this.assertViewOwner(ctx, view, "edit");
    if (input.shared && !view.shared && !hasPermission(ctx, "platform.savedView.create")) throw new ForbiddenException("Sharing views needs platform.savedView.create");
    if (input.config) assertSmall(input.config);
    const { after } = await this.savedViews.update(ctx, id, { name: input.name?.trim(), shared: input.shared, config: input.config });
    return after;
  }

  async deleteView(ctx: RequestContext, id: string): Promise<{ deleted: true }> {
    const view = await this.savedViews.get(ctx, id);
    this.assertViewOwner(ctx, view, "delete");
    await this.savedViews.archive(ctx, id);
    return { deleted: true };
  }

  private assertViewOwner(ctx: RequestContext, view: SavedViewDoc, action: "edit" | "delete"): void {
    if (view.ownerId === ctx.userId) return;
    if (view.shared && hasPermission(ctx, `platform.savedView.${action}`)) return;
    throw new ForbiddenException("Only the owner can change this view");
  }
}

function assertSmall(config: Record<string, unknown>): void {
  if (JSON.stringify(config).length > 20_000) throw new BadRequestException("View configuration is too large");
}

function summarise(action: string, after: Record<string, unknown> | null): string {
  if (!after) return action;
  const keys = Object.keys(after).filter((k) => !["id", "tenantId", "companyId", "createdAt", "createdBy", "archivedAt"].includes(k));
  if (action === "updated" && keys.length) return `Updated ${keys.slice(0, 5).join(", ")}${keys.length > 5 ? "…" : ""}`;
  return action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, " ");
}
