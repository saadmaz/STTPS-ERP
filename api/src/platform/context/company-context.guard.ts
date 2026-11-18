import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { COLLECTIONS } from "../../firestore/collections.js";
import { CompanyDoc, CompanyUserDoc } from "../../firestore/models.js";
import { RequestContext } from "./request-context.js";

/**
 * Second in the global guard chain. When a signed-in request names a company
 * (`x-company-id`), verifies the company belongs to the user's tenant and the
 * user is assigned to it, then attaches the RequestContext to `request.ctx`.
 * Requests without the header pass through without a context; routes that
 * need one fail in the `@Ctx()` decorator or the permission guard.
 */
@Injectable()
export class CompanyContextGuard implements CanActivate {
  constructor(private readonly firestore: FirestoreService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const header = request.headers["x-company-id"];
    if (!user || typeof header !== "string" || header.length === 0) return true;

    const companySnap = await this.firestore.collection<CompanyDoc>(COLLECTIONS.companies).doc(header).get();
    const company = companySnap.data();
    if (!company || company.tenantId !== user.tenantId) throw new ForbiddenException("Unknown company");
    if (!company.isActive) throw new ForbiddenException("This company is inactive");

    let permissions: ReadonlySet<string> = new Set();
    const allPermissions = user.isSuperAdmin === true;
    if (!allPermissions) {
      const link = await this.firestore
        .collection<CompanyUserDoc>(COLLECTIONS.companyUsers)
        .doc(`${user.id}_${company.id}`)
        .get();
      if (!link.exists) throw new ForbiddenException("You are not assigned to this company");
      permissions = new Set(link.data()!.permissionCodes);
    }

    const ctx: RequestContext = {
      tenantId: company.tenantId,
      companyId: company.id,
      userId: user.id,
      allPermissions,
      permissions,
      ip: request.ip ?? null,
      userAgent: (request.headers["user-agent"] as string | undefined) ?? null,
    };
    request.ctx = ctx;
    return true;
  }
}
