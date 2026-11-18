import { BadRequestException, Injectable } from "@nestjs/common";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from "class-validator";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { AuditService } from "../audit/audit.service.js";
import { NewDoc, Patch } from "../data/repository.js";
import { UniqueService } from "../data/unique.service.js";
import { MasterDataService } from "../crud/master-data.service.js";
import { recordType } from "../records/record-types.js";

export { CUSTOM_FIELDS_COLLECTION, CUSTOM_FIELD_TYPES, CustomFieldValidator } from "./custom-field-validator.js";
export type { CustomFieldDefinitionDoc, CustomFieldType } from "./custom-field-validator.js";
import { CUSTOM_FIELDS_COLLECTION, CUSTOM_FIELD_TYPES, CustomFieldDefinitionDoc, CustomFieldType } from "./custom-field-validator.js";

export class CreateCustomFieldDto {
  @ApiProperty({ example: "org.branch" }) @IsString() @Matches(/^[a-z]+\.[a-zA-Z]+$/) entityType!: string;
  @ApiProperty({ example: "region" }) @IsString() @Matches(/^[a-z][a-zA-Z0-9]{0,39}$/, { message: "key is camelCase letters and digits" }) key!: string;
  @ApiProperty() @IsString() @Length(1, 80) label!: string;
  @ApiProperty({ enum: CUSTOM_FIELD_TYPES }) @IsIn(CUSTOM_FIELD_TYPES) type!: CustomFieldType;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) options?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() required?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) helpText?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateCustomFieldDto extends PartialType(CreateCustomFieldDto) {}

@Injectable()
export class CustomFieldsService extends MasterDataService<CustomFieldDefinitionDoc, CreateCustomFieldDto, UpdateCustomFieldDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "platform",
      entity: "customField",
      label: "Custom field",
      collection: CUSTOM_FIELDS_COLLECTION,
      permission: "platform.customField",
      route: "/settings/custom-fields",
      uniqueFields: ["uniqueKey"],
      filterFields: ["entityType", "isActive"],
      sortFields: ["order", "label", "createdAt"],
      searchFields: ["label", "key", "entityType"],
      customFields: false,
      searchable: false,
    });
  }

  protected toNew(dto: CreateCustomFieldDto): NewDoc<CustomFieldDefinitionDoc> {
    if (!recordType(dto.entityType)) throw new BadRequestException(`Unknown record type ${dto.entityType}`);
    if ((dto.type === "select" || dto.type === "multiselect") && !dto.options?.length) {
      throw new BadRequestException("Select fields need options");
    }
    return {
      entityType: dto.entityType,
      key: dto.key,
      uniqueKey: `${dto.entityType}:${dto.key}`,
      label: dto.label,
      type: dto.type,
      options: dto.options ?? [],
      required: dto.required ?? false,
      helpText: dto.helpText ?? null,
      order: dto.order ?? 100,
      isActive: dto.isActive ?? true,
    };
  }

  protected toPatch(dto: UpdateCustomFieldDto): Patch<CustomFieldDefinitionDoc> {
    // Type, key and record type are fixed once data may exist under them.
    const { entityType: _e, key: _k, type: _t, ...rest } = dto;
    return rest as Patch<CustomFieldDefinitionDoc>;
  }
}
