import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";

/** Runs after the global JwtAuthGuard, so `request.user` is already set. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException("Platform admin access required");
    }
    return true;
  }
}
