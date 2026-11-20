import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { TenantService } from "./tenant.service.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";

@ApiTags("Tenant")
@ApiBearerAuth()
@Controller("tenant")
export class TenantController {
  constructor(private tenantService: TenantService) {}

  @Get("me")
  getMyTenant(@CurrentUser("tenantId") tenantId: string) {
    return this.tenantService.findById(tenantId);
  }

  @Get("me/stats")
  getStats(@CurrentUser("tenantId") tenantId: string) {
    return this.tenantService.getStats(tenantId);
  }
}
