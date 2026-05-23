import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { TenantModule } from "./tenant/tenant.module";
import { CompanyModule } from "./company/company.module";
import { UserModule } from "./user/user.module";
import { FinanceModule } from "./finance/finance.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenantModule,
    CompanyModule,
    UserModule,
    FinanceModule,
  ],
})
export class AppModule {}
