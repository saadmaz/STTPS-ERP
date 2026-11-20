"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { AI_SCREENS } from "./document-extraction";

export function AiList({ entity }: { entity: string }) {
  const config = AI_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function AiRecord({ entity, id }: { entity: string; id: string }) {
  const config = AI_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
