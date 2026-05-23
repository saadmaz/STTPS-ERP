import { Controller, Get, Post, Put, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { UserService } from "./user.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("Users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  findAll(@CurrentUser("tenantId") tenantId: string) {
    return this.userService.findAll(tenantId);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser("tenantId") tenantId: string) {
    return this.userService.findById(id, tenantId);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser("tenantId") tenantId: string) {
    return this.userService.create(dto, tenantId);
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @Body() dto: Partial<CreateUserDto>,
    @CurrentUser("tenantId") tenantId: string,
  ) {
    return this.userService.update(id, tenantId, dto);
  }
}
