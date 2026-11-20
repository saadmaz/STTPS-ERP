import { CrmList } from "@/modules/crm/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <CrmList entity={entity} />;
}
