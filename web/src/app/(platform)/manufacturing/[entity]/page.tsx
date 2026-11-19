import { ManufacturingList } from "@/modules/manufacturing/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <ManufacturingList entity={entity} />;
}
