import { Module } from "@nestjs/common";
import { GlModule } from "./gl/gl.module";
import { ApModule } from "./ap/ap.module";
import { ArModule } from "./ar/ar.module";
import { ReportsModule } from "./reports/reports.module";
import { BankModule } from "./bank/bank.module";
import { AssetsModule } from "./assets/assets.module";
import { BudgetModule } from "./budget/budget.module";

@Module({
  imports: [GlModule, ApModule, ArModule, ReportsModule, BankModule, AssetsModule, BudgetModule],
})
export class FinanceModule {}
