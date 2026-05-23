import { Module } from "@nestjs/common";
import { GlModule } from "./gl/gl.module";

@Module({
  imports: [GlModule],
})
export class FinanceModule {}
