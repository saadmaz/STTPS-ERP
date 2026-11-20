import type { BaseDoc } from "../data/repository.js";

export const API_KEY_COLLECTIONS = {
  keys: "apiKeys",
  /** Keyed by SHA-256(key) for O(1) lookup — the same shape as device keys (`hr-attendance.*`) and portal setup tokens. */
  keyHashes: "apiKeyHashes",
} as const;

export interface ApiKeyDoc extends BaseDoc {
  name: string;
  /** First ~14 characters of the key, shown in lists so an admin can tell keys apart without re-showing the secret. */
  prefix: string;
  hash: string;
  permissions: string[];
  status: "active" | "revoked";
  rateLimitPerMinute: number;
  lastUsedAt: string | null;
  requestCount: number;
}
