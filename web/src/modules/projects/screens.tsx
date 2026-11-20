"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { PROJECTS_SCREENS } from "./config";

export function ProjectsList({ entity }: { entity: string }) {
  const config = PROJECTS_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function ProjectsRecord({ entity, id }: { entity: string; id: string }) {
  const config = PROJECTS_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
