"use client";

import { MasterRecordPage } from "@/components/master/MasterData";
import { customFields } from "./config";

export function CustomFieldRecord({ id }: { id: string }) {
  return <MasterRecordPage config={customFields} id={id} />;
}
