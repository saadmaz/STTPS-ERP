import { Module } from "@nestjs/common";
import { ArController } from "./ar.controller";
import { ArService } from "./ar.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ArController],
  providers: [ArService],
})
export class ArModule {}
