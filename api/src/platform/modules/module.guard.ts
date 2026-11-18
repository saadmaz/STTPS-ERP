import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { MODULE_KEY } from "./require-module.decorator.js";
import { ModulesService } from "./modules.service.js";
import { MODULES_BY_KEY } from "./catalog.js";

/** Rejects requests to controllers of modules the tenant has not switched on. */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly modules: ModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<string>(MODULE_KEY, [context.getHandler(), context.getClass()]);
    if (!key) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) return true;
    if (!(await this.modules.isEnabled(user.tenantId, key))) {
      throw new ForbiddenException(`The ${MODULES_BY_KEY.get(key)?.name ?? key} module is not enabled`);
    }
    return true;
  }
}
