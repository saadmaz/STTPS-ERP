"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { WAREHOUSE_SCREENS } from "./config";

export function WarehouseList({ entity }: { entity: string }) {
  const config = WAREHOUSE_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function WarehouseRecord({ entity, id }: { entity: string; id: string }) {
  const config = WAREHOUSE_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
