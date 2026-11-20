"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { AUTOMATION_SCREENS } from "./config";

export function AutomationList({ entity }: { entity: string }) {
  const config = AUTOMATION_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function AutomationRecord({ entity, id }: { entity: string; id: string }) {
  const config = AUTOMATION_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
