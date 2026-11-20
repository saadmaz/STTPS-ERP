import { MarketingList } from "@/modules/marketing/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <MarketingList entity={entity} />;
}
