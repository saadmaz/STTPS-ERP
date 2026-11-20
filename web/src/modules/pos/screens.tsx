"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { POS_SCREENS } from "./config";

export function PosList({ entity }: { entity: string }) {
  const config = POS_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function PosRecord({ entity, id }: { entity: string; id: string }) {
  const config = POS_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
