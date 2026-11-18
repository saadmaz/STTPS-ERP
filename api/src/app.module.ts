import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { RequirePermissionGuard } from "./common/guards/require-permission.guard.js";
import { FirestoreModule } from "./firestore/firestore.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { TenantModule } from "./tenant/tenant.module.js";
import { CompanyModule } from "./company/company.module.js";
import { UserModule } from "./user/user.module.js";
import { AdminModule } from "./admin/admin.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    FirestoreModule,
    AuthModule,
    TenantModule,
    CompanyModule,
    UserModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: RequirePermissionGuard }],
})
export class AppModule {}
