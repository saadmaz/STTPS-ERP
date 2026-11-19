"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { TASKS_SCREENS } from "./config";

export function TasksList({ entity }: { entity: string }) {
  const config = TASKS_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function TasksRecord({ entity, id }: { entity: string; id: string }) {
  const config = TASKS_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
