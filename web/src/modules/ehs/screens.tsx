"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { EHS_SCREENS } from "./config";

export function EhsList({ entity }: { entity: string }) {
  const config = EHS_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function EhsRecord({ entity, id }: { entity: string; id: string }) {
  const config = EHS_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
