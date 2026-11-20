import { ProcurementList } from "@/modules/procurement/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <ProcurementList entity={entity} />;
}
