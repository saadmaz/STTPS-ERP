import { HrRecord } from "@/modules/hr/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <HrRecord entity={entity} id={id} />;
}
