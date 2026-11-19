"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { CALENDAR_SCREENS } from "./config";

export function CalendarList({ entity }: { entity: string }) {
  const config = CALENDAR_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function CalendarRecord({ entity, id }: { entity: string; id: string }) {
  const config = CALENDAR_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
