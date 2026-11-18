import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator.js";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { COLLECTIONS } from "../../firestore/collections.js";
import { CompanyUserDoc } from "../../firestore/models.js";

@Injectable()
export class RequirePermissionGuard implements CanActivate {
  constructor(private reflector: Reflector, private firestore: FirestoreService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    // Platform admins and tenant super admins bypass permission checks
    if (user.isPlatformAdmin || user.isSuperAdmin) return true;

    const companyId = request.headers["x-company-id"] as string;
    if (!companyId) throw new ForbiddenException("Company context required");

    // No join needed: permissionCodes is the pre-flattened union of every
    // role assigned to this CompanyUser, kept in sync by PermissionSyncService.
    const doc = await this.firestore
      .collection<CompanyUserDoc>(COLLECTIONS.companyUsers)
      .doc(`${user.id}_${companyId}`)
      .get();

    if (!doc.exists) throw new ForbiddenException("User not assigned to this company");

    const companyUser = doc.data()!;
    if (!companyUser.permissionCodes.includes(required)) {
      throw new ForbiddenException(`Permission required: ${required}`);
    }
    return true;
  }
}
