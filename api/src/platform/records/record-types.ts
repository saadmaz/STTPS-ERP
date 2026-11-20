/**
 * Registry of record types ("org.branch", "procurement.requisition" …) that
 * the generic record features (comments, tags, links, files, activity,
 * custom fields, search) work with. Each type says where its records live
 * and which permission lets a user see them, so those features can enforce
 * the same access rules as the owning module.
 */
export interface RecordType {
  /** `<module>.<entity>`, e.g. "org.branch". */
  type: string;
  module: string;
  label: string;
  collection: string;
  viewPermission: string;
  editPermission: string;
  /** Builds the staff-app link for a record id. */
  link: (id: string) => string;
}

const registry = new Map<string, RecordType>();

export function registerRecordType(type: RecordType): void {
  registry.set(type.type, type);
}

export function recordType(type: string): RecordType | undefined {
  return registry.get(type);
}

export function recordTypes(): RecordType[] {
  return [...registry.values()].sort((a, b) => a.type.localeCompare(b.type));
}
