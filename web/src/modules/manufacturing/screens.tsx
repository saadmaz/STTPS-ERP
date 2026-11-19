"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { MANUFACTURING_SCREENS } from "./config";

export function ManufacturingList({ entity }: { entity: string }) {
  const config = MANUFACTURING_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function ManufacturingRecord({ entity, id }: { entity: string; id: string }) {
  const config = MANUFACTURING_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
