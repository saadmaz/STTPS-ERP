import { LogisticsList } from "@/modules/logistics/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <LogisticsList entity={entity} />;
}
