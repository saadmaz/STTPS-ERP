import { CrmRecord } from "@/modules/crm/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <CrmRecord entity={entity} id={id} />;
}
