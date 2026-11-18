import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AwsClient } from "aws4fetch";

export interface PresignOptions {
  method: "GET" | "PUT";
  key: string;
  expiresSeconds: number;
  contentType?: string;
  /** GET only: forces a download filename. */
  downloadName?: string;
  /** GET only: overrides the served content type. */
  responseContentType?: string;
}

export interface StoredObject {
  size: number;
  contentType: string | null;
}

export interface ObjectStorage {
  readonly configured: boolean;
  presign(options: PresignOptions): Promise<string>;
  head(key: string): Promise<StoredObject | null>;
}

/** Cloudflare R2 through its S3-compatible API, signed with SigV4. */
class R2Storage implements ObjectStorage {
  readonly configured = true;
  private readonly client: AwsClient;
  private readonly endpoint: string;

  constructor(accountId: string, accessKeyId: string, secretAccessKey: string, private readonly bucket: string) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
    this.endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }

  private url(key: string): URL {
    return new URL(`${this.endpoint}/${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  }

  async presign(options: PresignOptions): Promise<string> {
    const url = this.url(options.key);
    url.searchParams.set("X-Amz-Expires", String(options.expiresSeconds));
    if (options.downloadName) {
      url.searchParams.set("response-content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadName)}`);
    }
    if (options.responseContentType) url.searchParams.set("response-content-type", options.responseContentType);
    const headers: Record<string, string> = {};
    if (options.method === "PUT" && options.contentType) headers["content-type"] = options.contentType;
    const signed = await this.client.sign(new Request(url, { method: options.method, headers }), { aws: { signQuery: true } });
    return signed.url;
  }

  async head(key: string): Promise<StoredObject | null> {
    const response = await this.client.fetch(this.url(key).toString(), { method: "HEAD" });
    if (response.status === 404) return null;
    if (!response.ok) throw new ServiceUnavailableException(`File storage returned ${response.status}`);
    return { size: Number(response.headers.get("content-length") ?? 0), contentType: response.headers.get("content-type") };
  }
}

/** In-process storage for tests (`STORAGE_DRIVER=memory`). */
export class MemoryStorage implements ObjectStorage {
  readonly configured = true;
  readonly objects = new Map<string, StoredObject>();

  async presign(options: PresignOptions): Promise<string> {
    return `memory://${options.method}/${options.key}?expires=${options.expiresSeconds}`;
  }

  async head(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  /** Simulates the client's upload. */
  put(key: string, size: number, contentType: string): void {
    this.objects.set(key, { size, contentType });
  }
}

class UnconfiguredStorage implements ObjectStorage {
  readonly configured = false;
  async presign(): Promise<string> {
    throw new ServiceUnavailableException("File storage is not configured (R2_* environment variables)");
  }
  async head(): Promise<StoredObject | null> {
    throw new ServiceUnavailableException("File storage is not configured (R2_* environment variables)");
  }
}

let memory: MemoryStorage | null = null;

/** Picks the storage from the environment once per process. */
@Injectable()
export class ObjectStorageProvider {
  readonly storage: ObjectStorage;

  constructor() {
    const env = process.env;
    if (env.STORAGE_DRIVER === "memory") {
      memory ??= new MemoryStorage();
      this.storage = memory;
    } else if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET) {
      this.storage = new R2Storage(env.R2_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, env.R2_BUCKET);
    } else {
      this.storage = new UnconfiguredStorage();
    }
  }
}
