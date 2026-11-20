import { SupportList } from "@/modules/support/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <SupportList entity={entity} />;
}
