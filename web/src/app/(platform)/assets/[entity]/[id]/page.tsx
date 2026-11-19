import { AssetsRecord } from "@/modules/finance/assets";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <AssetsRecord entity={entity} id={id} />;
}
