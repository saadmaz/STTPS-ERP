import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Type,
  ValidationPipe,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../context/request-context.js";
import { RequireModule } from "../modules/require-module.decorator.js";
import { ListQueryDto } from "./list-query.dto.js";
import { MasterDataService } from "./master-data.service.js";

export class ArchiveDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Validates a body or query against an explicit class (needed because mixin parameter types are erased). */
export function validated(type: Type<unknown>): ValidationPipe {
  return new ValidationPipe({
    expectedType: type,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
}

/** Reads `If-Match: <version>` for optimistic concurrency. */
export function parseVersion(ifMatch: string | undefined): number | undefined {
  if (!ifMatch) return undefined;
  const version = Number(ifMatch.replace(/"/g, ""));
  return Number.isInteger(version) ? version : undefined;
}

export interface MasterDataControllerOptions {
  /** Route path, e.g. "org/branches". */
  path: string;
  /** Swagger tag. */
  tag: string;
  /** Module key checked for activation, e.g. "org". */
  module: string;
  /** Permission prefix, e.g. "org.branch" gives org.branch.view / create / edit / delete. */
  permission: string;
  service: Type<MasterDataService<never, never, never>> | Type<unknown>;
  createDto: Type<unknown>;
  updateDto: Type<unknown>;
}

/**
 * Builds a standard controller: list, get, create, update (If-Match
 * concurrency), archive, restore and audit history. Every route is checked
 * against module activation and `<permission>.<action>`.
 */
export function createMasterDataController(options: MasterDataControllerOptions): Type<unknown> {
  const p = options.permission;

  @ApiTags(options.tag)
  @ApiBearerAuth()
  @RequireModule(options.module)
  @Controller(options.path)
  class MasterDataController {
    constructor(@Inject(options.service) readonly service: MasterDataService<never, object, object>) {}

    @Get()
    @RequirePermission(`${p}.view`)
    @ApiOperation({ summary: "List" })
    list(@Ctx() ctx: RequestContext, @Query(validated(ListQueryDto)) query: ListQueryDto) {
      return this.service.list(ctx, query);
    }

    @Get(":id")
    @RequirePermission(`${p}.view`)
    @ApiOperation({ summary: "Get one" })
    get(@Ctx() ctx: RequestContext, @Param("id") id: string) {
      return this.service.get(ctx, id);
    }

    @Get(":id/history")
    @RequirePermission(`${p}.view`)
    @ApiOperation({ summary: "Audit history" })
    history(@Ctx() ctx: RequestContext, @Param("id") id: string) {
      return this.service.history(ctx, id);
    }

    @Post()
    @RequirePermission(`${p}.create`)
    @ApiOperation({ summary: "Create" })
    @ApiBody({ type: options.createDto })
    create(@Ctx() ctx: RequestContext, @Body(validated(options.createDto)) dto: object) {
      return this.service.create(ctx, dto);
    }

    @Patch(":id")
    @RequirePermission(`${p}.edit`)
    @ApiOperation({ summary: "Update; send If-Match: <version> to avoid overwriting concurrent changes" })
    @ApiBody({ type: options.updateDto })
    update(
      @Ctx() ctx: RequestContext,
      @Param("id") id: string,
      @Body(validated(options.updateDto)) dto: object,
      @Headers("if-match") ifMatch?: string,
    ) {
      return this.service.update(ctx, id, dto, parseVersion(ifMatch));
    }

    @Post(":id/archive")
    @HttpCode(200)
    @RequirePermission(`${p}.delete`)
    @ApiOperation({ summary: "Archive (soft delete)" })
    archive(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ArchiveDto)) dto: ArchiveDto) {
      return this.service.archive(ctx, id, dto.reason);
    }

    @Post(":id/restore")
    @HttpCode(200)
    @RequirePermission(`${p}.delete`)
    @ApiOperation({ summary: "Restore an archived record" })
    restore(@Ctx() ctx: RequestContext, @Param("id") id: string) {
      return this.service.restore(ctx, id);
    }
  }

  Object.defineProperty(MasterDataController, "name", { value: `${options.tag.replace(/\W/g, "")}Controller` });
  return MasterDataController;
}
