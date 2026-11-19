"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { DOCUMENTS_SCREENS } from "./config";

export function DocumentsList({ entity }: { entity: string }) {
  const config = DOCUMENTS_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function DocumentsRecord({ entity, id }: { entity: string; id: string }) {
  const config = DOCUMENTS_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
