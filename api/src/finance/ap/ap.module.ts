import { Module } from "@nestjs/common";
import { ApController } from "./ap.controller";
import { ApService } from "./ap.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ApController],
  providers: [ApService],
})
export class ApModule {}
