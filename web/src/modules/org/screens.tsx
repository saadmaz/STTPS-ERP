"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { ORG_SCREENS } from "./config";

export function OrgList({ entity }: { entity: string }) {
  const config = ORG_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function OrgRecord({ entity, id }: { entity: string; id: string }) {
  const config = ORG_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
