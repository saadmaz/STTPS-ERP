import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from "class-validator";
import { Ctx, hasPermission, RequestContext } from "../context/request-context.js";
import { createMasterDataController } from "../crud/master-data.controller.js";
import { CreateCustomFieldDto, CustomFieldsService, UpdateCustomFieldDto } from "../custom-fields/custom-fields.js";
import { FilesService } from "../files/files.service.js";
import { SearchIndex } from "../search/search-index.js";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { RecordsService } from "./records.service.js";
import { recordTypes } from "./record-types.js";

const TYPE = /^[a-z]+\.[a-zA-Z]+$/;

export class CommentBodyDto {
  @IsString() @Length(1, 10_000) body!: string;
}

export class TagsDto {
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) tags!: string[];
}

export class LinkDto {
  @IsString() @Matches(TYPE) toType!: string;
  @IsString() @Length(1, 128) toId!: string;
  @IsString() @Matches(/^[a-z_]{1,40}$/) relation!: string;
}

export class SavedViewDto {
  @IsString() @Matches(TYPE) entityType!: string;
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsBoolean() shared?: boolean;
  @IsObject() config!: Record<string, unknown>;
}

export class UpdateSavedViewDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsBoolean() shared?: boolean;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class UploadRequestDto {
  @IsString() @Matches(TYPE) entityType!: string;
  @IsString() @Length(1, 128) entityId!: string;
  @IsString() @Length(1, 255) name!: string;
  @IsString() @MaxLength(150) contentType!: string;
  @IsInt() @Min(1) @Max(5 * 1024 * 1024 * 1024) size!: number;
  @IsOptional() @IsString() replacesFileId?: string;
}

export const CustomFieldsController = createMasterDataController({
  path: "settings/custom-fields",
  tag: "Settings: Custom fields",
  module: "platform",
  permission: "platform.customField",
  service: CustomFieldsService,
  createDto: CreateCustomFieldDto,
  updateDto: UpdateCustomFieldDto,
});

/** Features shared by every record type: comments, tags, links, files, activity (blueprint §34). */
@ApiTags("Records")
@ApiBearerAuth()
@Controller("records")
export class RecordsController {
  constructor(
    private readonly records: RecordsService,
    private readonly files: FilesService,
    private readonly customFields: CustomFieldsService,
  ) {}

  @Get("types")
  @ApiOperation({ summary: "Record types the user can see" })
  types(@Ctx() ctx: RequestContext) {
    return recordTypes()
      .filter((t) => hasPermission(ctx, t.viewPermission))
      .map(({ type, module, label }) => ({ type, module, label }));
  }

  @Get("tags")
  @ApiOperation({ summary: "Tags in use, for autocomplete" })
  tagSuggestions(@Ctx() ctx: RequestContext) {
    return this.records.tagSuggestions(ctx);
  }

  @Get("tagged/:tag")
  tagged(@Ctx() ctx: RequestContext, @Param("tag") tag: string) {
    return this.records.taggedWith(ctx, tag);
  }

  @Get(":type/:id/custom-fields")
  @ApiOperation({ summary: "Custom field definitions that apply to this record type" })
  async fieldDefinitions(@Ctx() ctx: RequestContext, @Param("type") type: string) {
    const page = await this.customFields.list(ctx, { where: `entityType:${type},isActive:true`, sort: "order,label", limit: 200 });
    return page.items;
  }

  @Get(":type/:id/comments")
  comments(@Ctx() ctx: RequestContext, @Param("type") type: string, @Param("id") id: string) {
    return this.records.listComments(ctx, type, id);
  }

  @Post(":type/:id/comments")
  addComment(@Ctx() ctx: RequestContext, @Param("type") type: string, @Param("id") id: string, @Body() dto: CommentBodyDto) {
    return this.records.addComment(ctx, type, id, dto.body);
  }

  @Get(":type/:id/tags")
  tags(@Ctx() ctx: RequestContext, @Param("type") type: string, @Param("id") id: string) {
    return this.records.getTags(ctx, type, id);
  }

  @Put(":type/:id/tags")
  setTags(@Ctx() ctx: RequestContext, @Param("type") type: string, @Param("id") id: string, @Body() dto: TagsDto) {
    return this.records.setTags(ctx, type, id, dto.tags);
  }

  @Get(":type/:id/related")
  related(@Ctx() ctx: RequestContext, @Param("type") type: string, @Param("id") id: string) {
    return this.records.related(ctx, type, id);
  }

  @Post(":type/:id/links")
  link(@Ctx() ctx: RequestContext, @Param("type") type: string, @Param("id") id: string, @Body() dto: LinkDto) {
    return this.records.link(ctx, { type, id }, { type: dto.toType, id: dto.toId }, dto.relation);
  }

  @Get(":type/:id/activity")
  activity(@Ctx() ctx: RequestContext, @Param("type") type: string, @Param("id") id: string) {
    return this.records.activity(ctx, type, id);
  }

  @Get(":type/:id/files")
  recordFiles(@Ctx() ctx: RequestContext, @Param("type") type: string, @Param("id") id: string, @Query("all") all?: string) {
    return this.files.forRecord(ctx, type, id, all === "true");
  }
}

@ApiTags("Records")
@ApiBearerAuth()
@Controller()
export class RecordItemsController {
  private readonly search: SearchIndex;

  constructor(
    private readonly records: RecordsService,
    private readonly files: FilesService,
    firestore: FirestoreService,
  ) {
    this.search = new SearchIndex(firestore);
  }

  @Get("search")
  @ApiOperation({ summary: "Global search across every record type the user may view" })
  find(@Ctx() ctx: RequestContext, @Query("q") q = "", @Query("types") types?: string, @Query("limit") limit?: string) {
    return this.search.search(ctx, q.slice(0, 100), { types: types ? types.split(",") : undefined, limit: limit ? Number(limit) : undefined });
  }

  @Patch("comments/:id")
  editComment(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() dto: CommentBodyDto) {
    return this.records.editComment(ctx, id, dto.body);
  }

  @Delete("comments/:id")
  deleteComment(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.records.deleteComment(ctx, id);
  }

  @Delete("links/:id")
  unlink(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.records.unlink(ctx, id);
  }

  @Get("views")
  @ApiOperation({ summary: "My saved views and shared views for a record type" })
  views(@Ctx() ctx: RequestContext, @Query("entityType") entityType: string) {
    return this.records.listViews(ctx, entityType);
  }

  @Post("views")
  createView(@Ctx() ctx: RequestContext, @Body() dto: SavedViewDto) {
    return this.records.createView(ctx, dto);
  }

  @Patch("views/:id")
  updateView(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() dto: UpdateSavedViewDto) {
    return this.records.updateView(ctx, id, dto);
  }

  @Delete("views/:id")
  deleteView(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.records.deleteView(ctx, id);
  }

  @Post("files/upload-url")
  @ApiOperation({ summary: "Start an upload: returns a presigned PUT URL valid for 15 minutes" })
  requestUpload(@Ctx() ctx: RequestContext, @Body() dto: UploadRequestDto) {
    return this.files.requestUpload(ctx, dto);
  }

  @Post("files/:id/complete")
  @HttpCode(200)
  complete(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.files.completeUpload(ctx, id);
  }

  @Get("files/:id/download")
  download(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.files.downloadUrl(ctx, id);
  }

  @Delete("files/:id")
  removeFile(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.files.remove(ctx, id);
  }
}
