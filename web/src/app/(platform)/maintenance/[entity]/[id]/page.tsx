import { MaintenanceRecord } from "@/modules/maintenance/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <MaintenanceRecord entity={entity} id={id} />;
}
