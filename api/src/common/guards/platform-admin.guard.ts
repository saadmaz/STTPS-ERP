import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class PlatformAdminGuard extends AuthGuard("jwt") implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const { user } = context.switchToHttp().getRequest();
    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException("Platform admin access required");
    }
    return true;
  }
}
