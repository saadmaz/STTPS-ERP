import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PermissionSyncService } from "../common/permission-sync.service";

@Module({
  controllers: [AdminController],
  providers: [AdminService, PermissionSyncService],
})
export class AdminModule {}
