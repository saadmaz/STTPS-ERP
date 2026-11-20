import { InventoryList } from "@/modules/inventory/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <InventoryList entity={entity} />;
}
