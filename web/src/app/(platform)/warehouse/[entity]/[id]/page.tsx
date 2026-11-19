import { WarehouseRecord } from "@/modules/warehouse/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <WarehouseRecord entity={entity} id={id} />;
}
