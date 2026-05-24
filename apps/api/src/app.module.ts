import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { TenantModule } from "./tenant/tenant.module";
import { CompanyModule } from "./company/company.module";
import { UserModule } from "./user/user.module";
import { FinanceModule } from "./finance/finance.module";
import { InventoryModule } from "./inventory/inventory.module";
import { ProcurementModule } from "./procurement/procurement.module";
import { CrmModule } from "./crm/crm.module";
import { SalesModule } from "./sales/sales.module";
import { ManufacturingModule } from "./manufacturing/manufacturing.module";
import { HrModule } from "./hr/hr.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenantModule,
    CompanyModule,
    UserModule,
    FinanceModule,
    InventoryModule,
    ProcurementModule,
    CrmModule,
    SalesModule,
    ManufacturingModule,
    HrModule,
  ],
})
export class AppModule {}
