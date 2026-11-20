import { SupportRecord } from "@/modules/support/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <SupportRecord entity={entity} id={id} />;
}
