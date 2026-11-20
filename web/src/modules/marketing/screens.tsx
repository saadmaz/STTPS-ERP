"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { MARKETING_SCREENS } from "./config";

export function MarketingList({ entity }: { entity: string }) {
  const config = MARKETING_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function MarketingRecord({ entity, id }: { entity: string; id: string }) {
  const config = MARKETING_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
