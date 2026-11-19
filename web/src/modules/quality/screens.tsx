"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { QUALITY_SCREENS } from "./config";

export function QualityList({ entity }: { entity: string }) {
  const config = QUALITY_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function QualityRecord({ entity, id }: { entity: string; id: string }) {
  const config = QUALITY_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
