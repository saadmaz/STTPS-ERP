"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { PRODUCT_SCREENS } from "./config";

export function ProductList({ entity }: { entity: string }) {
  const config = PRODUCT_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function ProductRecord({ entity, id }: { entity: string; id: string }) {
  const config = PRODUCT_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
