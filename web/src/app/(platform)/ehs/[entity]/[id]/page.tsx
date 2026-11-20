import { EhsRecord } from "@/modules/ehs/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <EhsRecord entity={entity} id={id} />;
}
