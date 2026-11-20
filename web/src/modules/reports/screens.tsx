"use client";

import { notFound } from "next/navigation";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { REPORTS_SCREENS } from "./config";

export function ReportsList({ entity }: { entity: string }) {
  const config = REPORTS_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function ReportsRecord({ entity, id }: { entity: string; id: string }) {
  const config = REPORTS_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}
