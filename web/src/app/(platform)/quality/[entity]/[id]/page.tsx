import { QualityRecord } from "@/modules/quality/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <QualityRecord entity={entity} id={id} />;
}
