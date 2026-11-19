"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { LOGISTICS_SCREENS } from "./config";

export function LogisticsList({ entity }: { entity: string }) {
  const config = LOGISTICS_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function LogisticsRecord({ entity, id }: { entity: string; id: string }) {
  const config = LOGISTICS_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
