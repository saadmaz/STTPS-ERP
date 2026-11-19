import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { StripSecretsInterceptor } from "./common/interceptors/strip-secrets.interceptor.js";
import { ConfigModule } from "@nestjs/config";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard.js";
import { RequirePermissionGuard } from "./common/guards/require-permission.guard.js";
import { CompanyContextGuard } from "./platform/context/company-context.guard.js";
import { ModuleGuard } from "./platform/modules/module.guard.js";
import { FirestoreModule } from "./firestore/firestore.module.js";
import { PlatformModule } from "./platform/platform.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { TenantModule } from "./tenant/tenant.module.js";
import { CompanyModule } from "./company/company.module.js";
import { UserModule } from "./user/user.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { OrgModule } from "./org/org.module.js";
import { CrmModule } from "./crm/crm.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    FirestoreModule,
    PlatformModule,
    AuthModule,
    TenantModule,
    CompanyModule,
    UserModule,
    AdminModule,
    OrgModule,
    CrmModule,
  ],
  // Order matters: authenticate, resolve the company context, check the module is on, then check permissions.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CompanyContextGuard },
    { provide: APP_GUARD, useClass: ModuleGuard },
    { provide: APP_GUARD, useClass: RequirePermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: StripSecretsInterceptor },
  ],
})
export class AppModule {}
