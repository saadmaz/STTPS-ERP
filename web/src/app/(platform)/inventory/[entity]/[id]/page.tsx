import { InventoryRecord } from "@/modules/inventory/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <InventoryRecord entity={entity} id={id} />;
}
