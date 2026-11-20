import { AiList } from "@/modules/ai/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <AiList entity={entity} />;
}
