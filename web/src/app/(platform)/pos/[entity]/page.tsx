import { PosList } from "@/modules/pos/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <PosList entity={entity} />;
}
