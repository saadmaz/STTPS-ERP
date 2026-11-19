"use client";

import { MasterListPage } from "@/components/master/MasterData";
import { customFields } from "@/modules/settings/config";

export default function CustomFieldsPage() {
  return <MasterListPage config={customFields} />;
}
