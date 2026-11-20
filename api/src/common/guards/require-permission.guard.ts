import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator.js";
import { hasPermission, RequestContext } from "../../platform/context/request-context.js";

/**
 * Last in the global guard chain: enforces `@RequirePermission(code)` against
 * the RequestContext that CompanyContextGuard resolved.
 */
@Injectable()
export class RequirePermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    if (!request.user) throw new UnauthorizedException();
    const ctx = request.ctx as RequestContext | undefined;
    if (!ctx) throw new ForbiddenException("Company context required: send the x-company-id header");
    if (!hasPermission(ctx, required)) throw new ForbiddenException(`Permission required: ${required}`);
    return true;
  }
}
