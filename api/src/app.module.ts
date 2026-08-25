import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { RequirePermissionGuard } from "./common/guards/require-permission.guard";
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
import { EamModule } from "./eam/eam.module";
import { FsmModule } from "./fsm/fsm.module";
import { QualityModule } from "./quality/quality.module";
import { EhsModule } from "./ehs/ehs.module";
import { ProjectsModule } from "./projects/projects.module";
import { AdminModule } from "./admin/admin.module";

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
    EamModule,
    FsmModule,
    QualityModule,
    EhsModule,
    ProjectsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RequirePermissionGuard },
  ],
})
export class AppModule {}
