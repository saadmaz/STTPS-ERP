import { BadRequestException } from "@nestjs/common";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { Filter } from "../data/repository.js";

/** Query string accepted by every list endpoint. */
export class ListQueryDto {
  @ApiPropertyOptional({ description: "Page size (1-200)", default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: "Id of the last item of the previous page" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ description: "Case-insensitive text search" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: "Equality filters: field:value,field2:value2 (true, false and null are typed)" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  where?: string;

  @ApiPropertyOptional({ description: "Sort: field or -field for descending; comma-separated" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sort?: string;

  @ApiPropertyOptional({ description: "Include archived records" })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  includeArchived?: boolean;
}

export function parseWhere(where: string | undefined, allowed: string[]): Filter[] {
  if (!where) return [];
  return where.split(",").map((part) => {
    const index = part.indexOf(":");
    if (index <= 0) throw new BadRequestException(`Invalid filter "${part}"; use field:value`);
    const field = part.slice(0, index).trim();
    const raw = decodeURIComponent(part.slice(index + 1).trim());
    if (!allowed.includes(field)) throw new BadRequestException(`Cannot filter on "${field}"`);
    const value = raw === "true" ? true : raw === "false" ? false : raw === "null" ? null : raw;
    return [field, "==", value] as Filter;
  });
}

export function parseSort(sort: string | undefined, allowed: string[]): { field: string; direction: "asc" | "desc" }[] | undefined {
  if (!sort) return undefined;
  return sort.split(",").map((part) => {
    const descending = part.startsWith("-");
    const field = descending ? part.slice(1) : part;
    if (!allowed.includes(field)) throw new BadRequestException(`Cannot sort on "${field}"`);
    return { field, direction: descending ? "desc" : "asc" };
  });
}
