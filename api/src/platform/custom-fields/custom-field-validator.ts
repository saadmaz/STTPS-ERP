import { BadRequestException } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { Scope } from "../context/request-context.js";
import { BaseDoc } from "../data/repository.js";

export const CUSTOM_FIELDS_COLLECTION = "customFieldDefinitions";

export const CUSTOM_FIELD_TYPES = ["text", "longText", "number", "decimal", "date", "boolean", "select", "multiselect", "user", "url", "email"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomFieldDefinitionDoc extends BaseDoc {
  entityType: string;
  /** Key in the record's `customFields` map, e.g. "region". */
  key: string;
  /** `${entityType}:${key}`, unique per company. */
  uniqueKey: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  helpText: string | null;
  order: number;
  isActive: boolean;
}

/** Validates and normalises a record's `customFields` against the company's definitions. */
export class CustomFieldValidator {
  constructor(private readonly firestore: FirestoreService) {}

  async definitions(scope: Scope, entityType: string, tx?: Transaction): Promise<CustomFieldDefinitionDoc[]> {
    const q = this.firestore
      .collection<CustomFieldDefinitionDoc>(CUSTOM_FIELDS_COLLECTION)
      .where("companyId", "==", scope.companyId)
      .where("entityType", "==", entityType);
    const snap = tx ? await tx.get(q) : await q.get();
    return snap.docs.map((d) => d.data()).filter((d) => d.archivedAt == null && d.isActive);
  }

  /**
   * Returns the merged, validated map. `incoming` keys set to null clear a
   * value. Unknown keys and wrong types are rejected; required fields must be
   * present after the merge.
   */
  async validate(
    tx: Transaction,
    scope: Scope,
    entityType: string,
    incoming: Record<string, unknown> | undefined,
    existing: Record<string, unknown> | undefined,
  ): Promise<Record<string, unknown>> {
    const defs = await this.definitions(scope, entityType, tx);
    const byKey = new Map(defs.map((d) => [d.key, d]));
    const merged: Record<string, unknown> = { ...(existing ?? {}) };
    for (const [key, value] of Object.entries(incoming ?? {})) {
      const def = byKey.get(key);
      if (!def) throw new BadRequestException(`Unknown custom field "${key}"`);
      if (value === null || value === "") {
        delete merged[key];
        continue;
      }
      merged[key] = coerce(def, value);
    }
    for (const def of defs) {
      if (def.required && (merged[def.key] === undefined || merged[def.key] === null)) {
        throw new BadRequestException(`${def.label} is required`);
      }
    }
    return merged;
  }
}

function coerce(def: CustomFieldDefinitionDoc, value: unknown): unknown {
  const fail = (): never => {
    throw new BadRequestException(`${def.label}: invalid ${def.type} value`);
  };
  switch (def.type) {
    case "text":
    case "user":
      return typeof value === "string" && value.length <= 500 ? value.trim() : fail();
    case "longText":
      return typeof value === "string" && value.length <= 10_000 ? value : fail();
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : fail();
    case "decimal":
      return typeof value === "string" && /^-?\d{1,15}(\.\d{1,6})?$/.test(value) ? value : fail();
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : fail();
    case "boolean":
      return typeof value === "boolean" ? value : fail();
    case "select":
      return typeof value === "string" && def.options.includes(value) ? value : fail();
    case "multiselect":
      return Array.isArray(value) && value.every((v) => typeof v === "string" && def.options.includes(v)) ? [...new Set(value)] : fail();
    case "url":
      return typeof value === "string" && /^https?:\/\/\S{1,2000}$/.test(value) ? value : fail();
    case "email":
      return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : fail();
    default:
      return fail();
  }
}
