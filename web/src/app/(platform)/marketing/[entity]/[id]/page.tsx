import { MarketingRecord } from "@/modules/marketing/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <MarketingRecord entity={entity} id={id} />;
}
