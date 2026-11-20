import { PosRecord } from "@/modules/pos/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <PosRecord entity={entity} id={id} />;
}
