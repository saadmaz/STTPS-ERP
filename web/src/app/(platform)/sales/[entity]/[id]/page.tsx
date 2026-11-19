import { SalesRecord } from "@/modules/sales/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <SalesRecord entity={entity} id={id} />;
}
