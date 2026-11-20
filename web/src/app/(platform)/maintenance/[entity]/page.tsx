import { MaintenanceList } from "@/modules/maintenance/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <MaintenanceList entity={entity} />;
}
