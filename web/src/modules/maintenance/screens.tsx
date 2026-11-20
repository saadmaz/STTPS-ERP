"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { MAINTENANCE_SCREENS } from "./config";

export function MaintenanceList({ entity }: { entity: string }) {
  const config = MAINTENANCE_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function MaintenanceRecord({ entity, id }: { entity: string; id: string }) {
  const config = MAINTENANCE_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
