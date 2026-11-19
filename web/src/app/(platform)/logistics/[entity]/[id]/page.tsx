import { LogisticsRecord } from "@/modules/logistics/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <LogisticsRecord entity={entity} id={id} />;
}
