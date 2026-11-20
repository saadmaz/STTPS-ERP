import { AiRecord } from "@/modules/ai/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <AiRecord entity={entity} id={id} />;
}
