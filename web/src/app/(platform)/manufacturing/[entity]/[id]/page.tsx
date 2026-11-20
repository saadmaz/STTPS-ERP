import { ManufacturingRecord } from "@/modules/manufacturing/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <ManufacturingRecord entity={entity} id={id} />;
}
