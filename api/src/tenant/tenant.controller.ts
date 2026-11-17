import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { TenantService } from "./tenant.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("Tenant")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
