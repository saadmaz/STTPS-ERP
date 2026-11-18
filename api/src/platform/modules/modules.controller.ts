import { Body, Controller, ForbiddenException, Get, Param, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { ModulesService } from "./modules.service.js";
import { allPermissions } from "./catalog.js";

export class SetModuleDto {
  @IsBoolean()
  enabled!: boolean;
}

interface AuthUser {
  id: string;
  tenantId: string;
  isSuperAdmin: boolean;
}

@ApiTags("Platform")
@ApiBearerAuth()
@Controller("platform")
export class ModulesController {
  constructor(private readonly modules: ModulesService) {}

  @Get("modules")
  @ApiOperation({ summary: "Modules of my tenant, with availability and activation (drives navigation)" })
  list(@CurrentUser() user: AuthUser) {
    return this.modules.list(user.tenantId);
  }

  @Put("modules/:key")
  @ApiOperation({ summary: "Switch a module on or off for my tenant (tenant super admins)" })
  set(@CurrentUser() user: AuthUser, @Param("key") key: string, @Body() dto: SetModuleDto) {
    if (!user.isSuperAdmin) throw new ForbiddenException("Only tenant administrators can change modules");
    return this.modules.setEnabled(user.tenantId, key, dto.enabled, user.id);
  }

  @Get("permissions")
  @ApiOperation({ summary: "Permission catalogue, grouped by module" })
  permissions() {
    return allPermissions();
  }
}
