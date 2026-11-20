import { ExecutionContext, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";
import { ApiKeyService } from "../../platform/api-keys/api-keys.service.js";
import { RequestContext } from "../../platform/context/request-context.js";

const API_KEY_HEADER = "x-api-key";

/** In-process only (not shared across server instances) — a documented, deliberate simplification for a first version. */
const requestWindows = new Map<string, number[]>();

function withinRateLimit(apiKeyId: string, limitPerMinute: number): boolean {
  const now = Date.now();
  const recent = (requestWindows.get(apiKeyId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= limitPerMinute) {
    requestWindows.set(apiKeyId, recent);
    return false;
  }
  recent.push(now);
  requestWindows.set(apiKeyId, recent);
  return true;
}

/**
 * Registered globally (first in the guard chain), so every route needs a
 * valid bearer token unless it is marked `@Public()`. Also accepts an
 * `x-api-key` header (blueprint §29's public API) as an alternative to a
 * signed-in JWT: it resolves straight to a `RequestContext` (the key's own
 * tenant/company and permission list), skipping `CompanyContextGuard`
 * entirely — there is no `x-company-id` header to read for a machine
 * caller, since the key itself already names one company.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeyService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers[API_KEY_HEADER] as string | undefined;
    if (apiKey) {
      const resolved = await this.apiKeys.resolveByKey(apiKey);
      if (!resolved) throw new UnauthorizedException("Invalid or revoked API key");
      if (!withinRateLimit(resolved.apiKeyId, resolved.rateLimitPerMinute)) {
        throw new HttpException("Rate limit exceeded", HttpStatus.TOO_MANY_REQUESTS);
      }
      const userId = `apikey:${resolved.apiKeyId}`;
      request.user = { id: userId, tenantId: resolved.tenantId, isSuperAdmin: false, isPlatformAdmin: false, email: "", firstName: "API", lastName: "Key" };
      const ctx: RequestContext = {
        tenantId: resolved.tenantId, companyId: resolved.companyId, userId, allPermissions: false,
        permissions: new Set(resolved.permissions), ip: request.ip ?? null, userAgent: "api-key",
      };
      request.ctx = ctx;
      this.apiKeys.recordUsage(resolved.apiKeyId);
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
