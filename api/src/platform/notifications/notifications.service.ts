import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { COLLECTIONS } from "../../firestore/collections.js";
import { UserDoc } from "../../firestore/models.js";
import { JobDoc, JobQueueService } from "../jobs/job-queue.service.js";
import { EmailSender } from "./email.sender.js";

export const NOTIFICATIONS_COLLECTION = "notifications";
export const NOTIFICATION_PREFS_COLLECTION = "notificationPreferences";

export type NotificationPriority = "low" | "normal" | "high";

export interface NotificationDoc {
  id: string;
  tenantId: string;
  companyId: string | null;
  userId: string;
  /** e.g. "approval", "task", "finance.invoice.overdue". Used for preferences and filtering. */
  category: string;
  title: string;
  body: string | null;
  /** Relative link in the staff app, e.g. "/procurement/requisitions/abc". */
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  priority: NotificationPriority;
  readAt: string | null;
  createdAt: string;
}

export interface NotifyInput {
  tenantId: string;
  companyId: string | null;
  userIds: string[];
  category: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  priority?: NotificationPriority;
}

interface PreferencesDoc {
  userId: string;
  /** Categories muted per channel. "*" mutes the channel entirely. */
  muted: { inApp: string[]; email: string[] };
  updatedAt: string;
}

/**
 * Notification centre (blueprint §24). In-app notifications are written
 * directly (inside the caller's transaction when given); email is sent by a
 * background job so a slow provider never blocks a request. Users can mute
 * categories per channel.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger("Notifications");

  constructor(
    private readonly firestore: FirestoreService,
    private readonly jobs: JobQueueService,
    private readonly email: EmailSender,
  ) {}

  onModuleInit(): void {
    this.jobs.register<{ notificationId: string }>("notification.email", (job: JobDoc<{ notificationId: string }>) =>
      this.deliverEmail(job.payload.notificationId),
    );
  }

  /**
   * Creates one notification per recipient. With a transaction the
   * notifications commit with the business change; email jobs are queued in
   * the same transaction.
   */
  notify(input: NotifyInput, tx?: Transaction): NotificationDoc[] {
    const now = new Date().toISOString();
    const docs = [...new Set(input.userIds.filter(Boolean))].map((userId) => {
      const ref = this.firestore.collection<NotificationDoc>(NOTIFICATIONS_COLLECTION).doc();
      const doc: NotificationDoc = {
        id: ref.id,
        tenantId: input.tenantId,
        companyId: input.companyId,
        userId,
        category: input.category,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        priority: input.priority ?? "normal",
        readAt: null,
        createdAt: now,
      };
      if (tx) {
        tx.create(ref, doc);
        this.jobs.enqueueInTx(tx, "notification.email", { notificationId: doc.id }, { id: `email_${doc.id}` });
      } else {
        void ref
          .create(doc)
          .then(() => this.jobs.enqueue("notification.email", { notificationId: doc.id }, { id: `email_${doc.id}` }))
          .catch((error) => this.logger.error(`Notification write failed: ${(error as Error).message}`));
      }
      return doc;
    });
    return docs;
  }

  async listMine(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}): Promise<NotificationDoc[]> {
    let q = this.firestore
      .collection<NotificationDoc>(NOTIFICATIONS_COLLECTION)
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(Math.min(options.limit ?? 50, 200));
    if (options.unreadOnly) q = q.where("readAt", "==", null);
    const [snap, prefs] = await Promise.all([q.get(), this.preferences(userId)]);
    return snap.docs.map((d) => d.data()).filter((n) => !isMuted(prefs.muted.inApp, n.category));
  }

  async unreadCount(userId: string): Promise<number> {
    const snap = await this.firestore
      .collection<NotificationDoc>(NOTIFICATIONS_COLLECTION)
      .where("userId", "==", userId)
      .where("readAt", "==", null)
      .count()
      .get();
    return snap.data().count;
  }

  async markRead(userId: string, id: string): Promise<NotificationDoc> {
    const ref = this.firestore.collection<NotificationDoc>(NOTIFICATIONS_COLLECTION).doc(id);
    const doc = (await ref.get()).data();
    if (!doc || doc.userId !== userId) throw new NotFoundException("Notification not found");
    if (doc.readAt) return doc;
    const readAt = new Date().toISOString();
    await ref.update({ readAt });
    return { ...doc, readAt };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const snap = await this.firestore
      .collection<NotificationDoc>(NOTIFICATIONS_COLLECTION)
      .where("userId", "==", userId)
      .where("readAt", "==", null)
      .limit(500)
      .get();
    const readAt = new Date().toISOString();
    const batch = this.firestore.db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { readAt }));
    await batch.commit();
    return { updated: snap.size };
  }

  async preferences(userId: string): Promise<PreferencesDoc> {
    const doc = (await this.firestore.collection<PreferencesDoc>(NOTIFICATION_PREFS_COLLECTION).doc(userId).get()).data();
    return doc ?? { userId, muted: { inApp: [], email: [] }, updatedAt: new Date(0).toISOString() };
  }

  async setPreferences(userId: string, muted: { inApp?: string[]; email?: string[] }): Promise<PreferencesDoc> {
    const current = await this.preferences(userId);
    const next: PreferencesDoc = {
      userId,
      muted: { inApp: muted.inApp ?? current.muted.inApp, email: muted.email ?? current.muted.email },
      updatedAt: new Date().toISOString(),
    };
    await this.firestore.collection<PreferencesDoc>(NOTIFICATION_PREFS_COLLECTION).doc(userId).set(next);
    return next;
  }

  private async deliverEmail(notificationId: string): Promise<{ sent: boolean; reason?: string }> {
    const notification = (await this.firestore.collection<NotificationDoc>(NOTIFICATIONS_COLLECTION).doc(notificationId).get()).data();
    if (!notification) return { sent: false, reason: "notification deleted" };
    const prefs = await this.preferences(notification.userId);
    if (isMuted(prefs.muted.email, notification.category)) return { sent: false, reason: "muted" };
    const user = (await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(notification.userId).get()).data();
    if (!user?.isActive || !user.email) return { sent: false, reason: "no active recipient" };
    const appUrl = process.env.FRONTEND_URL ?? "";
    await this.email.send({
      to: user.email,
      subject: notification.title,
      text: [notification.body, notification.link ? `${appUrl}${notification.link}` : null].filter(Boolean).join("\n\n"),
    });
    return { sent: true };
  }
}

export function isMuted(muted: string[], category: string): boolean {
  return muted.includes("*") || muted.some((m) => category === m || category.startsWith(`${m}.`));
}
