import { ProcurementRecord } from "@/modules/procurement/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <ProcurementRecord entity={entity} id={id} />;
}
