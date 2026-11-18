import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { PermissionSyncService } from "../common/permission-sync.service.js";

@Module({
  controllers: [AdminController],
  providers: [AdminService, PermissionSyncService],
})
export class AdminModule {}
