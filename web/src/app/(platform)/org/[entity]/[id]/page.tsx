import { OrgRecord } from "@/modules/org/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <OrgRecord entity={entity} id={id} />;
}
