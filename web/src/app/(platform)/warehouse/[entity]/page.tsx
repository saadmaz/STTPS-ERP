import { WarehouseList } from "@/modules/warehouse/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <WarehouseList entity={entity} />;
}
