import { QualityList } from "@/modules/quality/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <QualityList entity={entity} />;
}
