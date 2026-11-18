import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

/** Fields that must never leave the API, whatever a handler returns. */
const SECRET_KEYS = new Set(["passwordHash", "mfaSecret", "refreshToken", "secretHash", "apiKeyHash"]);

function strip(value: unknown, depth = 0): unknown {
  if (depth > 20 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => strip(v, depth + 1));
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (!SECRET_KEYS.has(key)) out[key] = strip(v, depth + 1);
  }
  return out;
}

/** Registered globally: removes secret fields from every JSON response as a last line of defence. */
@Injectable()
export class StripSecretsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => strip(body)));
  }
}
