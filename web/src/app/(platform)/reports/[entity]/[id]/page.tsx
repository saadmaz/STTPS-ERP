import { ReportsRecord } from "@/modules/reports/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <ReportsRecord entity={entity} id={id} />;
}
