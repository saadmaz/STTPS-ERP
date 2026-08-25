import { Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service";
import { COLLECTIONS } from "../firestore/collections";
import { CompanyUserDoc, RoleDoc, UserRoleDoc } from "../firestore/models";

/**
 * Firestore has no join equivalent for the CompanyUser -> UserRole -> Role
 * chain, and RequirePermissionGuard needs the resolved permission set on
 * every guarded request. Instead of a live multi-hop read per request, the
 * flattened union of a CompanyUser's roles' permissionCodes is denormalized
 * onto companyUsers/{id}.permissionCodes, recomputed here whenever role
 * assignments or a role's own permissions change.
 */
@Injectable()
export class PermissionSyncService {
  constructor(private firestore: FirestoreService) {}

  async recomputeCompanyUserPermissions(companyUserId: string): Promise<string[]> {
    const userRolesSnap = await this.firestore
      .collection<UserRoleDoc>(COLLECTIONS.userRoles)
      .where("companyUserId", "==", companyUserId)
      .get();

    const roleIds = [...new Set(userRolesSnap.docs.map((d) => d.data().roleId))];
    const permissionCodes = new Set<string>();

    if (roleIds.length) {
      const roleDocs = await Promise.all(
        roleIds.map((id) => this.firestore.collection<RoleDoc>(COLLECTIONS.roles).doc(id).get()),
      );
      for (const doc of roleDocs) {
        doc.data()?.permissionCodes?.forEach((code) => permissionCodes.add(code));
      }
    }

    const codes = [...permissionCodes];
    await this.firestore
      .collection<CompanyUserDoc>(COLLECTIONS.companyUsers)
      .doc(companyUserId)
      .update({ permissionCodes: codes });

    return codes;
  }

  /** Fan out a role's permission change to every CompanyUser holding it. */
  async recomputeForRole(roleId: string): Promise<void> {
    const userRolesSnap = await this.firestore
      .collection<UserRoleDoc>(COLLECTIONS.userRoles)
      .where("roleId", "==", roleId)
      .get();

    const companyUserIds = [...new Set(userRolesSnap.docs.map((d) => d.data().companyUserId))];
    await Promise.all(companyUserIds.map((id) => this.recomputeCompanyUserPermissions(id)));
  }
}
