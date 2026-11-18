import { BadRequestException, createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Who is acting, for which company, with which permissions. Resolved once per
 * request by CompanyContextGuard from the bearer token and the `x-company-id`
 * header, after verifying the user belongs to that company.
 */
export interface RequestContext {
  tenantId: string;
  companyId: string;
  userId: string;
  /** Tenant super admins hold every permission in every company of their tenant. */
  allPermissions: boolean;
  permissions: ReadonlySet<string>;
  ip: string | null;
  userAgent: string | null;
}

/** The minimum a repository needs: which company's data, and who is writing. */
export interface Scope {
  tenantId: string;
  companyId: string;
  userId?: string | null;
}

export function hasPermission(ctx: RequestContext, code: string): boolean {
  return ctx.allPermissions || ctx.permissions.has(code);
}

/** A context for background work (jobs, event handlers) acting as the system. */
export function systemContext(scope: { tenantId: string; companyId: string }, userId: string | null = null): RequestContext {
  return {
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    userId: userId ?? "system",
    allPermissions: true,
    permissions: new Set(),
    ip: null,
    userAgent: "system",
  };
}

/** Injects the verified RequestContext. Fails with 400 when no company was selected. */
export const Ctx = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestContext => {
  const request = ctx.switchToHttp().getRequest();
  if (!request.ctx) throw new BadRequestException("Select a company: the x-company-id header is required");
  return request.ctx as RequestContext;
});
