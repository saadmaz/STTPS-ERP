import { HrList } from "@/modules/hr/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <HrList entity={entity} />;
}
