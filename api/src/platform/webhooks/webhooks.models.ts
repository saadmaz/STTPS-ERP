import type { BaseDoc } from "../data/repository.js";

export const WEBHOOK_COLLECTIONS = { webhooks: "webhooks" } as const;

export interface WebhookDoc extends BaseDoc {
  name: string;
  url: string;
  /** Domain event type names (e.g. "InvoicePosted") — the same set the Automation engine's rules can trigger on. */
  eventTypes: string[];
  active: boolean;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: "delivered" | "failed" | null;
  lastDeliveryError: string | null;
}
