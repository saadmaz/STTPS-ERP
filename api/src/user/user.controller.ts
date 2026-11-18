import { Controller, Get, Post, Put, Param, Body } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { UserService } from "./user.service.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";

@ApiTags("Users")
@ApiBearerAuth()
@Controller("users")
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  @RequirePermission("platform.user.view")
  findAll(@CurrentUser("tenantId") tenantId: string) {
    return this.userService.findAll(tenantId);
  }

  @Get(":id")
  @RequirePermission("platform.user.view")
  findOne(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.userService.findById(id, tenantId);
  }

  @Post()
  @RequirePermission("platform.user.create")
  create(@Body() dto: CreateUserDto, @CurrentUser("tenantId") tenantId: string) {
    return this.userService.create(dto, tenantId);
  }

  @Put(":id")
  @RequirePermission("platform.user.edit")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser("tenantId") tenantId: string) {
    return this.userService.update(id, tenantId, dto);
  }
}
