import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class RequirePermissionGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

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

    const [module, action] = required.split(".");

    const companyUser = await this.prisma.companyUser.findFirst({
      where: { userId: user.id, companyId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!companyUser) throw new ForbiddenException("User not assigned to this company");

    const hasPermission = companyUser.userRoles.some((ur) =>
      ur.role.rolePermissions.some(
        (rp) => rp.permission.module === module && rp.permission.action === action
      )
    );

    if (!hasPermission) throw new ForbiddenException(`Permission required: ${required}`);
    return true;
  }
}
