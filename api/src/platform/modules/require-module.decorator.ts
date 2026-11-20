import { SetMetadata } from "@nestjs/common";

export const MODULE_KEY = "required_module";
/** The controller belongs to this module; requests fail with 403 while the tenant has it switched off. */
export const RequireModule = (key: string) => SetMetadata(MODULE_KEY, key);
