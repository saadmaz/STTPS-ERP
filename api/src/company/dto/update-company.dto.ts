import { OmitType, PartialType } from "@nestjs/swagger";
import { CreateCompanyDto } from "./create-company.dto.js";

/** Company fields that may change after creation. The code is part of the company id and cannot change. */
export class UpdateCompanyDto extends PartialType(OmitType(CreateCompanyDto, ["code"] as const)) {}
