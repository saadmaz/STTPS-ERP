import { ReportsList } from "@/modules/reports/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <ReportsList entity={entity} />;
}
