import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { DOCUMENT_CATEGORIES } from "./documents.models.js";

export class CreateFolderDto {
  @ApiProperty() @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() parentId?: string;
}
export class UpdateFolderDto extends PartialType(CreateFolderDto) {}

export class CreateDocumentDto {
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiProperty({ enum: DOCUMENT_CATEGORIES }) @IsIn(DOCUMENT_CATEGORIES) category!: (typeof DOCUMENT_CATEGORIES)[number];
  @IsOptional() @IsString() folderId?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsBoolean() signatureRequired?: boolean;
  @IsOptional() @IsBoolean() isTemplate?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}

export class CreateFromTemplateDto {
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() folderId?: string;
}

export class RecordSignatureOutcomeDto {
  @ApiProperty({ enum: ["signed", "declined"] }) @IsIn(["signed", "declined"]) outcome!: "signed" | "declined";
}

export class RejectDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) comment?: string;
}
