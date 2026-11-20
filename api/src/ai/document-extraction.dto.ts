import { ApiProperty, PartialType } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { DOCUMENT_TYPES } from "./document-extraction.models.js";

const CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;

export class ExtractDocumentDto {
  @ApiProperty({ enum: DOCUMENT_TYPES }) @IsIn(DOCUMENT_TYPES) docType!: (typeof DOCUMENT_TYPES)[number];
  @ApiProperty() @IsString() @Length(1, 200) fileName!: string;
  @ApiProperty({ enum: CONTENT_TYPES }) @IsIn(CONTENT_TYPES) contentType!: (typeof CONTENT_TYPES)[number];
  @ApiProperty({ description: "Base64-encoded file content, capped at ~6MB raw" }) @IsString() @MaxLength(8_500_000) fileBase64!: string;
}

export class ReviewExtractionDto {
  @ApiProperty() @IsObject() reviewedData!: Record<string, unknown>;
}
export class UpdateDocumentExtractionDto extends PartialType(ReviewExtractionDto) {}

export class CreateDraftDto {
  @ApiProperty({ description: "Required for a receipt draft: an existing expense category id" }) @IsOptional() @IsString() categoryId?: string;
}
